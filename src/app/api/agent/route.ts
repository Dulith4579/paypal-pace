// src/app/api/agent/route.ts
// ============================================================
// PayPal Pace – Neuro-Symbolic Affordability Agent
// ============================================================
// POST /api/agent
//   1. SOLVE   – strategy-solver simulates every payment plan ×
//                subscription-pause combo against the savings goal
//                and ranks them with priority-mode weights.
//   2. PROPOSE – Gemma 2 (local, via Ollama) receives the top 3
//                verified options and, in one schema-constrained
//                JSON call, picks a recommendation and writes a
//                persona-specific title + rationale for each.
//   3. VERIFY  – a numeric firewall checks every number Gemma wrote
//                against solver output; hallucinated cards are
//                auto-corrected. Gemma's pick is accepted only if
//                it is within guardrails of the solver's optimum.
// GET /api/agent – warms the model so the first checkout is fast.
// ============================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyPurchase } from "@/lib/pacing";
import { userProfile } from "@/lib/mock-data";
import {
  solveStrategies,
  toStrategyCard,
  solverFacts,
  candidateFeasibility,
  isProtectedSub,
  FEASIBILITY_AI_BAND,
  allowedNumbers,
  findUnverifiedNumbers,
  firewallCheck,
  stripProductSpecs,
  PAUSEABLE_SUBS,
  normalizeContext,
  type Candidate,
  type PaceContext,
  type PriorityMode,
  type StrategyCard,
} from "@/lib/strategy-solver";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma2:2b";
// CPU inference runs ~16-20 tok/s; one JSON call is ~380 tokens (~33s warm).
// Ollama serves one generation at a time, so allow for a queued dashboard call.
const OLLAMA_TIMEOUT_MS = 90_000;
const CACHE_TTL_MS = 10 * 60_000;

// ─── In-flight dedupe + result cache ───────────────────────────
// On CPU, Ollama serves one generation at a time. Identical requests
// (React dev double-effects, quick re-clicks) share one Gemma call, and
// results are cached so switching back to a mode is instant.
type AgentPayload = Record<string, unknown> & { source: string };
const cache = new Map<string, { at: number; promise: Promise<AgentPayload> }>();

