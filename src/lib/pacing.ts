// ============================================================
// PayPal Pace – Pacing Engine (wrapper around math-engine)
// ============================================================
// This module defines the data structures for expense items and savings milestones
// and provides a high‑level calculatePacing function that utilizes the deterministic
// helpers from math-engine.ts.

import type { Milestone, ImpactCalculation, RecoveryPath } from "@/types/financial";
import {
  calculateAllImpacts,
  calculateImpact,
  remainingBalance,
  daysRemaining,
  payIn4Impact,
  formatCurrency,
  addDaysToDate,
} from "@/lib/math-engine";

/**
 * Represents a single expense (e.g., a laptop, gym membership).
 */
export interface ExpenseItem {
  /** Unique identifier */
  expense_id: string;
  /** Human‑readable name */
  name: string;
  /** Monetary amount of the expense (USD) */
  amount: number;
  /** Category or short description */
  description: string;
  /** Whether the expense is currently paused (i.e., not counted towards the purchase) */
  paused: boolean;
}

/**
 * Savings milestone – extends the existing Milestone type.
 */
export interface SavingsMilestone extends Milestone {}

// ────────────────────────────────────────────────────────────
// INTELLIGENT PURCHASE CLASSIFICATION
// ────────────────────────────────────────────────────────────

export type PurchaseClass =
  | "career_asset"
  | "health_wellness"
  | "education"
  | "discretionary";

interface ClassificationRule {
  class: PurchaseClass;
  keywords: string[];
  label: string;
  framingPrefix: string;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    class: "career_asset",
    keywords: [
      "laptop", "macbook", "workstation", "monitor", "keyboard",
      "development", "software", "ide", "server", "hosting",
      "domain", "desk", "chair", "office", "webcam", "microphone",
    ],
    label: "Career / Productivity Asset",
    framingPrefix:
      "This is an investment that increases your earning potential and productivity.",
  },
  {
    class: "education",
    keywords: [
      "course", "class", "textbook", "book", "tutorial",
      "bootcamp", "certification", "degree", "workshop", "seminar",
      "udemy", "coursera", "pluralsight",
    ],
    label: "Education & Upskilling",
    framingPrefix:
      "Investing in knowledge delivers compounding returns over your career.",
  },
  {
    class: "health_wellness",
    keywords: [
      "gym", "fitness", "health", "workout", "yoga",
      "nutrition", "supplement", "therapy", "medical", "dental",
      "running", "bicycle", "treadmill",
    ],
    label: "Health & Wellness",
    framingPrefix:
      "Prioritising your health is never a waste — it powers everything else.",
  },
  {
    class: "discretionary",
    keywords: [], // Catch‑all
    label: "Lifestyle & Discretionary",
    framingPrefix:
      "Balanced spending is part of a healthy financial life. Let's pace it smartly.",
  },
];

/**
 * Classify a purchase into a utility category.
 */
export function classifyPurchase(
  nameOrPrompt: string
): { purchaseClass: PurchaseClass; label: string; framingPrefix: string } {
  const haystack = nameOrPrompt.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.length === 0) continue; // skip catch‑all for now
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return {
        purchaseClass: rule.class,
        label: rule.label,
        framingPrefix: rule.framingPrefix,
      };
    }
  }

  // Default: discretionary
  const fallback = CLASSIFICATION_RULES.find((r) => r.class === "discretionary")!;
  return {
    purchaseClass: fallback.class,
    label: fallback.label,
    framingPrefix: fallback.framingPrefix,
  };
}

/**
 * Simple classifier that determines whether an expense is considered "high‑utility".
 */
export const HIGH_UTILITY_EXPENSES = [
  "laptop",
  "workstation",
  "software",
  "office",
  "education",
  "health",
  "transport",
];

export function isHighUtility(expense: ExpenseItem): boolean {
  const haystack = `${expense.name} ${expense.description}`.toLowerCase();
  return HIGH_UTILITY_EXPENSES.some((term) => haystack.includes(term));
}

// ────────────────────────────────────────────────────────────
// STRUCTURED MULTI-LEVER PLAN
// ────────────────────────────────────────────────────────────

export interface PaceLever {
  lever: string;
  detail: string;
  savings: number;
}

export interface PaceIntelligence {
  classification: { purchaseClass: PurchaseClass; label: string; framingPrefix: string };
  levers: PaceLever[];
  confidence_score: number;
  without_pace_delay_days: number;
  with_pace_delay_days: number;
  milestone_snapshot: {
    goal_name: string;
    original_target_date: string;
    with_pace_target_date: string;
    without_pace_target_date: string;
  } | null;
}

/**
 * Build a structured, deterministic 3-lever plan.
 */
