// src/lib/arbitrage.ts
// ============================================================
// PayPal Pace – Milestone Arbitrage & Impulse Shock-Absorber
// ============================================================
// Pure, deterministic layer shared by the dashboard card (instant
// client-side verdicts) and /api/agent/arbitrage (which hands these
// verified numbers to Gemma for narration). Every number shown in the
// UI comes from here — the model never invents one.
// ============================================================

import {
  PAUSEABLE_SUBS,
  fundingForecast,
  feasibilityScore,
  isProtectedSub,
  type FundingForecast,
  type PaceContext,
} from "@/lib/strategy-solver";

/** Contributions + installments already owed (see pace-store). */
export type ForecastCtx = Pick<PaceContext, "saved_extra" | "prior_payments">;

// ─── Usage telemetry (mock) ────────────────────────────────────

export interface SubUsage {
  category: string;
  uses: number;
  unit: string;
  usage_label: string;
  protect?: boolean;
  verdict: "freeze" | "buffer" | "idle" | "protect";
}

export const SUB_USAGE: Record<string, SubUsage> = {
  "sub-sf": { category: "Entertainment", uses: 2, unit: "hr", usage_label: "~2 hrs / mo", verdict: "freeze" },
  "sub-md": { category: "Food convenience", uses: 1, unit: "order", usage_label: "1 order this month", verdict: "buffer" },
  "sub-ga": { category: "Fitness", uses: 0, unit: "check-in", usage_label: "0 check-ins / 30 days", verdict: "idle" },
  "sub-ct": { category: "Dev tools", uses: 30, unit: "build day", usage_label: "Daily builds", protect: true, verdict: "protect" },
};

/** "Hibernate 2 idle subs" / Lever A target set. */
export const IDLE_PAIR = ["sub-sf", "sub-ga"];
/** Lever B: capping food delivery to 2x/mo frees this much discretionary margin. */
export const FOOD_CAP_MONTHLY = 30;

