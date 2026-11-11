// src/lib/strategy-solver.ts
// ============================================================
// PayPal Pace – Affordability Strategy Solver (symbolic half)
// ============================================================
// Enumerates every (payment plan × subscription-pause set)
// combination, runs a day-by-day cash-flow simulation against
// the user's savings goal, and ranks candidates with
// priority-mode-specific weights. The LLM never invents numbers:
// it only chooses among / narrates these verified candidates.
// ============================================================

import { daysRemaining, addDaysToDate } from "@/lib/math-engine";
import { userProfile } from "@/lib/mock-data";

export type PriorityMode = "career_growth" | "balanced" | "goal_shielding";
export type PlanType = "outright" | "pay_in_4" | "pay_monthly_6" | "pay_monthly_12";

export interface PauseableSub {
  id: string;
  name: string;
  monthly: number;
  /** How much the user loses by pausing it, per mode ($-equivalent). */
  pain: Record<PriorityMode, number>;
}

/** Same IDs the modal's expense grid uses. */
export const PAUSEABLE_SUBS: PauseableSub[] = [
  // Idle/dormant — almost no pain to pause
  { id: "sub-md", name: "Meal Delivery", monthly: 29.99, pain: { career_growth: 1, balanced: 1, goal_shielding: 1 } },
  { id: "sub-ga", name: "Gym Add-on", monthly: 19.99, pain: { career_growth: 1, balanced: 1, goal_shielding: 1 } },
  { id: "sub-sf", name: "StreamFlix", monthly: 14.99, pain: { career_growth: 6, balanced: 15, goal_shielding: 4 } },
  // Dev storage — pausing it hurts a career-focused user the most
  { id: "sub-ct", name: "Cloud Tier", monthly: 12.99, pain: { career_growth: 90, balanced: 40, goal_shielding: 15 } },
];

/**
 * Subscriptions that are never paused, by any plan, lever or AI suggestion:
 * Cloud Tier is the dev storage the purchase is meant to be productive with.
 */
export const PROTECTED_SUB_IDS: readonly string[] = ["sub-ct"];
export const isProtectedSub = (id: string) => PROTECTED_SUB_IDS.includes(id);

const PAUSE_SETS: string[][] = [
  [],
  ["sub-md"],
  ["sub-md", "sub-ga"],
  ["sub-md", "sub-ga", "sub-sf"],
];

/** Est. PayPal Pay Monthly APR used for simulation (real offers vary 9.99–35.99%). */
const PAY_MONTHLY_APR = 0.0999;

const PLAN_META: Record<PlanType, { label: string; emoji: string }> = {
  outright: { label: "Pay in full", emoji: "💳" },
  pay_in_4: { label: "Pay in 4", emoji: "🗓️" },
  pay_monthly_6: { label: "Pay Monthly · 6 mo", emoji: "📆" },
  pay_monthly_12: { label: "Pay Monthly · 12 mo", emoji: "🛡️" },
};

/**
 * Mode weights ($-equivalent): cost of 1 day goal delay, of $1 interest,
 * and value of each $1/mo recovered from paused subscriptions (cash buffer).
 */
const MODE_WEIGHTS: Record<PriorityMode, { perDelayDay: number; perInterestDollar: number; perRecoveredDollar: number }> = {
  career_growth: { perDelayDay: 2, perInterestDollar: 2.5, perRecoveredDollar: 0.3 },
  balanced: { perDelayDay: 10, perInterestDollar: 1, perRecoveredDollar: 0.6 },
  goal_shielding: { perDelayDay: 60, perInterestDollar: 0.4, perRecoveredDollar: 1.2 },
};

export interface ScoreParts {
  delay_cost: number;
  interest_cost: number;
  pain: number;
  /** Subtracted from the score (recovered subscription money). */
  recovered_bonus: number;
}

export interface Candidate {
  key: string;
  plan: PlanType;
  plan_label: string;
  emoji: string;
  /** All subs paused under this plan (already-hibernated ones included). */
  pause_ids: string[];
  pause_names: string[];
  /** Subs this plan newly pauses (beyond what the user already hibernated). */
  new_pause_ids: string[];
  paused_monthly: number;
  installment: number;
  payment_count: number;
  first_payment_day: number;
  interest: number;
  total_cost: number;
  cash_out_before_deadline: number;
  delay_days: number;
  goal_date: string;
  new_goal_date: string;
  score: number;
  score_parts: ScoreParts;
}

