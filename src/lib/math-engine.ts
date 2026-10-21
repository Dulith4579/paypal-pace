// ============================================================
// PayPal Pace – Deterministic Math Engine
// ============================================================
// All financial calculations are performed deterministically
// BEFORE being passed to the LLM, ensuring numerical precision.
// ============================================================

import type { Milestone, ImpactCalculation, RecoveryPath } from "@/types/financial";

/**
 * Compute the number of calendar days between now and a target date.
 * Returns at least 1 to avoid division by zero.
 */
export function daysRemaining(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
  const diff = target.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(days, 1);
}

/**
 * Calculate the remaining balance for a milestone.
 * R = T - B
 */
export function remainingBalance(milestone: Milestone): number {
  return Math.max(milestone.target_amount - milestone.current_balance, 0);
}

/**
 * Base daily savings rate required.
 * r_base = R / D
 */
export function baseDailyRate(R: number, D: number): number {
  if (D <= 0) return R;
  return R / D;
}

/**
 * Delay in days caused by a purchase.
 * ΔD = P * D / R
 */
export function delayDays(purchaseAmount: number, D: number, R: number): number {
  if (R <= 0) return Infinity;
  return Math.round((purchaseAmount * D) / R);
}

/**
 * Daily hike needed to preserve the original target date.
 * Δr = P / D
 */
export function dailyHike(purchaseAmount: number, D: number): number {
  if (D <= 0) return purchaseAmount;
  return purchaseAmount / D;
}

/**
 * Pay Later (Pay in 4) calculation.
 * Splits purchase into 4 equal bi-weekly installments.
 * Returns installment amount and the reduced instantaneous daily drag.
 */
export function payIn4Impact(
  purchaseAmount: number,
  D: number
): { installment: number; dailyDrag: number } {
  const installment = purchaseAmount / 4;
  // The drag is spread across ~56 days (4 × 14 days) instead of hitting day-1.
  // Effective daily drag = P / 56 (bi-weekly over 8 weeks).
  const paymentSpreadDays = 56;
  const dailyDrag = purchaseAmount / paymentSpreadDays;
  return { installment: Math.round(installment * 100) / 100, dailyDrag: Math.round(dailyDrag * 100) / 100 };
}

/**
 * Compute progress percentage for a milestone.
 */
export function progressPercent(milestone: Milestone): number {
  if (milestone.target_amount <= 0) return 100;
  return Math.min(
    Math.round((milestone.current_balance / milestone.target_amount) * 10000) / 100,
    100
  );
}

/**
 * Add days to a date string, return new ISO date.
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Full impact calculation for a single milestone given a purchase amount.
 */
export function calculateImpact(
  milestone: Milestone,
  purchaseAmount: number
): ImpactCalculation {
  const R = remainingBalance(milestone);
  const D = daysRemaining(milestone.target_date);
  const rBase = baseDailyRate(R, D);
  const dDelay = delayDays(purchaseAmount, D, R);
  const dHike = dailyHike(purchaseAmount, D);
  const p4 = payIn4Impact(purchaseAmount, D);

  return {
    goal_id: milestone.goal_id,
    goal_name: milestone.name,
    remaining_balance: Math.round(R * 100) / 100,
    days_remaining: D,
    base_daily_rate: Math.round(rBase * 100) / 100,
    delay_days: dDelay,
    daily_hike: Math.round(dHike * 100) / 100,
    pay_in_4_installment: p4.installment,
    pay_in_4_daily_drag: p4.dailyDrag,
    new_target_date: addDaysToDate(milestone.target_date, dDelay),
    progress_pct: progressPercent(milestone),
  };
}

/**
 * Calculate impacts across all active milestones and generate recovery paths.
 */
export function calculateAllImpacts(
  milestones: Milestone[],
  purchaseAmount: number
): { impacts: ImpactCalculation[]; recoveryPaths: RecoveryPath[] } {
  const activeMilestones = milestones.filter((m) => m.status === "active");
  const impacts = activeMilestones.map((m) => calculateImpact(m, purchaseAmount));

  // Find the most-affected milestone
  const mostAffected = impacts.reduce(
    (prev, curr) => (curr.delay_days > prev.delay_days ? curr : prev),
    impacts[0]
  );

  const recoveryPaths: RecoveryPath[] = [
    {
      type: "timeline_flex",
      title: "Timeline Flex",
      description: `Extend your "${mostAffected?.goal_name}" deadline by ${mostAffected?.delay_days} days. No extra daily savings needed.`,
      impact_summary: `Your target date moves to ${mostAffected?.new_target_date}`,
      action_label: "Extend Timeline",
      metric_value: `+${mostAffected?.delay_days} days`,
      metric_label: "Timeline extension",
      recommended: false,
    },
    {
      type: "micro_surge",
      title: "Micro-Surge Catch-Up",
      description: `Temporarily boost your daily auto-save by $${mostAffected?.daily_hike.toFixed(2)}/day to stay on track.`,
      impact_summary: `Keep your original deadline with a small daily increase`,
      action_label: "Activate Micro-Surge",
      metric_value: `+$${mostAffected?.daily_hike.toFixed(2)}/day`,
      metric_label: "Daily savings increase",
      recommended: true,
    },
    {
      type: "pay_later",
      title: "PayPal Pay in 4",
      description: `Split into 4 interest-free payments of $${mostAffected?.pay_in_4_installment.toFixed(2)} every 2 weeks. Only $${mostAffected?.pay_in_4_daily_drag.toFixed(2)}/day impact.`,
      impact_summary: `Spread the cost over 8 weeks with minimal daily impact`,
      action_label: "Use Pay in 4",
      metric_value: `$${mostAffected?.pay_in_4_installment.toFixed(2)}×4`,
      metric_label: "Bi-weekly payment",
      recommended: false,
    },
    {
      type: "subscription_cleanup",
      title: "Subscription Clean-up",
      description: `Cancel dormant subscriptions to recover monthly savings that offset this purchase.`,
      impact_summary: `Redirect unused subscription funds to cover the gap`,
      action_label: "Review Subscriptions",
      metric_value: "Review",
      metric_label: "Potential savings",
      recommended: false,
    },
  ];

  return { impacts, recoveryPaths };
}

/**
 * Format currency values for display.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a date string for display.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