function cached(key: string, compute: () => Promise<AgentPayload>): Promise<AgentPayload> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = compute().then((res) => {
    // Don't keep fallback results — retry Gemma next time
    if (res.source === "deterministic") cache.delete(key);
    return res;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

const MODES: PriorityMode[] = ["career_growth", "balanced", "goal_shielding"];

// ─── Request Schema ────────────────────────────────────────────

const BodySchema = z.object({
  prompt: z.string(),
  productName: z.string().optional(),
  purchaseAmount: z.number().optional(),
  priorityMode: z
    .enum(["career_growth", "balanced", "goal_shielding"])
    .optional()
    .default("balanced"),
  // Shared app state (dashboard hibernations, goal contributions, plans owed)
  context: z
    .object({
      saved_extra: z.number().min(0).max(1_000_000).default(0),
      prior_payments: z
        .array(z.object({ day: z.number().int().min(0).max(730), amount: z.number().positive() }))
        .max(60)
        .default([]),
      already_paused: z.array(z.string()).max(10).default([]),
      extra_monthly: z.number().min(0).max(10_000).default(0),
    })
    .optional(),
});

// ─── Types ─────────────────────────────────────────────────────

/** Card shape shared with the checkout modal's engine-only fallback. */
type Strategy = StrategyCard;

interface AiTrace {
  model: string;
  latency_ms: number;
  eval_tokens: number;
  tokens_per_sec: number;
  candidates_evaluated: number;
  recommendation_by: "gemma" | "solver" | "solver_guardrail";
  gemma_pick?: string;
  verified_cards: number;
  corrected_cards: number;
  error?: string;
}

/** Glass-box payload: everything needed to show *why* this answer won. */
interface Reasoning {
  mode: PriorityMode;
  weights: { perDelayDay: number; perInterestDollar: number; perRecoveredDollar: number };
  context: { already_paused: string[]; saved_extra: number; prior_payment_total: number; remaining: number; days_left: number };
  candidates: {
    rank: number;
    key: string;
    plan_label: string;
    emoji: string;
    pauses: string[];
    new_pauses: string[];
    delay_days: number;
    interest: number;
    paused_monthly: number;
    score: number;
    parts: Candidate["score_parts"];
    shown_as?: "A" | "B" | "C";
  }[];
  firewall: {
    option: "A" | "B" | "C";
    key: string;
    status: "verified" | "corrected" | "missing" | "engine";
    gemma_title?: string;
    gemma_text?: string;
    reasons: string[];
    /** The solver's ground truth for this card, e.g. "delay 0 days · interest $0.00" */
    solver_facts?: string;
    /** Text shown to the user instead of Gemma's, when corrected */
    replacement_text?: string;
  }[];
  guardrail: {
    gemma_pick?: string;
    final_pick: "A" | "B" | "C";
    by: AiTrace["recommendation_by"];
    reason: string;
    gap?: number;
    threshold?: number;
  };
}

// ─── Mode personas ─────────────────────────────────────────────

const PERSONAS: Record<PriorityMode, { label: string; voice: string; rule: string }> = {
  career_growth: {
    label: "Career Growth",
    voice:
      "You are an ambitious career coach for a student developer. You see the purchase as an investment in earning power. Be energetic and confident.",
    rule: "Prefer the option with the lowest total cost so money goes to the career asset; a few days of goal delay is acceptable.",
  },
  balanced: {
    label: "Balanced",
    voice:
      "You are a calm, pragmatic financial co-pilot. Weigh cost, lifestyle and goal timing evenly. Be empathetic and concrete.",
    rule: "Prefer the option with the best trade-off between interest paid and goal delay.",
  },
  goal_shielding: {
    label: "Goal Shield",
    voice:
      "You are a protective savings guardian. The Japan trip deadline is sacred. Be cautious and direct about risk.",
    rule: "Prefer the option with zero goal delay, even if it costs some interest.",
  },
};

const LETTERS = ["A", "B", "C"] as const;

function describeForPrompt(c: Candidate, letter: string, feasibility: number): string {
  const kind =
    c.plan === "outright"
      ? "pays everything today, no interest"
      : c.plan === "pay_in_4"
      ? "4 payments every 2 weeks, no interest"
      : `monthly payments starting in 30 days, WITH interest`;
  return [
    `Option ${letter}: ${c.plan_label} (${kind})${c.pause_names.length ? ` + pause ${c.pause_names.join(", ")}` : ""}`,
    `  installment $${c.installment} x ${c.payment_count}, interest $${c.interest}, total $${c.total_cost}`,
    `  cash leaving before trip deadline: $${c.cash_out_before_deadline}`,
    `  subscriptions saved: $${c.paused_monthly}/mo`,
    `  trip delay: ${c.delay_days} days`,
    `  engine feasibility estimate: ${feasibility}%`,
  ].join("\n");
}

function buildPrompt(mode: PriorityMode, product: string, price: number, picks: Candidate[], ctx: PaceContext, dailySurplus: number): string {
  const p = PERSONAS[mode];
  const g = userProfile.primary_goal;
  const hibernated = PAUSEABLE_SUBS.filter((x) => ctx.already_paused.includes(x.id)).map((x) => x.name);
  return [
    p.voice,
    "",
    `User: ${userProfile.status}. Saving for ${g.name}: $${g.saved + ctx.saved_extra} of $${g.target}, deadline ${g.target_date}.`,
    ...(hibernated.length ? [`They already hibernated ${hibernated.join(", ")} from their dashboard.`] : []),
    `They want to buy: ${product} for $${price}.`,
    "",
    "Three options, all numbers already verified by our math engine:",
    ...picks.map((c, i) => describeForPrompt(c, LETTERS[i], candidateFeasibility(c, dailySurplus))),
    `${PAUSEABLE_SUBS.filter((x) => isProtectedSub(x.id)).map((x) => x.name).join(", ")} is a protected dev tool: never suggest pausing it.`,
    "",
    `Decision rule: ${p.rule}`,
    "",
    "Return JSON with cards in order A, B, C. For each option write a catchy 2-4 word title and a rationale of at most 2 short sentences in your persona's voice.",
    "Each rationale must describe ONLY its own option and mention that option's trip delay in days and its interest amount.",
    "Only use numbers that appear above. Then set recommended to the letter you pick.",
    `Also return: utility_narrative (1 sentence: why this ${product} matters for a ${userProfile.status} earning $${userProfile.monthly_net_inflow}/mo),`,
    `confidence (0-100, your judgment of your pick's feasibility, within ${FEASIBILITY_AI_BAND} points of its engine estimate), cash_flow_risk (1 sentence on cash strain before the deadline),`,
    `and subscription_notes: one note of max 8 words for each of ${PAUSEABLE_SUBS.map((x) => x.name).join(", ")} on why it can or cannot be paused.`,
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          option: { type: "string", enum: ["A", "B", "C"] },
          title: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["option", "title", "rationale"],
      },
    },
    recommended: { type: "string", enum: ["A", "B", "C"] },
    utility_narrative: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    cash_flow_risk: { type: "string" },
    subscription_notes: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          subscription: { type: "string", enum: PAUSEABLE_SUBS.map((x) => x.name) },
          note: { type: "string" },
        },
        required: ["subscription", "note"],
      },
    },
  },
  required: ["cards", "recommended", "utility_narrative", "confidence", "cash_flow_risk", "subscription_notes"],
};

