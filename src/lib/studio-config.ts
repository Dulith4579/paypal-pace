// ============================================================
// PayPal Pace – AG Studio Configuration
// ============================================================
// Defines the data sources, relationships, calculated expressions,
// and theme customization for the AG Studio embedded analytics.
// ============================================================

import { mockMilestones, mockTransactions, mockSubscriptions } from "./mock-data";

// ────────────────────────────────────────────────────────────
// DATA SOURCES
// ────────────────────────────────────────────────────────────

export interface StudioSource {
  name: string;
  columns: StudioColumn[];
  data: Record<string, unknown>[];
}

export interface StudioColumn {
  field: string;
  headerName: string;
  type?: "text" | "number" | "date" | "boolean";
  editable?: boolean;
  width?: number;
}

export function getMilestonesSource(): StudioSource {
  return {
    name: "milestones",
    columns: [
      { field: "goal_id", headerName: "Goal ID", type: "text", width: 120 },
      { field: "name", headerName: "Goal Name", type: "text", width: 180 },
      { field: "target_amount", headerName: "Target ($)", type: "number", width: 130 },
      { field: "current_balance", headerName: "Saved ($)", type: "number", width: 130 },
      { field: "target_date", headerName: "Target Date", type: "date", width: 140 },
      { field: "category", headerName: "Category", type: "text", width: 120 },
      { field: "status", headerName: "Status", type: "text", width: 100 },
      { field: "progress_pct", headerName: "Progress %", type: "number", width: 120 },
      { field: "daily_burn_rate", headerName: "Daily Rate ($)", type: "number", width: 130 },
    ],
    data: mockMilestones.map((m) => {
      const remaining = m.target_amount - m.current_balance;
      const now = new Date();
      const target = new Date(m.target_date);
      const daysLeft = Math.max(Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)), 1);
      return {
        ...m,
        progress_pct: Math.round((m.current_balance / m.target_amount) * 10000) / 100,
        daily_burn_rate: Math.round((remaining / daysLeft) * 100) / 100,
      };
    }),
  };
}

export function getTransactionsSource(): StudioSource {
  return {
    name: "transactions",
    columns: [
      { field: "tx_id", headerName: "Transaction ID", type: "text", width: 140 },
      { field: "goal_id", headerName: "Goal ID", type: "text", width: 120 },
      { field: "amount", headerName: "Amount ($)", type: "number", width: 120 },
      { field: "merchant", headerName: "Merchant", type: "text", width: 180 },
      { field: "date", headerName: "Date", type: "date", width: 130 },
      { field: "is_subscription", headerName: "Subscription?", type: "boolean", width: 130 },
      { field: "type", headerName: "Type", type: "text", width: 100 },
      { field: "description", headerName: "Description", type: "text", width: 220 },
    ],
    data: mockTransactions.map((t) => ({ ...t })),
  };
}

export function getSubscriptionsSource(): StudioSource {
  return {
    name: "subscriptions",
    columns: [
      { field: "sub_id", headerName: "Sub ID", type: "text", width: 120 },
      { field: "service_name", headerName: "Service", type: "text", width: 180 },
      { field: "monthly_cost", headerName: "Monthly ($)", type: "number", width: 120 },
      { field: "last_used_date", headerName: "Last Used", type: "date", width: 140 },
      { field: "status", headerName: "Status", type: "text", width: 100 },
      { field: "category", headerName: "Category", type: "text", width: 130 },
    ],
    data: mockSubscriptions.map((s) => ({ ...s })),
  };
}

// ────────────────────────────────────────────────────────────
// RELATIONSHIPS
// ────────────────────────────────────────────────────────────

export interface StudioRelationship {
  from: string;
  to: string;
  fromField: string;
  toField: string;
  type: "many-to-one" | "one-to-many" | "one-to-one";
}

export const studioRelationships: StudioRelationship[] = [
  {
    from: "transactions",
    to: "milestones",
    fromField: "goal_id",
    toField: "goal_id",
    type: "many-to-one",
  },
];

// ────────────────────────────────────────────────────────────
// CALCULATED EXPRESSIONS
// ────────────────────────────────────────────────────────────

export interface StudioExpression {
  name: string;
  source: string;
  formula: string;
  description: string;
}

export const studioExpressions: StudioExpression[] = [
  {
    name: "progress_pct",
    source: "milestones",
    formula: "(current_balance / target_amount) * 100",
    description: "Percentage of target amount saved so far",
  },
  {
    name: "daily_burn_rate",
    source: "milestones",
    formula: "(target_amount - current_balance) / days_remaining",
    description: "Required daily savings to meet target date",
  },
];