export function buildStructuredPlan(
  purchaseAmount: number,
  expenseItems: ExpenseItem[],
  milestones: Milestone[],
  productName?: string
): PaceIntelligence {
  // Classify
  const classification = classifyPurchase(productName || "purchase");

  // Paused expenses savings
  const pausedItems = expenseItems.filter((e) => e.paused);
  const pausedTotal = pausedItems.reduce((s, e) => s + e.amount, 0);

  // Pay in 4
  const p4 = payIn4Impact(purchaseAmount, 56);

  // Lever 1: Pay in 4
  const lever1: PaceLever = {
    lever: "PayPal Pay in 4 Allocation",
    detail: `${formatCurrency(p4.installment)} / 2 weeks at 0% APR — spread over 8 weeks`,
    savings: purchaseAmount - p4.installment, // deferred amount
  };

  // Lever 2: Targeted Subscription Pauses
  const topPaused = pausedItems
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2);
  const lever2Detail = topPaused.length > 0
    ? topPaused.map((e) => `${e.name} (${formatCurrency(e.amount)}/mo)`).join(", ")
    : "No subscriptions paused yet — toggle items in the grid to offset";
  const lever2: PaceLever = {
    lever: "Targeted Subscription Pauses",
    detail: `${lever2Detail} — ${formatCurrency(pausedTotal)}/mo recovered`,
    savings: pausedTotal,
  };

  // Most affected milestone
  const activeMilestones = milestones.filter((m) => m.status === "active");
  let mostAffected: ImpactCalculation | null = null;
  if (activeMilestones.length > 0) {
    const impacts = activeMilestones.map((m) => calculateImpact(m, purchaseAmount));
    mostAffected = impacts.reduce((prev, curr) =>
      curr.delay_days > prev.delay_days ? curr : prev
    );
  }

  // Days without pace
  const withoutPaceDelay = mostAffected?.delay_days ?? 0;

  // With Pace: offset from Pay in 4 spread + paused subs
  // Pay in 4 reduces instantaneous hit; paused subs provide monthly recovery
  // Effective delay = max(0, delayDays - daysRecoveredFromPausedSubs)
  const monthlyRecovery = pausedTotal;
  const daysRecoveredPerMonth = mostAffected
    ? Math.floor(monthlyRecovery / Math.max(mostAffected.base_daily_rate, 0.01))
    : 0;
  // Pay in 4 reduces delay by ~75% (only 1/4 hits immediately)
  const payIn4DelayReduction = Math.floor(withoutPaceDelay * 0.75);
  const withPaceDelay = Math.max(
    0,
    withoutPaceDelay - payIn4DelayReduction - daysRecoveredPerMonth
  );

  // Lever 3: Milestone Protection
  const milestone = activeMilestones[0];
  const lever3: PaceLever = {
    lever: "Milestone Protection Guarantee",
    detail: mostAffected
      ? `${withPaceDelay} day${withPaceDelay !== 1 ? "s" : ""} slippage on "${mostAffected.goal_name}" (vs ${withoutPaceDelay} days without Pace)`
      : "All milestones remain on track",
    savings: 0,
  };

  // Confidence score: 85–98 based on coverage
  const coverageRatio = Math.min(
    (p4.installment * 3 + pausedTotal) / Math.max(purchaseAmount, 1),
    1
  );
  const confidence_score = Math.round(85 + coverageRatio * 13);

  // Milestone snapshot
  let milestoneSnapshot: PaceIntelligence["milestone_snapshot"] = null;
  if (mostAffected && milestone) {
    milestoneSnapshot = {
      goal_name: mostAffected.goal_name,
      original_target_date: milestone.target_date,
      without_pace_target_date: addDaysToDate(milestone.target_date, withoutPaceDelay),
      with_pace_target_date: addDaysToDate(milestone.target_date, withPaceDelay),
    };
  }

  return {
    classification,
    levers: [lever1, lever2, lever3],
    confidence_score,
    without_pace_delay_days: withoutPaceDelay,
    with_pace_delay_days: withPaceDelay,
    milestone_snapshot: milestoneSnapshot,
  };
}

// ────────────────────────────────────────────────────────────
// CORE PACING CALCULATION
// ────────────────────────────────────────────────────────────

/**
 * Core pacing calculation.
 * @param purchaseAmount Total amount of the purchase the user wants to make.
 * @param expenseItems   Array of all expense items (including paused ones).
 * @param savingsMilestones   Array of active savings milestones.
 * @param productName    Optional product name for classification.
 * @returns An object bundling expense & milestone summaries together with
 *          the deterministic impact calculations and structured intelligence.
 */
export function calculatePacing(
  purchaseAmount: number,
  expenseItems: ExpenseItem[],
  savingsMilestones: SavingsMilestone[],
  productName?: string
) {
  // ----- Expense summary -----
  const totalExpenses = expenseItems.reduce((sum, e) => sum + e.amount, 0);
  const pausedExpenses = expenseItems.filter((e) => e.paused);
  const pausedCount = pausedExpenses.length;
  const pausedTotal = pausedExpenses.reduce((sum, e) => sum + e.amount, 0);

  const expense_summary = {
    total_expense_amount: Number(totalExpenses.toFixed(2)),
    paused_expenses_count: pausedCount,
    paused_expenses_total: Number(pausedTotal.toFixed(2)),
    high_utility_expenses: expenseItems.filter(isHighUtility).map((e) => e.expense_id),
  };

  // ----- Milestone summary -----
  const number_of_milestones = savingsMilestones.length;
  const total_target_amount = savingsMilestones.reduce(
    (sum, m) => sum + m.target_amount,
    0
  );
  const total_current_balance = savingsMilestones.reduce(
    (sum, m) => sum + m.current_balance,
    0
  );
  const total_remaining_balance = savingsMilestones.reduce(
    (sum, m) => sum + remainingBalance(m),
    0
  );

  const milestone_summary = {
    number_of_milestones,
    total_target_amount: Number(total_target_amount.toFixed(2)),
    total_current_balance: Number(total_current_balance.toFixed(2)),
    total_remaining_balance: Number(total_remaining_balance.toFixed(2)),
  };

  // ----- Impact calculations -----
  const all_impact = savingsMilestones.map((m) => calculateImpact(m, purchaseAmount));

  // Recovery paths derived from deterministic helper
  const { recoveryPaths } = calculateAllImpacts(savingsMilestones, purchaseAmount);

  // ----- Structured Intelligence -----
  const intelligence = buildStructuredPlan(
    purchaseAmount,
    expenseItems,
    savingsMilestones,
    productName
  );

  return {
    expense_summary,
    milestone_summary,
    all_impact,
    recovery_paths: recoveryPaths,
    intelligence,
  };
}