interface GemmaOutput {
  cards: { option: string; title: string; rationale: string }[];
  recommended: string;
  utility_narrative?: string;
  confidence?: number;
  cash_flow_risk?: string;
  subscription_notes?: { subscription: string; note: string }[];
}

async function callGemma(prompt: string, signal: AbortSignal) {
  const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: RESPONSE_SCHEMA,
      keep_alive: "30m",
      options: { temperature: 0.6, top_p: 0.9, num_predict: 640 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const parsed = JSON.parse(data.response) as GemmaOutput;
  return {
    parsed,
    eval_tokens: data.eval_count ?? 0,
    tokens_per_sec: data.eval_duration ? (data.eval_count / (data.eval_duration / 1e9)) : 0,
  };
}

const toStrategy = toStrategyCard;

// ─── Handlers ──────────────────────────────────────────────────

export async function GET() {
  // Warm-up: load model weights into memory so the first real call is fast.
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: "", keep_alive: "30m" }),
      signal: AbortSignal.timeout(20_000),
    });
    return NextResponse.json({ warmed: true, model: OLLAMA_MODEL });
  } catch (err) {
    return NextResponse.json({ warmed: false, error: String(err) });
  }
}

export async function POST(request: Request) {
  const parsedBody = BodySchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }
  const { prompt, productName, purchaseAmount, priorityMode: mode } = parsedBody.data;
  const ctx = normalizeContext(parsedBody.data.context);
  ctx.already_paused.sort();
  const ctxKey = JSON.stringify(ctx);
  const keyOf = (m: PriorityMode) => `${m}|${productName}|${purchaseAmount}|${ctxKey}`;
  const payload = await cached(keyOf(mode), () => runAgent(prompt, productName, purchaseAmount, mode, ctx));

  // Pre-compute the other modes in the background (sequentially, so they
  // don't compete with each other on CPU) — mode switches become instant.
  if (payload.source !== "deterministic") {
    void (async () => {
      for (const m of MODES) {
        if (m !== mode) await cached(keyOf(m), () => runAgent(prompt, productName, purchaseAmount, m, ctx)).catch(() => {});
      }
    })();
  }
  return NextResponse.json(payload);
}