/**
 * Facts shared across the app (dashboard levers, past PayPal captures).
 * Serializable so the client can send it to the agent routes.
 */
export interface PaceContext {
  /** Extra $ already contributed to the primary goal (captured via PayPal). */
  saved_extra: number;
  /** Remaining installments from earlier purchases: day offset from today → $. */
  prior_payments: { day: number; amount: number }[];
  /** Subscriptions the user already hibernated on the dashboard. */
  already_paused: string[];
  /** Other recovered monthly margin (e.g. food-delivery cap). */
  extra_monthly: number;
}

export const EMPTY_CONTEXT: PaceContext = { saved_extra: 0, prior_payments: [], already_paused: [], extra_monthly: 0 };

export function normalizeContext(ctx?: Partial<PaceContext> | null): PaceContext {
  return {
    saved_extra: Math.max(0, Number(ctx?.saved_extra) || 0),
    prior_payments: (ctx?.prior_payments ?? []).filter((p) => p.day >= 0 && p.amount > 0),
    already_paused: (ctx?.already_paused ?? []).filter((id) => PAUSEABLE_SUBS.some((s) => s.id === id) && !isProtectedSub(id)),
    extra_monthly: Math.max(0, Number(ctx?.extra_monthly) || 0),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Payment = { day: number; amount: number };

/** Installment days/amounts for a plan, starting today. */
export function planPayments(plan: PlanType, price: number): Payment[] {
  const s = paymentSchedule(plan, price);
  return s.days.map((day) => ({ day, amount: s.installment }));
}

function paymentSchedule(plan: PlanType, price: number) {
  switch (plan) {
    case "outright":
      return { installment: price, days: [0], interest: 0 };
    case "pay_in_4":
      return { installment: r2(price / 4), days: [0, 14, 28, 42], interest: 0 };
    case "pay_monthly_6":
    case "pay_monthly_12": {
      const n = plan === "pay_monthly_6" ? 6 : 12;
      const r = PAY_MONTHLY_APR / 12;
      const pmt = (price * r) / (1 - Math.pow(1 + r, -n));
      return {
        installment: r2(pmt),
        days: Array.from({ length: n }, (_, i) => 30 * (i + 1)),
        interest: r2(pmt * n - price),
      };
    }
  }
}

/**
 * Day-by-day simulation: daily surplus (+ recovered subscription money)
 * flows into the goal; installments due on a day are paid from it.
 * Returns the (fractional) day the goal is fully funded — Math.ceil() of
 * it is the whole day it happens on.
 */
function simulateFunded(remaining: number, dailySurplus: number, payments: Payment[]): number {
  if (remaining <= 0) return 0;
  if (dailySurplus <= 0) return 730;
  let balance = 0;
  for (let d = 0; d < 730; d++) {
    for (const p of payments) if (p.day === d) balance -= p.amount;
    if (balance + dailySurplus >= remaining) return d + Math.max(0, remaining - balance) / dailySurplus;
    balance += dailySurplus;
  }
  return 730;
}

/** Goal state after applying shared context (contributions, prior plans, hibernated subs). */
function baseState(ctx: PaceContext) {
  const goal = userProfile.primary_goal;
  const alreadyMonthly = PAUSEABLE_SUBS.filter((s) => ctx.already_paused.includes(s.id)).reduce((a, s) => a + s.monthly, 0);
  return {
    goal,
    remaining: Math.max(goal.target - goal.saved - ctx.saved_extra, 0),
    D: daysRemaining(goal.target_date),
    /** Pre-pause surplus (no subscription pauses, no levers). */
    rawDaily: (userProfile.monthly_net_inflow - userProfile.monthly_fixed_costs) / 30,
    alreadyMonthly: r2(alreadyMonthly),
  };
}

/** Parse a strategy id ("pay_in_4:sub-md+sub-ga") back to its plan type. */
export function planFromStrategyId(id: string): PlanType {
  const p = id.split(":")[0] as PlanType;
  return p in PLAN_META ? p : "pay_in_4";
}

export interface GoalProjection {
  goal_name: string;
  target_date: string;
  projected_date: string;
  delay_days: number;
  /** Delay if paid in full with nothing paused — the "without Pace" baseline. */
  unmitigated_delay_days: number;
  paused_monthly: number;
}

/**
 * Live projection for the UI: same simulation the solver uses, for any
 * plan + any total of paused subscriptions (including grid overrides).
 * `pausedMonthly` is everything paused in the grid (already-hibernated subs included).
 */
export function projectGoal(price: number, plan: PlanType, pausedMonthly: number, context?: Partial<PaceContext>): GoalProjection {
  const ctx = normalizeContext(context);
  const { goal, remaining, D, rawDaily } = baseState(ctx);
  const surplus = rawDaily + (ctx.extra_monthly + pausedMonthly) / 30;
  const delay = Math.max(0, Math.ceil(simulateFunded(remaining, surplus, [...ctx.prior_payments, ...planPayments(plan, price)])) - D);
  // "Without Pace": pay in full, no pauses or levers (past plans/contributions are facts).
  const unmitigated = Math.max(
    0,
    Math.ceil(simulateFunded(remaining, rawDaily, [...ctx.prior_payments, ...planPayments("outright", price)])) - D
  );
  return {
    goal_name: goal.name,
    target_date: goal.target_date,
    projected_date: addDaysToDate(goal.target_date, delay),
    delay_days: delay,
    unmitigated_delay_days: unmitigated,
    paused_monthly: r2(pausedMonthly),
  };
}

export interface FundingForecast {
  goal_name: string;
  target_date: string;
  days_left: number;
  /** Fractional days until the goal is fully funded. */
  funded_in_days: number;
  funded_date: string;
  /** Positive = ahead of the deadline; 0 = on the deadline; delay shown separately. */
  days_ahead: number;
  delay_days: number;
  daily_rate: number;
}

/**
 * Dashboard forecast.
 * extraMonthly = recovered money (paused subs, spending caps) — passed explicitly.
 * purchase = optional hypothetical buy paid via the given plan.
 * context = contributions + installments already owed from real purchases
 *           (its already_paused / extra_monthly are ignored here).
 */
export function fundingForecast(
  extraMonthly: number,
  purchase?: { amount: number; plan: PlanType },
  context?: Partial<PaceContext>
): FundingForecast {
  const ctx = normalizeContext(context);
  const { goal, remaining, D, rawDaily } = baseState(ctx);
  const rate = rawDaily + extraMonthly / 30;
  const payments = [...ctx.prior_payments, ...(purchase && purchase.amount > 0 ? planPayments(purchase.plan, purchase.amount) : [])];
  // Fractional — small levers still register (equals remaining/rate with no payments)
  const funded = simulateFunded(remaining, rate, payments);
  const fundedRounded = Math.ceil(funded);
  return {
    goal_name: goal.name,
    target_date: goal.target_date,
    days_left: D,
    funded_in_days: r2(funded),
    funded_date: addDaysToDate(new Date().toISOString().split("T")[0], fundedRounded),
    days_ahead: r2(Math.max(0, D - funded)),
    delay_days: Math.max(0, fundedRounded - D),
    daily_rate: r2(rate),
  };
}

// ─── Goal trajectory (chart) & subscription wake-up dates ──────

export interface TrajectoryPoint {
  day: number;
  /** Goal balance in $ at the end of the day (capped at the target once funded). */
  balance: number;
}

/**
 * Day-by-day goal balance — the same cash-flow model as simulateFunded():
 * installments due on a day leave first, then that day's surplus arrives.
 * Starts from saved + contributions; stops growing once the target is hit.
 */
export function goalTrajectory(
  extraMonthly: number,
  payments: Payment[],
  context?: Partial<PaceContext>,
  horizonDays?: number
): { points: TrajectoryPoint[]; target: number; start: number; deadline_day: number; funded_day: number | null } {
  const ctx = normalizeContext(context);
  const { goal, D, rawDaily } = baseState(ctx);
  const rate = rawDaily + extraMonthly / 30;
  const start = goal.saved + ctx.saved_extra;
  const horizon = Math.min(400, horizonDays ?? D + 30);
  let balance = start;
  let funded: number | null = balance >= goal.target ? 0 : null;
  const points: TrajectoryPoint[] = [{ day: 0, balance: r2(balance) }];
  for (let d = 0; d < horizon; d++) {
    for (const p of payments) if (p.day === d) balance -= p.amount;
    balance = funded !== null ? Math.max(balance, goal.target) : balance + rate;
    if (funded === null && balance >= goal.target) {
      funded = d + 1;
      balance = goal.target;
    }
    points.push({ day: d + 1, balance: r2(balance) });
  }
  return { points, target: goal.target, start: r2(start), deadline_day: D, funded_day: funded };
}

/** Like simulateFunded, but the daily surplus can change over time. */
function simulateFundedVar(remaining: number, rateAt: (day: number) => number, payments: Payment[]): number {
  if (remaining <= 0) return 0;
  let balance = 0;
  for (let d = 0; d < 730; d++) {
    for (const p of payments) if (p.day === d) balance -= p.amount;
    const r = rateAt(d);
    if (r > 0 && balance + r >= remaining) return d + Math.max(0, remaining - balance) / r;
    balance += r;
  }
  return 730;
}

export interface ResumeOutlook {
  /** "now" = resume today; "date" = safe from `day`; "hold" = goal already late, keep it paused. */
  kind: "now" | "date" | "hold";
  /** Days from today when resuming keeps the goal on time (and active plans are paid off). */
  day: number;
  reason: string;
  /** Days of buffer (ahead of deadline) that resuming on `day` costs. */
  buffer_cost_days: number;
}

/**
 * Earliest day a paused subscription can be switched back on while the goal
 * stays on time, and not before the user's PayPal installments are paid off
 * (the pause exists to absorb them). `extraMonthly` includes this sub's money.
 */
export function resumeOutlook(subMonthly: number, extraMonthly: number, context?: Partial<PaceContext>): ResumeOutlook {
  const ctx = normalizeContext(context);
  const { remaining, D, rawDaily } = baseState(ctx);
  const payments = ctx.prior_payments;
  const fundedAt = (resumeDay: number) =>
    simulateFundedVar(remaining, (d) => rawDaily + (extraMonthly - (d >= resumeDay ? subMonthly : 0)) / 30, payments);
  const keepPaused = simulateFundedVar(remaining, () => rawDaily + extraMonthly / 30, payments);
  if (Math.ceil(keepPaused) > D)
    return { kind: "hold", day: Math.ceil(keepPaused), reason: "goal is already behind schedule", buffer_cost_days: 0 };

  // Earliest resume day that keeps the goal on time (resuming after funding is always safe)
  let onTime = Math.ceil(keepPaused);
  for (let r = 0; r <= Math.ceil(keepPaused); r++) {
    if (Math.ceil(fundedAt(r)) <= D) {
      onTime = r;
      break;
    }
  }
  const lastInstallment = payments.filter((p) => p.day > 0).reduce((m, p) => Math.max(m, p.day), 0);
  const afterPlans = lastInstallment > 0 ? lastInstallment + 1 : 0;
  const day = Math.max(onTime, afterPlans);
  const reason =
    day === 0
      ? "goal stays on time"
      : day === afterPlans && afterPlans >= onTime
      ? "after your last PayPal installment"
      : "goal stays on time from then";
  return {
    kind: day === 0 ? "now" : "date",
    day,
    reason,
    buffer_cost_days: r2(Math.max(0, fundedAt(day) - keepPaused)),
  };
}

export interface SolverResult {
  candidates: Candidate[];
  /** 3 diverse picks for the cards, best first. */
  picks: Candidate[];
  context: {
    goal_name: string;
    remaining: number;
    days_left: number;
    daily_surplus: number;
    baseline_funded_day: number;
    already_paused: string[];
    saved_extra: number;
    prior_payment_total: number;
  };
  weights: { perDelayDay: number; perInterestDollar: number; perRecoveredDollar: number };
}

export function solveStrategies(price: number, mode: PriorityMode, context?: Partial<PaceContext>): SolverResult {
  const ctx = normalizeContext(context);
  const { goal, remaining, D, rawDaily, alreadyMonthly } = baseState(ctx);
  // Already-hibernated subs and levers are part of everyone's baseline.
  const dailySurplus = rawDaily + (ctx.extra_monthly + alreadyMonthly) / 30;
  const weights = MODE_WEIGHTS[mode];

  // Every pause set is applied on top of what the user already hibernated.
  const pauseSets = new Map<string, string[]>();
  for (const set of PAUSE_SETS) {
    if (set.some(isProtectedSub)) continue; // defense in depth: never plan a protected pause
    const ids = PAUSEABLE_SUBS.map((s) => s.id).filter((id) => set.includes(id) || ctx.already_paused.includes(id));
    pauseSets.set(ids.join("+"), ids);
  }

  const candidates: Candidate[] = [];
  for (const plan of Object.keys(PLAN_META) as PlanType[]) {
    const sched = paymentSchedule(plan, price);
    for (const pauseIds of pauseSets.values()) {
      const subs = PAUSEABLE_SUBS.filter((s) => pauseIds.includes(s.id));
      const newSubs = subs.filter((s) => !ctx.already_paused.includes(s.id));
      const pausedMonthly = r2(subs.reduce((a, s) => a + s.monthly, 0));
      const newMonthly = r2(newSubs.reduce((a, s) => a + s.monthly, 0));
      const funded = simulateFunded(remaining, dailySurplus + newMonthly / 30, [
        ...ctx.prior_payments,
        ...planPayments(plan, price),
      ]);
      const delay = Math.max(0, Math.ceil(funded) - D);
      const parts: ScoreParts = {
        delay_cost: r2(delay * weights.perDelayDay),
        interest_cost: r2(sched.interest * weights.perInterestDollar),
        pain: newSubs.reduce((a, s) => a + s.pain[mode], 0),
        recovered_bonus: r2(newMonthly * weights.perRecoveredDollar),
      };
      const cashOut = sched.days.filter((d) => d < D).length * sched.installment;

      candidates.push({
        key: `${plan}:${pauseIds.join("+") || "none"}`,
        plan,
        plan_label: PLAN_META[plan].label,
        emoji: PLAN_META[plan].emoji,
        pause_ids: pauseIds,
        pause_names: subs.map((s) => s.name),
        new_pause_ids: newSubs.map((s) => s.id),
        paused_monthly: pausedMonthly,
        installment: sched.installment,
        payment_count: sched.days.length,
        first_payment_day: sched.days[0],
        interest: sched.interest,
        total_cost: r2(price + sched.interest),
        cash_out_before_deadline: r2(cashOut),
        delay_days: delay,
        goal_date: goal.target_date,
        new_goal_date: addDaysToDate(goal.target_date, delay),
        score: r2(parts.delay_cost + parts.interest_cost + parts.pain - parts.recovered_bonus),
        score_parts: parts,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  // Diverse picks: best overall, then best of each other plan type.
  const picks: Candidate[] = [];
  const usedPlans = new Set<PlanType>();
  for (const c of candidates) {
    if (usedPlans.has(c.plan)) continue;
    picks.push(c);
    usedPlans.add(c.plan);
    if (picks.length === 2) break;
  }
  // Third card: the "contrast" option — pay in full if not already shown,
  // so the user always sees the unmitigated baseline.
  const contrast =
    candidates.find((c) => c.plan === "outright" && c.new_pause_ids.length === 0 && !usedPlans.has("outright")) ??
    candidates.find((c) => !usedPlans.has(c.plan));
  if (contrast) picks.push(contrast);

  return {
    candidates,
    picks,
    context: {
      goal_name: goal.name,
      remaining,
      days_left: D,
      daily_surplus: r2(dailySurplus),
      baseline_funded_day: Math.ceil(simulateFunded(remaining, dailySurplus, ctx.prior_payments)),
      already_paused: ctx.already_paused,
      saved_extra: ctx.saved_extra,
      prior_payment_total: r2(ctx.prior_payments.reduce((a, p) => a + p.amount, 0)),
    },
    weights,
  };
}

// ─── Presentation helpers ────────────────────────────────────

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function describeStructure(c: Candidate): string {
  let base: string;
  if (c.plan === "outright") base = `Single payment of ${usd(c.installment)} today`;
  else if (c.plan === "pay_in_4") base = `4 bi-weekly payments of ${usd(c.installment)} at 0% APR`;
  else
    base = `${c.payment_count} monthly payments of ${usd(c.installment)} (est. 9.99% APR, ${usd(c.interest)} interest), first due in 30 days`;
  const newNames = PAUSEABLE_SUBS.filter((s) => c.new_pause_ids.includes(s.id)).map((s) => s.name);
  const keptNames = c.pause_names.filter((n) => !newNames.includes(n));
  const kept = keptNames.length ? ` (${keptNames.join(", ")} already hibernated)` : "";
  const pauses = newNames.length
    ? ` + Pause ${newNames.join(", ")}${kept} — ${usd(c.paused_monthly)}/mo recovered`
    : keptNames.length
    ? ` + keeps ${keptNames.join(", ")} hibernated (${usd(c.paused_monthly)}/mo)`
    : " + no subscription changes";
  return base + pauses + ".";
}

export function impactLabel(c: Candidate): { label: string; severity: "safe" | "moderate" | "danger" } {
  if (c.delay_days === 0)
    return { label: `✅ ${userProfile.primary_goal.name}: on time (${c.goal_date})`, severity: "safe" };
  const label = `${c.delay_days <= 10 ? "⚠️" : "🚨"} ${userProfile.primary_goal.name} delay: +${c.delay_days} days (→ ${c.new_goal_date})`;
  return { label, severity: c.delay_days <= 10 ? "moderate" : "danger" };
}

/**
 * Feasibility score (15–99) — the single formula used by checkout and the
 * dashboard. On time + light cash strain = high. Each delay day costs 4
 * points; each installment's share of 2 weeks of surplus costs up to 20;
 * needing extra subscription pauses costs 4.
 */
export function feasibilityScore(f: { delay_days: number; installment: number; daily_rate: number; extra_pauses: boolean }): number {
  const strain = f.daily_rate > 0 ? f.installment / (f.daily_rate * 14) : 5;
  return Math.max(15, Math.min(99, Math.round(98 - f.delay_days * 4 - strain * 20 - (f.extra_pauses ? 4 : 0))));
}

/** Feasibility of a solver candidate, against the user's current daily surplus. */
export function candidateFeasibility(c: Candidate, dailySurplus: number): number {
  return feasibilityScore({
    delay_days: c.delay_days,
    installment: c.installment,
    daily_rate: dailySurplus,
    extra_pauses: c.new_pause_ids.length > 0,
  });
}

/** How far the model's own feasibility may move from the engine's. */
export const FEASIBILITY_AI_BAND = 15;

export interface StrategyCard {
  id: string;
  emoji: string;
  name: string;
  badge: string;
  rationale: string;
  structure: string;
  impact_label: string;
  impact_days: number;
  impact_severity: "safe" | "moderate" | "danger";
  recommended: boolean;
  pre_pause_ids: string[];
  installment_amount: string;
  /** "gemma" = AI text passed the firewall; "corrected" = AI text replaced; "engine" = no AI */
  text_source: "gemma" | "corrected" | "engine";
  solver_rank: number;
  metrics: {
    interest: number;
    total_cost: number;
    cash_out_before_deadline: number;
    paused_monthly: number;
    new_goal_date: string;
  };
}

/** Turn a solver candidate into a checkout card (AI title/text optional, engine text otherwise). */
export function toStrategyCard(
  c: Candidate,
  rank: number,
  mode: PriorityMode,
  product: string,
  recommended: boolean,
  ai?: { title: string; rationale: string; ok: boolean }
): StrategyCard {
  const impact = impactLabel(c);
  const fallbackName = `${c.plan_label}${c.new_pause_ids.length ? " + Smart Pauses" : ""}`;
  return {
    id: c.key,
    emoji: c.emoji,
    name: ai?.title?.trim() || fallbackName,
    badge: recommended
      ? mode === "goal_shielding" ? "🛡️ Trip Protected" : mode === "career_growth" ? "🚀 Top Pick" : ai ? "AI Recommended" : "⭐ Best Balance"
      : c.delay_days === 0 ? "On schedule" : c.delay_days <= 10 ? "Minor delay" : "Goal at risk",
    rationale: ai?.ok ? ai.rationale.trim() : templateRationale(c, mode, product),
    structure: describeStructure(c),
    impact_label: impact.label,
    impact_days: c.delay_days,
    impact_severity: impact.severity,
    recommended,
    pre_pause_ids: c.pause_ids,
    installment_amount: c.installment.toFixed(2),
    text_source: ai ? (ai.ok ? "gemma" : "corrected") : "engine",
    solver_rank: rank,
    metrics: {
      interest: c.interest,
      total_cost: c.total_cost,
      cash_out_before_deadline: c.cash_out_before_deadline,
      paused_monthly: c.paused_monthly,
      new_goal_date: c.new_goal_date,
    },
  };
}

/** Engine-only cards (no model): the solver's 3 picks, best first. */
export function engineStrategyCards(price: number, mode: PriorityMode, product: string, context?: Partial<PaceContext>): StrategyCard[] {
  const { picks, candidates } = solveStrategies(price, mode, context);
  return picks.map((c, i) => toStrategyCard(c, candidates.indexOf(c) + 1, mode, product, i === 0));
}

/** One-line ground truth for a candidate — what a rejected AI claim is corrected to. */
export function solverFacts(c: Candidate): string {
  const parts = [
    `goal delay ${c.delay_days} day${c.delay_days === 1 ? "" : "s"}`,
    `interest $${c.interest.toFixed(2)}`,
    `payment $${c.installment.toFixed(2)}`,
  ];
  if (c.paused_monthly > 0) parts.push(`frees $${c.paused_monthly.toFixed(2)}/mo`);
  return parts.join(" · ");
}

export function templateRationale(c: Candidate, mode: PriorityMode, product: string): string {
  const goal = userProfile.primary_goal.name;
  const timing =
    c.delay_days === 0
      ? `${goal} stays on its original date`
      : `${goal} slips ${c.delay_days} days`;
  const cost = c.interest > 0 ? `costs ${usd(c.interest)} in interest` : "costs nothing extra";
  const lead =
    mode === "career_growth"
      ? `Gets ${product} working for your career today and ${cost}.`
      : mode === "goal_shielding"
      ? `${timing.charAt(0).toUpperCase() + timing.slice(1)} — ${usd(c.cash_out_before_deadline)} leaves your account before the deadline.`
      : `Balances cost and timing: this ${cost}.`;
  const tail =
    mode === "goal_shielding" ? `Total cost ${usd(c.total_cost)}.` : `${timing.charAt(0).toUpperCase() + timing.slice(1)}.`;
  const pauses = c.pause_names.length
    ? ` Pausing ${c.pause_names.join(", ")} frees ${usd(c.paused_monthly)}/mo.`
    : "";
  return `${lead} ${tail}${pauses}`;
}

/** Every number the LLM is allowed to mention for a candidate. */
export function allowedNumbers(c: Candidate, price: number, ctx: SolverResult["context"]): number[] {
  const g = userProfile.primary_goal;
  return [
    c.installment, c.payment_count, c.interest, c.total_cost, c.paused_monthly,
    c.cash_out_before_deadline, c.delay_days, c.first_payment_day, price, 0, 9.99, 0.0999,
    g.saved, g.target, ctx.remaining, ctx.days_left, userProfile.monthly_net_inflow,
    ctx.saved_extra, g.saved + ctx.saved_extra,
    14, 30, 2026, 4, 6, 12,
    ...PAUSEABLE_SUBS.filter((s) => c.pause_ids.includes(s.id)).map((s) => s.monthly),
  ];
}

/**
 * Semantic firewall: catches a small model describing the wrong option
 * (e.g. "no interest" on a financed plan). Returns the reason or null.
 */
export function findContradiction(text: string, c: Candidate): string | null {
  const t = text.toLowerCase();
  if (c.interest > 0 && /no interest|interest[- ]free|0% apr|zero interest|saves? (you )?(some )?money/.test(t))
    return "claims no interest on a financed plan";
  if (c.plan !== "outright" && /(pay(ing)? in full|full (payment|purchase)|single payment|upfront)/.test(t))
    return "describes pay-in-full on an installment plan";
  if (c.plan === "outright" && /(monthly|installment|bi-weekly|instalment)/.test(t))
    return "describes installments on a pay-in-full plan";
  if (c.delay_days > 0 && /(on time|on track|no delay|zero delay|untouched|fully protected)/.test(t))
    return "claims no goal delay";
  if (
    c.delay_days === 0 &&
    /(delay(s|ed)?|late|(push|set|move)(es|s|ed)? (\w+ ){0,3}back|slip(s|ped)? (by )?\d|time is lost)/.test(t) &&
    !/no delay|zero delay|without delay|0 days?/.test(t)
  )
    return "claims a delay on an on-time plan";
  return null;
}

/**
 * Protected-subscription firewall: rejects a plan that pauses a protected
 * subscription, or AI text that tells the user to pause/cancel one
 * ("pause Cloud Tier"). Negated phrasing ("keep Cloud Tier", "without
 * pausing Cloud Tier") is allowed. Returns the reason or null.
 */
const VERB: Record<string, string> = { paus: "pause", hibernat: "hibernate", freez: "freeze" };

export function findProtectedPause(text: string, c: Pick<Candidate, "pause_ids">): string | null {
  const prot = PAUSEABLE_SUBS.filter((s) => isProtectedSub(s.id));
  const planned = prot.filter((s) => c.pause_ids.includes(s.id));
  if (planned.length) return `plan pauses protected ${planned.map((s) => s.name).join(", ")}`;
  const t = text.toLowerCase();
  for (const s of prot) {
    const re = new RegExp(`(paus|cancel|hibernat|freez|drop|cut)\\w*\\s+(?:\\w+\\s+){0,3}${s.name.toLowerCase()}`, "g");
    for (const m of t.matchAll(re)) {
      const before = t.slice(Math.max(0, (m.index ?? 0) - 25), m.index);
      if (!/(not|never|without|n't|no need to|avoid|keep\w*|instead of)\s*(\w+\s+){0,2}$/.test(before))
        return `tells the user to ${VERB[m[1]] ?? m[1]} protected ${s.name}`;
    }
  }
  return null;
}

/** Remove the product name and unit-bearing spec tokens (16GB, 512 GB, 14-inch, 3.2GHz) from text. */
export function stripProductSpecs(text: string, product: string): string {
  let t = text;
  const name = product.trim();
  if (name) t = t.split(name).join(" ");
  return t.replace(/\b\d+(?:\.\d+)?\s?(?:gb|tb|mb|ghz|mhz|hz|mp|mah|wh|-?inch(?:es)?|cores?|-core)\b/gi, " ");
}

export interface FirewallVerdict {
  ok: boolean;
  unverified: number[];
  contradiction: string | null;
  protected_pause: string | null;
  /** Human-readable reasons (pass reasons when ok). */
  reasons: string[];
}

/**
 * The full card firewall used by /api/agent (and the glass-box injection
 * demo): numeric grounding + semantic contradiction + protected-sub rule.
 * `extraAllowed` = other engine facts the model was shown (e.g. feasibility).
 */
export function firewallCheck(
  title: string,
  rationale: string,
  c: Candidate,
  price: number,
  ctx: SolverResult["context"],
  product: string,
  extraAllowed: number[] = []
): FirewallVerdict {
  const text = `${title} ${rationale}`;
  // Product specs ("Apex Air 13 Laptop (16GB / 512GB)", "512 GB") are facts, but only
  // as specs: strip them before checking, so a bare "16 days" is still caught.
  const specs = stripProductSpecs(text, product);
  const unverified = findUnverifiedNumbers(specs, [...allowedNumbers(c, price, ctx), ...extraAllowed]);
  const contradiction = findContradiction(text, c);
  const protected_pause = findProtectedPause(text, c);
  const tooShort = rationale.trim().length <= 15;
  const ok = unverified.length === 0 && !contradiction && !protected_pause && !tooShort;
  return {
    ok,
    unverified,
    contradiction,
    protected_pause,
    reasons: ok
      ? ["Every number matched the solver", "No contradiction with the plan's facts", "Protected Cloud Tier untouched"]
      : [
          ...(unverified.length
            ? [`Unverified number${unverified.length > 1 ? "s" : ""}: ${unverified.join(", ")} (not produced by the solver)`]
            : []),
          ...(contradiction ? [`Contradiction: ${contradiction}`] : []),
          ...(protected_pause ? [`Protected subscription: ${protected_pause}`] : []),
          ...(tooShort ? ["Rationale too short"] : []),
        ],
  };
}

/** Returns numbers in `text` that don't match any allowed value (±2%, min ±1). */
export function findUnverifiedNumbers(text: string, allowed: number[]): number[] {
  const nums = (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((s) => parseFloat(s.replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n));
  // Ignore dates like "Nov 30" / years and product model numbers (e.g. "A1")
  return nums.filter((n) => !allowed.some((a) => Math.abs(n - a) <= Math.max(1, Math.abs(a) * 0.02)) && !(n <= 3));
}
