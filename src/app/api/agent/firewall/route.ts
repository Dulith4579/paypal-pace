// src/app/api/agent/firewall/route.ts
// ============================================================
// PayPal Pace – Firewall injection demo ("Inject Hallucination")
// ============================================================
// POST /api/agent/firewall
// Plants a deliberate hallucination in a card's AI text — a goal delay
// the solver never produced, or advice to pause the protected Cloud
// Tier — and runs it through the SAME firewallCheck() that guards
// Gemma's real output in /api/agent. Nothing is hard-coded: the
// verdict, the reasons and the correction all come from the live
// validator and solver for this product, mode and shared state.
// No model call, so it answers instantly (safe for a live demo).
// ============================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  solveStrategies,
  firewallCheck,
  candidateFeasibility,
  allowedNumbers,
  solverFacts,
  templateRationale,
  normalizeContext,
  PAUSEABLE_SUBS,
  isProtectedSub,
  type PriorityMode,
} from "@/lib/strategy-solver";

const Body = z.object({
  price: z.number().positive().max(100_000),
  product: z.string().max(200),
  mode: z.enum(["career_growth", "balanced", "goal_shielding"]),
  key: z.string().max(200),
  /** The card text to tamper with (Gemma's draft if it had one). */
  base_text: z.string().max(1000).optional(),
  kind: z.enum(["delay", "protected"]).default("delay"),
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

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { price, product, mode, key, base_text, kind } = parsed.data;

  const solved = solveStrategies(price, mode as PriorityMode, normalizeContext(parsed.data.context));
  const c = solved.candidates.find((x) => x.key === key);
  if (!c) return NextResponse.json({ error: "Unknown plan key" }, { status: 404 });
  const feas = candidateFeasibility(c, solved.context.daily_surplus);
  const base = (base_text?.trim() || templateRationale(c, mode as PriorityMode, product)).replace(/\s+$/, "");

  let injected_text: string;
  let injected_claim: string;
  if (kind === "protected") {
    const prot = PAUSEABLE_SUBS.find((s) => isProtectedSub(s.id))!;
    injected_claim = `"pause ${prot.name}"`;
    injected_text = `${base} Also pause ${prot.name} to speed things up.`;
  } else {
    // A delay the solver did not produce: smallest value ≥ real+12 that no engine fact matches
    const allowed = [...allowedNumbers(c, price, solved.context), feas];
    let n = c.delay_days + 12;
    while (allowed.some((a) => Math.abs(n - a) <= Math.max(1, Math.abs(a) * 0.02))) n++;
    injected_claim = `${n} days of goal delay`;
    injected_text = `${base} Heads up: this pushes your trip back ${n} days.`;
  }

  const verdict = firewallCheck("", injected_text, c, price, solved.context, product, [feas]);
  return NextResponse.json({
    kind,
    key,
    injected_claim,
    injected_text,
    caught: !verdict.ok,
    reasons: verdict.reasons,
    solver_facts: solverFacts(c),
    replacement_text: templateRationale(c, mode as PriorityMode, product),
  });
}
