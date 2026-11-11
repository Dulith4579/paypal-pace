// src/app/api/agent/arbitrage/route.ts
// ============================================================
// PayPal Pace – Milestone Arbitrage agent (isolated sub-handler)
// ============================================================
// POST /api/agent/arbitrage
//   { op: "audit", pausedIds }                         → AI Value Audit notes
//   { op: "simulate", amount, label, pausedIds, foodCap } → impulse verdict
// Numbers come from the deterministic layer (src/lib/arbitrage.ts);
// local Gemma (Ollama) only narrates/scores them, behind a numeric
// firewall. Falls back to the engine on timeout. Nothing leaves the
// machine: the only network call is to 127.0.0.1.
// ============================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAudit, simulateImpulse, unverifiedNumbers, type AuditRow, type ForecastCtx } from "@/lib/arbitrage";
import { userProfile } from "@/lib/mock-data";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma2:2b";
const TIMEOUT_MS = 45_000;

// Shared app facts (goal contributions, installments owed) — see src/lib/pace-store.ts
const Ctx = z
  .object({
    saved_extra: z.number().min(0).max(1_000_000).default(0),
    prior_payments: z.array(z.object({ day: z.number().int().min(0).max(730), amount: z.number().positive() })).max(60).default([]),
  })
  .optional();

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("audit"), pausedIds: z.array(z.string()).default([]), ctx: Ctx }),
  z.object({
    op: z.literal("simulate"),
    amount: z.number().positive().max(100_000),
    label: z.string().max(80).default("Custom purchase"),
    pausedIds: z.array(z.string()).default([]),
    foodCap: z.boolean().default(false),
    ctx: Ctx,
  }),
]);

export interface Telemetry {
  engine: "gemma" | "deterministic";
  model: string;
  latency_ms: number;
  cloud_calls: 0;
  firewall: { checked: number; corrected: number };
  error?: string;
}

// ─── Ollama helper ─────────────────────────────────────────────

async function gemma<T>(prompt: string, schema: object, numPredict: number) {
  const t0 = Date.now();
  const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: schema,
      keep_alive: "30m",
      options: { temperature: 0.5, num_predict: numPredict },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
  const data = await resp.json();
  return { out: JSON.parse(data.response) as T, latency_ms: Date.now() - t0 };
}

// Identical requests share one generation (CPU inference is serial).
const cache = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p as Promise<T>;
  const p = fn().then((r) => {
    if ((r as { telemetry?: Telemetry }).telemetry?.engine !== "gemma") cache.delete(key);
    return r;
  });
  cache.set(key, { at: Date.now(), p });
  return p;
}

// ─── Audit ─────────────────────────────────────────────────────

