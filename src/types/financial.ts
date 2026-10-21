// ============================================================
// PayPal Pace – Financial Domain Types
// ============================================================

/** Categories for savings milestones */
export type MilestoneCategory =
  | "travel"
  | "tech"
  | "education"
  | "emergency"
  | "lifestyle"
  | "investment"
  | "health"
  | "other";

/** Status of a savings milestone */
export type MilestoneStatus = "active" | "paused" | "completed" | "at_risk";

/** A single savings milestone / goal */
export interface Milestone {
  goal_id: string;
  name: string;
  target_amount: number;
  current_balance: number;
  target_date: string; // ISO-8601 date string
  category: MilestoneCategory;
  status: MilestoneStatus;
  icon: string; // Lucide icon name
  created_at: string;
}

/** Result of the deterministic math engine for a single milestone */
export interface ImpactCalculation {
  goal_id: string;
  goal_name: string;
  remaining_balance: number; // R = T - B
  days_remaining: number; // D
  base_daily_rate: number; // r_base = R / D
  delay_days: number; // ΔD = P * D / R
  daily_hike: number; // Δr = P / D
  pay_in_4_installment: number; // P / 4
  pay_in_4_daily_drag: number; // reduced drag per day
  new_target_date: string; // ISO date if timeline flex chosen
  progress_pct: number; // (B / T) * 100
}

/** A recovery path the user can choose */
export type RecoveryPathType =
  | "timeline_flex"
  | "micro_surge"
  | "pay_later"
  | "subscription_cleanup";

export interface RecoveryPath {
  type: RecoveryPathType;
  title: string;
  description: string;
  impact_summary: string;
  action_label: string;
  /** Key metric for the path (e.g., "+24 days", "+$1.20/day") */
  metric_value: string;
  metric_label: string;
  recommended: boolean;
}

/** Full recalculation result returned by the rebalance API */
export interface RebalanceResult {
  purchase_amount: number;
  empathy_message: string;
  impacts: ImpactCalculation[];
  recovery_paths: RecoveryPath[];
  ai_recommendation: string;
}

/** Subscription info detected from PayPal history */
export interface Subscription {
  sub_id: string;
  service_name: string;
  monthly_cost: number;
  last_used_date: string;
  status: "active" | "dormant" | "cancelled";
  logo_url?: string;
  category: string;
}

/** A financial transaction record */
export interface Transaction {
  tx_id: string;
  goal_id: string | null;
  amount: number;
  merchant: string;
  date: string;
  is_subscription: boolean;
  type: "debit" | "credit" | "refund";
  description?: string;
}

/** Checkout simulator item */
export interface SimulatorProduct {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  description: string;
}

/** Dashboard summary stats */
export interface DashboardStats {
  total_saved: number;
  total_target: number;
  active_goals: number;
  monthly_subscriptions: number;
  dormant_subscriptions: number;
  potential_monthly_savings: number;
  overall_progress_pct: number;
  on_track_goals: number;
  at_risk_goals: number;
}