const usd = (n: number) => `$${n.toFixed(2)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Feature 1: Value-per-use audit ────────────────────────────

export type AuditVerdict = "freeze" | "buffer" | "idle" | "protect";

export interface AuditRow {
  id: string;
  name: string;
  monthly: number;
  category: string;
  usage_label: string;
  cost_per_use: number | null;
  unit: string;
  /** Days the Japan goal arrives sooner if this sub alone is frozen. */
  days_sooner: number;
  yearly_recovered: number;
  verdict: AuditVerdict;
  note: string;
  note_source: "engine" | "gemma";
  paused: boolean;
}

export function buildAudit(pausedIds: string[] = [], ctx?: ForecastCtx): AuditRow[] {
  const base = fundingForecast(0, undefined, ctx);
  return PAUSEABLE_SUBS.map((s) => {
    const u = SUB_USAGE[s.id];
    const cpu = u.uses > 0 ? r2(s.monthly / u.uses) : null;
    const sooner = r2(base.funded_in_days - fundingForecast(s.monthly, undefined, ctx).funded_in_days);
    const verdict: AuditVerdict = u.verdict;
    const note =
      verdict === "protect"
        ? `Active daily builds → ${usd(cpu ?? 0)}/${u.unit}. High ROI — protect service.`
        : verdict === "idle"
        ? `${u.usage_label} → 100% idle cost. Freezing returns ${usd(s.monthly * 12)}/yr.`
        : verdict === "freeze"
        ? `Low engagement (${u.usage_label}) → ${usd(cpu!)}/${u.unit}. Freezing pulls Japan Trip ${sooner.toFixed(1)} days sooner.`
        : `${u.usage_label} → ${usd(cpu!)}/${u.unit}. High leak ratio → candidate for milestone buffering.`;
    return {
      id: s.id,
      name: s.name,
      monthly: s.monthly,
      category: u.category,
      usage_label: u.usage_label,
      cost_per_use: cpu,
      unit: u.unit,
      days_sooner: sooner,
      yearly_recovered: r2(s.monthly * 12),
      verdict,
      note,
      note_source: "engine",
      paused: pausedIds.includes(s.id) && !isProtectedSub(s.id),
    };
  });
}

export function pausedMonthlyOf(pausedIds: string[]): number {
  // Protected subs (Cloud Tier) are never paused, so they never free money
  return r2(PAUSEABLE_SUBS.filter((s) => pausedIds.includes(s.id) && !isProtectedSub(s.id)).reduce((a, s) => a + s.monthly, 0));
}

// ─── Feature 2: Fast-forward levers ────────────────────────────

export interface LeverImpact {
  monthly: number;
  yearly: number;
  days_sooner: number;
  forecast: FundingForecast;
}

export function leverImpact(currentExtra: number, leverMonthly: number, ctx?: ForecastCtx): LeverImpact {
  const before = fundingForecast(currentExtra, undefined, ctx);
  const after = fundingForecast(currentExtra + leverMonthly, undefined, ctx);
  return {
    monthly: r2(leverMonthly),
    yearly: r2(leverMonthly * 12),
    days_sooner: r2(before.funded_in_days - after.funded_in_days),
    forecast: after,
  };
}

// ─── Feature 3: Impulse shock-absorber ─────────────────────────

export interface ImpulseVerdict {
  amount: number;
  label: string;
  installment: number;
  feasibility: number;
  plan_label: string;
  structure: string;
  /** Delay with Pay in 4 and only the user's current pauses/levers. */
  delay_now: number;
  /** Extra subs (beyond current) needed for a 0-day delay, if any. */
  extra_pause_ids: string[];
  extra_pause_names: string[];
  delay_with_extra: number;
  buffer_before: number;
  buffer_after: number;
  impact: string;
  allowed_numbers: number[];
}

/** Candidate additional freezes, cheapest-pain first. The protected dev tool (Cloud Tier) is never one. */
const EXTRA_PAUSE_ORDER: string[][] = [
  [],
  ["sub-sf"],
  ["sub-ga"],
  ["sub-sf", "sub-ga"],
  ["sub-sf", "sub-ga", "sub-md"],
];

export function simulateImpulse(
  amount: number,
  label: string,
  pausedIds: string[],
  foodCap: boolean,
  ctx?: ForecastCtx
): ImpulseVerdict {
  const baseExtra = pausedMonthlyOf(pausedIds) + (foodCap ? FOOD_CAP_MONTHLY : 0);
  const installment = r2(amount / 4);
  const before = fundingForecast(baseExtra, undefined, ctx);
  const now = fundingForecast(baseExtra, { amount, plan: "pay_in_4" }, ctx);

  let extraIds: string[] = [];
  let withExtra = now;
  if (now.delay_days > 0) {
    for (const set of EXTRA_PAUSE_ORDER) {
      const add = set.filter((id) => !pausedIds.includes(id));
      if (!add.length) continue;
      const f = fundingForecast(baseExtra + pausedMonthlyOf(add), { amount, plan: "pay_in_4" }, ctx);
      if (f.delay_days === 0) {
        extraIds = add;
        withExtra = f;
        break;
      }
      withExtra = f;
      extraIds = add;
    }
  }
  const names = PAUSEABLE_SUBS.filter((s) => extraIds.includes(s.id)).map((s) => s.name);

  // Same formula checkout uses (strategy-solver feasibilityScore)
  const feasibility = feasibilityScore({
    delay_days: now.delay_days,
    installment,
    daily_rate: before.daily_rate,
    extra_pauses: extraIds.length > 0,
  });

  const goal = before.goal_name.replace(" Autumn", "");
  const impact =
    now.delay_days === 0
      ? `Delays ${goal} by 0 days with no extra pauses — buffer shrinks from ${before.days_ahead.toFixed(0)} to ${Math.max(0, now.days_left - now.funded_in_days).toFixed(0)} days ahead.`
      : withExtra.delay_days === 0
      ? `Delays ${goal} by 0 days if ${names.join(" + ")} ${names.length > 1 ? "are" : "is"} paused while you save (otherwise +${now.delay_days} days).`
      : `Delays ${goal} by +${withExtra.delay_days} days even with every pausable subscription paused (+${now.delay_days} as-is) — consider waiting or saving first.`;

  return {
    amount,
    label,
    installment,
    feasibility,
    plan_label: "Pay in 4",
    structure: `4 payments of ${usd(installment)} bi-weekly`,
    delay_now: now.delay_days,
    extra_pause_ids: extraIds,
    extra_pause_names: names,
    delay_with_extra: withExtra.delay_days,
    buffer_before: Math.round(before.days_ahead),
    buffer_after: Math.round(Math.max(0, now.days_left - now.funded_in_days)),
    impact,
    allowed_numbers: [
      amount, installment, feasibility, now.delay_days, withExtra.delay_days, 4, 0, 14, 30,
      Math.round(before.days_ahead), Math.round(Math.max(0, now.days_left - now.funded_in_days)),
      before.days_left, ...PAUSEABLE_SUBS.map((s) => s.monthly), 2150, 3200, 1050,
    ],
  };
}

/** Numbers in `text` that don't match any allowed value (±2%, min ±1). Small integers ≤ 3 are ignored. */
export function unverifiedNumbers(text: string, allowed: number[]): number[] {
  const nums = (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => parseFloat(s.replace(/,/g, "")));
  return nums.filter((n) => n > 3 && !allowed.some((a) => Math.abs(n - a) <= Math.max(1, Math.abs(a) * 0.02)));
}
