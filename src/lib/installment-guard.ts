// src/lib/installment-guard.ts
// Next-Installment Guard math, shared by the dashboard guard card and the
// Agent Activity Timeline. Pure: same fundingForecast the dashboard uses.

import { paceContextOf, todayISO, type PacePurchase, type PaceState } from "@/lib/pace-store";
import { fundingForecast, planPayments, PAUSEABLE_SUBS, isProtectedSub } from "@/lib/strategy-solver";
import { pausedMonthlyOf, FOOD_CAP_MONTHLY } from "@/lib/arbitrage";

export const PLAN_NAME: Record<PacePurchase["plan"], string> = {
  outright: "Pay in full",
  pay_in_4: "Pay in 4",
  pay_monthly_6: "Pay Monthly",
  pay_monthly_12: "Pay Monthly",
};

/** Cheapest-first hibernation sets the guard may propose (never protected subs). */
const FIX_SETS: string[][] = [["sub-ga"], ["sub-sf"], ["sub-sf", "sub-ga"], ["sub-md"], ["sub-sf", "sub-ga", "sub-md"]];

function daysSince(iso: string): number {
  return Math.max(0, Math.round((new Date(todayISO()).getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** Next unpaid installment: payments on the purchase day were settled at checkout. */
export function nextInstallment(p: PacePurchase) {
  const elapsed = daysSince(p.date);
  const all = planPayments(p.plan, p.amount).map((x, i) => ({ n: i + 1, day: x.day - elapsed, original: x.day, amount: x.amount }));
  const upcoming = all.filter((x) => x.original > 0 && x.day >= 0);
  return upcoming.length ? { ...upcoming[0], total: all.length, left: upcoming.length } : null;
}

export interface GuardRow {
  p: PacePurchase;
  next: NonNullable<ReturnType<typeof nextInstallment>>;
  /** Surplus projected to accrue by the due date. */
  accrued: number;
  shortBy: number;
  /** Goal delay (days) across all remaining payments. */
  slip: number;
  ok: boolean;
  fix: { ids: string[]; names: string[]; monthly: number } | null;
}

export function guardRows(pace: PaceState): GuardRow[] {
    if (!pace.purchases.length) return [];
    const ctx = paceContextOf(pace);
    const extra = pausedMonthlyOf(pace.pausedIds) + (pace.foodCap ? FOOD_CAP_MONTHLY : 0);
    const forecast = fundingForecast(extra, undefined, ctx);

    // Smallest extra hibernation that removes the slippage (if any)
    const fixFor = (needDelayZero: boolean, shortBy: number, dueDay: number) => {
      for (const set of FIX_SETS) {
        const add = set.filter((id) => !pace.pausedIds.includes(id) && !isProtectedSub(id));
        if (!add.length) continue;
        const addMonthly = pausedMonthlyOf(add);
        const f = fundingForecast(extra + addMonthly, undefined, ctx);
        const coversNow = shortBy <= (addMonthly / 30) * Math.max(1, dueDay);
        if ((!needDelayZero || f.delay_days === 0) && coversNow)
          return { ids: add, names: PAUSEABLE_SUBS.filter((s) => add.includes(s.id)).map((s) => s.name), monthly: addMonthly };
      }
      return null;
    };

    return pace.purchases
      .map((p) => ({ p, next: nextInstallment(p) }))
      .filter((r): r is { p: PacePurchase; next: NonNullable<ReturnType<typeof nextInstallment>> } => r.next !== null)
      .map(({ p, next }) => {
        // Surplus that accrues by the due date vs. every installment (all plans) due by then
        const accrued = forecast.daily_rate * Math.max(1, next.day);
        const dueByThen = ctx.prior_payments.filter((x) => x.day > 0 && x.day <= next.day).reduce((a, x) => a + x.amount, 0);
        const shortBy = Math.max(0, Math.round((dueByThen - accrued) * 100) / 100);
        const slip = forecast.delay_days;
        const ok = shortBy === 0 && slip === 0;
        return { p, next, accrued, shortBy, slip, ok, fix: ok ? null : fixFor(slip > 0, shortBy, next.day) };
      });
}