async function runAudit(pausedIds: string[], ctx?: ForecastCtx) {
  const rows = buildAudit(pausedIds, ctx);
  const telemetry: Telemetry = {
    engine: "deterministic", model: OLLAMA_MODEL, latency_ms: 0, cloud_calls: 0,
    firewall: { checked: 0, corrected: 0 },
  };
  const g = userProfile.primary_goal;
  const prompt = [
    "You are a frugal-but-fair money coach for a student developer saving for a Japan trip.",
    `Goal: $${g.saved} of $${g.target}. For each subscription write ONE audit line (max 16 words) judging value-per-use.`,
    "Use only the numbers given. Freezing a subscription makes the trip arrive SOONER, never later — do not say 'delay'.",
    "Recommended action is given in brackets; agree with it. Never suggest pausing anything marked PROTECT.",
    ...rows.map(
      (r) =>
        `${r.id}: ${r.name} $${r.monthly}/mo, ${r.usage_label}, ${r.cost_per_use === null ? "never used" : `$${r.cost_per_use} per ${r.unit}`}, ` +
        `freezing returns $${r.yearly_recovered}/yr and brings the trip ${r.days_sooner} days sooner [${r.verdict.toUpperCase()}${r.verdict === "protect" ? " — keep it" : ""}].`
    ),
  ].join("\n");
  const schema = {
    type: "object",
    properties: {
      notes: {
        type: "array", minItems: rows.length, maxItems: rows.length,
        items: {
          type: "object",
          properties: { id: { type: "string", enum: rows.map((r) => r.id) }, note: { type: "string" } },
          required: ["id", "note"],
        },
      },
    },
    required: ["notes"],
  };
  try {
    const { out, latency_ms } = await gemma<{ notes: { id: string; note: string }[] }>(prompt, schema, 260);
    telemetry.latency_ms = latency_ms;
    let accepted = 0;
    const merged: AuditRow[] = rows.map((r) => {
      const n = out.notes?.find((x) => x.id === r.id)?.note?.trim();
      if (!n) return r;
      telemetry.firewall.checked++;
      const allowed = [r.monthly, r.cost_per_use ?? 0, r.yearly_recovered, r.days_sooner, r.monthly * 12, 100, 30, g.saved, g.target];
      const protectViolation = r.verdict === "protect" && /\b(freeze|cancel|pause|cut)\b/i.test(n) && !/\b(don'?t|do not|never|keep|protect)\b/i.test(n);
      const wrongDirection = /delay/i.test(n); // freezing can only bring the goal sooner
      if (unverifiedNumbers(n, allowed).length || protectViolation || wrongDirection || n.length < 12) {
        telemetry.firewall.corrected++;
        return r;
      }
      accepted++;
      return { ...r, note: n, note_source: "gemma" as const };
    });
    if (accepted > 0) telemetry.engine = "gemma";
    return { rows: merged, telemetry };
  } catch (err) {
    telemetry.error = err instanceof Error ? err.message : String(err);
    return { rows, telemetry };
  }
}

// ─── Impulse simulation ────────────────────────────────────────

async function runSimulate(amount: number, label: string, pausedIds: string[], foodCap: boolean, ctx?: ForecastCtx) {
  const v = simulateImpulse(amount, label, pausedIds, foodCap, ctx);
  const telemetry: Telemetry = {
    engine: "deterministic", model: OLLAMA_MODEL, latency_ms: 0, cloud_calls: 0,
    firewall: { checked: 0, corrected: 0 },
  };
  const prompt = [
    "You are a calm on-device money coach. A student developer saving for a Japan trip wants to buy:",
    `${label} for $${amount}. Verified facts from the math engine:`,
    `- Pay in 4: ${v.structure}, 0% interest`,
    `- Trip delay with current settings: ${v.delay_now} days`,
    v.extra_pause_names.length ? `- With ${v.extra_pause_names.join(" + ")} paused: ${v.delay_with_extra} days delay` : "- No extra pauses needed",
    `- Savings buffer: ${v.buffer_before} days ahead before, ${v.buffer_after} days ahead after`,
    `- Engine feasibility estimate: ${v.feasibility}%`,
    "Return feasibility (0-100, your own judgment near the engine estimate) and coach_note: ONE sentence, max 20 words, only numbers listed above.",
  ].join("\n");
  const schema = {
    type: "object",
    properties: { feasibility: { type: "integer", minimum: 0, maximum: 100 }, coach_note: { type: "string" } },
    required: ["feasibility", "coach_note"],
  };
  let coach_note: string | null = null;
  let feasibility = v.feasibility;
  try {
    const { out, latency_ms } = await gemma<{ feasibility: number; coach_note: string }>(prompt, schema, 90);
    telemetry.latency_ms = latency_ms;
    telemetry.engine = "gemma";
    // Guardrail: Gemma may adjust the score, but only within ±15 of the engine
    if (typeof out.feasibility === "number") {
      feasibility = Math.round(Math.min(v.feasibility + 15, Math.max(v.feasibility - 15, out.feasibility)));
    }
    telemetry.firewall.checked = 1;
    const note = out.coach_note?.trim() ?? "";
    if (note.length > 10 && unverifiedNumbers(note, [...v.allowed_numbers, feasibility]).length === 0) coach_note = note;
    else telemetry.firewall.corrected = 1;
  } catch (err) {
    telemetry.error = err instanceof Error ? err.message : String(err);
  }
  return { verdict: { ...v, feasibility }, coach_note, telemetry };
}

// ─── Handler ───────────────────────────────────────────────────

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const b = parsed.data;
  const ids = [...b.pausedIds].sort();
  const ck = JSON.stringify(b.ctx ?? {});
  if (b.op === "audit") {
    return NextResponse.json(await cached(`audit|${ids}|${ck}`, () => runAudit(ids, b.ctx)));
  }
  return NextResponse.json(
    await cached(`sim|${b.amount}|${b.label}|${ids}|${b.foodCap}|${ck}`, () => runSimulate(b.amount, b.label, ids, b.foodCap, b.ctx))
  );
}