async function runAgent(
  prompt: string,
  productName: string | undefined,
  purchaseAmount: number | undefined,
  mode: PriorityMode,
  ctx: PaceContext
): Promise<AgentPayload> {
  const product = productName || "your purchase";
  const price = purchaseAmount || userProfile.cart_item.price;
  const { purchaseClass, label } = classifyPurchase(productName || prompt);

  // 1. SOLVE
  const solved = solveStrategies(price, mode, ctx);
  const { picks, candidates, context } = solved;
  const firewallLog: Reasoning["firewall"] = picks.map((c, i) => ({ option: LETTERS[i], key: c.key, status: "engine", reasons: [] }));
  const guardrail: Reasoning["guardrail"] = {
    final_pick: "A",
    by: "solver",
    reason: "Local model unavailable — the solver's lowest-score plan is recommended.",
  };
  const rankOf = (c: Candidate) => candidates.indexOf(c) + 1;

  const trace: AiTrace = {
    model: OLLAMA_MODEL,
    latency_ms: 0,
    eval_tokens: 0,
    tokens_per_sec: 0,
    candidates_evaluated: candidates.length,
    recommendation_by: "solver",
    verified_cards: 0,
    corrected_cards: 0,
  };

  // Same formula the dashboard's impulse simulator uses (feasibilityScore)
  const feasOf = (c: Candidate) => candidateFeasibility(c, context.daily_surplus);
  let insights: {
    utility_narrative: string;
    confidence: number;
    /** Engine feasibility for the recommended plan; the model may move it ±FEASIBILITY_AI_BAND. */
    confidence_baseline: number;
    cash_flow_risk: string;
    subscription_notes: { id: string; subscription: string; note: string }[];
    source: "gemma" | "engine";
  } = {
    utility_narrative: `${product} is tagged a ${label} for a ${userProfile.status} — it supports earning capacity, not just consumption.`,
    confidence: feasOf(picks[0]),
    confidence_baseline: feasOf(picks[0]),
    cash_flow_risk: `$${picks[0].cash_out_before_deadline} leaves your account before ${userProfile.primary_goal.target_date} under the top plan.`,
    subscription_notes: PAUSEABLE_SUBS.map((x) => ({
      id: x.id,
      subscription: x.name,
      note: isProtectedSub(x.id) ? "🔒 Protected dev tool — never paused" : "Low engagement — safe to pause",
    })),
    source: "engine",
  };

  let strategies: Strategy[] = picks.map((c, i) => toStrategy(c, rankOf(c), mode, product, i === 0));
  let source = "deterministic";

  // 2. PROPOSE
  const t0 = Date.now();
  try {
    const out = await callGemma(buildPrompt(mode, product, price, picks, ctx, context.daily_surplus), AbortSignal.timeout(OLLAMA_TIMEOUT_MS));
    trace.latency_ms = Date.now() - t0;
    trace.eval_tokens = out.eval_tokens;
    trace.tokens_per_sec = Math.round(out.tokens_per_sec * 10) / 10;

    // Guardrail: accept Gemma's pick unless it is clearly worse than the optimum
    // (and in Goal Shield mode, never recommend a delay when a 0-delay option exists).
    const pickIdx = LETTERS.indexOf(out.parsed.recommended as (typeof LETTERS)[number]);
    let recIdx = 0;
    trace.gemma_pick = out.parsed.recommended;
    if (pickIdx >= 0) {
      const chosen = picks[pickIdx];
      const best = picks[0];
      const violatesShield = mode === "goal_shielding" && chosen.delay_days > 0 && best.delay_days === 0;
      // Scores can be negative (pause bonus), so compare the gap, not a ratio.
      const gap = Math.round((chosen.score - best.score) * 100) / 100;
      const threshold = Math.round(Math.max(25, Math.abs(best.score) * 0.5) * 100) / 100;
      const tooCostly = gap > threshold;
      guardrail.gemma_pick = out.parsed.recommended;
      guardrail.gap = gap;
      guardrail.threshold = threshold;
      if (violatesShield || tooCostly) {
        trace.recommendation_by = "solver_guardrail";
        guardrail.reason = violatesShield
          ? `Gemma picked Option ${out.parsed.recommended} (+${chosen.delay_days} days delay), but Goal Shield never accepts a delay while Option A keeps the trip on time.`
          : `Gemma picked Option ${out.parsed.recommended}, but it scores ${gap} worse than the optimum (limit ${threshold}), so the solver's pick was kept.`;
      } else {
        recIdx = pickIdx;
        trace.recommendation_by = "gemma";
        guardrail.reason =
          pickIdx === 0
            ? "Gemma agreed with the solver's optimum (Option A)."
            : `Gemma preferred Option ${out.parsed.recommended}; it is within ${threshold} points of the optimum (gap ${gap}), so the AI's judgment stands.`;
      }
    } else {
      guardrail.reason = "Gemma returned no valid pick, so the solver's optimum was kept.";
    }
    guardrail.final_pick = LETTERS[recIdx];
    guardrail.by = trace.recommendation_by;

    // 3. VERIFY — numeric firewall per card
    strategies = picks.map((c, i) => {
      const card = out.parsed.cards?.find((k) => k.option === LETTERS[i]);
      if (!card) {
        firewallLog[i] = { ...firewallLog[i], status: "missing", reasons: ["Gemma returned no card for this option"] };
        return toStrategy(c, rankOf(c), mode, product, i === recIdx);
      }
      // 3-part firewall: numeric grounding, contradiction, protected Cloud Tier
      const fw = firewallCheck(card.title, card.rationale, c, price, context, product, [feasOf(c)]);
      const ok = fw.ok;
      if (!ok) console.warn(`[Agent] Firewall corrected option ${LETTERS[i]}: ${fw.reasons.join("; ")}`);
      firewallLog[i] = {
        option: LETTERS[i],
        key: c.key,
        status: ok ? "verified" : "corrected",
        gemma_title: card.title,
        gemma_text: card.rationale,
        reasons: fw.reasons,
      };
      ok ? trace.verified_cards++ : trace.corrected_cards++;
      const strat = toStrategy(c, rankOf(c), mode, product, i === recIdx, { ...card, ok });
      if (!ok) {
        firewallLog[i].solver_facts = solverFacts(c);
        firewallLog[i].replacement_text = strat.rationale;
      }
      return strat;
    });
    // Firewall the global insights too (numbers must exist in any pick)
    const allAllowed = picks.flatMap((c) => [...allowedNumbers(c, price, context), feasOf(c)]);
    const clean = (t?: string) =>
      t && t.trim().length > 10 && findUnverifiedNumbers(stripProductSpecs(t, product), allAllowed).length === 0 ? t.trim() : null;
    const narrative = clean(out.parsed.utility_narrative);
    const risk = clean(out.parsed.cash_flow_risk);
    const notes = (out.parsed.subscription_notes ?? [])
      .map((n) => ({ ...n, id: PAUSEABLE_SUBS.find((x) => x.name === n.subscription)?.id ?? "" }))
      .filter((n) => n.id && !isProtectedSub(n.id) && n.note?.trim() && findUnverifiedNumbers(stripProductSpecs(n.note, product), allAllowed).length === 0);
    const protectedNotes = insights.subscription_notes.filter((n) => isProtectedSub(n.id));
    insights = {
      utility_narrative: narrative ?? insights.utility_narrative,
      // Engine is the source of truth for the recommended plan; Gemma may adjust ±band
      confidence:
        typeof out.parsed.confidence === "number"
          ? Math.round(
              Math.min(feasOf(picks[recIdx]) + FEASIBILITY_AI_BAND, Math.max(feasOf(picks[recIdx]) - FEASIBILITY_AI_BAND, out.parsed.confidence))
            )
          : feasOf(picks[recIdx]),
      confidence_baseline: feasOf(picks[recIdx]),
      cash_flow_risk: risk ?? insights.cash_flow_risk,
      subscription_notes: notes.length ? [...notes, ...protectedNotes] : insights.subscription_notes,
      source: narrative || risk || notes.length ? "gemma" : "engine",
    };

    // Recommended card first
    strategies.sort((a, b) => Number(b.recommended) - Number(a.recommended));
    source = trace.corrected_cards === 0 ? "ollama" : "ollama_partial";
    console.log(
      `[Agent] mode=${mode} gemma ${trace.latency_ms}ms ${trace.tokens_per_sec}tok/s pick=${trace.gemma_pick} → ${trace.recommendation_by}, verified=${trace.verified_cards}/3`
    );
  } catch (err) {
    trace.latency_ms = Date.now() - t0;
    trace.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.warn(`[Agent] Gemma unavailable for mode=${mode} (${trace.error}); using solver output`);
  }

  const rec = strategies.find((s) => s.recommended) ?? strategies[0];

  const reasoning: Reasoning = {
    mode,
    weights: solved.weights,
    context: {
      already_paused: context.already_paused,
      saved_extra: context.saved_extra,
      prior_payment_total: context.prior_payment_total,
      remaining: context.remaining,
      days_left: context.days_left,
    },
    candidates: candidates.map((c, i) => {
      const shown = picks.indexOf(c);
      return {
        rank: i + 1,
        key: c.key,
        plan_label: c.plan_label,
        emoji: c.emoji,
        pauses: c.pause_names,
        new_pauses: PAUSEABLE_SUBS.filter((s) => c.new_pause_ids.includes(s.id)).map((s) => s.name),
        delay_days: c.delay_days,
        interest: c.interest,
        paused_monthly: c.paused_monthly,
        score: c.score,
        parts: c.score_parts,
        ...(shown >= 0 && { shown_as: LETTERS[shown] }),
      };
    }),
    firewall: firewallLog,
    guardrail,
  };

  return {
    strategies,
    source,
    priorityMode: mode,
    ai_trace: trace,
    reasoning,
    insights,
    solver_context: context,
    classification: { class: purchaseClass, label },
    user_context: {
      status: userProfile.status,
      monthly_inflow: userProfile.monthly_net_inflow,
      goal_name: userProfile.primary_goal.name,
      goal_saved: userProfile.primary_goal.saved,
      goal_target: userProfile.primary_goal.target,
      goal_date: userProfile.primary_goal.target_date,
      cart_item: userProfile.cart_item.name,
      cart_price: userProfile.cart_item.price,
      utility_class: userProfile.cart_item.utility_class,
    },
    // Back-compat for CheckoutSimulator
    justification: rec.rationale,
    plan: [
      { lever: "Payment structure", detail: rec.structure },
      { lever: "Goal impact", detail: rec.impact_label },
    ],
    confidence_score: insights.confidence,
  };
}