// ────────────────────────────────────────────────────────────
// THEMING – PayPal Branding
// ────────────────────────────────────────────────────────────

export const studioTheme = {
  colors: {
    accent: "#0070BA",        // PayPal Classic Blue
    accentHover: "#005EA6",
    secondary: "#003087",     // PayPal Deep Navy
    secondaryHover: "#002570",
    background: "#FFFFFF",
    surface: "#F5F7FA",
    surfaceHover: "#E8ECF1",
    text: "#1A1A2E",
    textSecondary: "#6B7280",
    textMuted: "#9CA3AF",
    success: "#10B981",
    successBg: "#ECFDF5",
    warning: "#F59E0B",
    warningBg: "#FFFBEB",
    danger: "#EF4444",
    dangerBg: "#FEF2F2",
    border: "#E5E7EB",
    borderHover: "#D1D5DB",
    cardBg: "#FFFFFF",
    cardShadow: "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)",
    elevatedShadow: "0 10px 25px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04)",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    headingFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  borderRadius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
  },
};

// ────────────────────────────────────────────────────────────
// AG STUDIO GRID COLUMN DEFINITIONS
// ────────────────────────────────────────────────────────────

export const milestoneGridColDefs = [
  { field: "name", headerName: "Goal", flex: 2, minWidth: 150 },
  {
    field: "progress_pct",
    headerName: "Progress",
    flex: 1,
    minWidth: 120,
    cellRenderer: "progressRenderer",
  },
  {
    field: "current_balance",
    headerName: "Saved",
    flex: 1,
    minWidth: 100,
    valueFormatter: (p: { value: number | null | undefined }) =>
      p.value == null ? "" :
      `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  {
    field: "target_amount",
    headerName: "Target",
    flex: 1,
    minWidth: 100,
    valueFormatter: (p: { value: number | null | undefined }) =>
      p.value == null ? "" :
      `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  { field: "target_date", headerName: "Due Date", flex: 1, minWidth: 120 },
  { field: "daily_burn_rate", headerName: "Daily Rate", flex: 1, minWidth: 110,
    valueFormatter: (p: { value: number | null | undefined }) =>
      p.value == null ? "" :
      `$${p.value.toFixed(2)}/day`,
  },
  { field: "status", headerName: "Status", flex: 1, minWidth: 100 },
];

export const transactionGridColDefs = [
  { field: "date", headerName: "Date", flex: 1, minWidth: 110, sort: "desc" as const },
  { field: "merchant", headerName: "Merchant", flex: 2, minWidth: 150 },
  {
    field: "amount",
    headerName: "Amount",
    flex: 1,
    minWidth: 100,
    valueFormatter: (p: { value: number | null | undefined }) =>
      p.value == null ? "" :
      `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  { field: "type", headerName: "Type", flex: 1, minWidth: 90 },
  { field: "is_subscription", headerName: "Recurring", flex: 1, minWidth: 100 },
  { field: "description", headerName: "Note", flex: 2, minWidth: 180 },
];

export const subscriptionGridColDefs = [
  { field: "service_name", headerName: "Service", flex: 2, minWidth: 160 },
  {
    field: "monthly_cost",
    headerName: "Monthly",
    flex: 1,
    minWidth: 100,
    valueFormatter: (p: { value: number | null | undefined }) =>
      p.value == null ? "" :
      `$${p.value.toFixed(2)}`,
  },
  { field: "last_used_date", headerName: "Last Used", flex: 1, minWidth: 120 },
  { field: "status", headerName: "Status", flex: 1, minWidth: 100 },
  { field: "category", headerName: "Category", flex: 1, minWidth: 120 },
];

// ────────────────────────────────────────────────────────────
// AI HARNESS PROMPT STARTERS
// ────────────────────────────────────────────────────────────

export const aiPromptStarters = [
  "Which savings goals are delayed by recent purchases?",
  "Show my unused subscriptions in a bar chart.",
  "Plot my savings trajectory if I cut takeout spending by $20/week.",
  "What's the fastest way to reach my Tokyo Trip goal?",
  "How much can I save by cancelling dormant subscriptions?",
  "Compare my spending patterns this month vs last month.",
];

// ────────────────────────────────────────────────────────────
// FULL CONFIG EXPORT
// ────────────────────────────────────────────────────────────

export function getStudioConfig() {
  return {
    sources: [
      getMilestonesSource(),
      getTransactionsSource(),
      getSubscriptionsSource(),
    ],
    relationships: studioRelationships,
    expressions: studioExpressions,
    theme: studioTheme,
    promptStarters: aiPromptStarters,
  };
}
