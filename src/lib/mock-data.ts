// ============================================================
// PayPal Pace – Mock / Seed Data
// ============================================================
// Fallback data for milestones, transactions, and subscriptions
// used when PayPal sandbox is unavailable or for demo purposes.
// ============================================================

import type { Milestone, Transaction, Subscription, SimulatorProduct, DashboardStats } from "@/types/financial";

// Helper to generate dates relative to today
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ────────────────────────────────────────────────────────────
// MILESTONES
// ────────────────────────────────────────────────────────────
export const mockMilestones: Milestone[] = [
  {
    goal_id: "goal-001",
    name: "Tokyo Trip 🗼",
    target_amount: 4500,
    current_balance: 2800,
    target_date: futureDate(120),
    category: "travel",
    status: "active",
    icon: "Plane",
    created_at: pastDate(90),
  },
  {
    goal_id: "goal-002",
    name: "Emergency Fund 🛡️",
    target_amount: 10000,
    current_balance: 6200,
    target_date: futureDate(365),
    category: "emergency",
    status: "active",
    icon: "Shield",
    created_at: pastDate(180),
  },
  {
    goal_id: "goal-003",
    name: "MacBook Pro 💻",
    target_amount: 2499,
    current_balance: 1100,
    target_date: futureDate(90),
    category: "tech",
    status: "active",
    icon: "Laptop",
    created_at: pastDate(60),
  },
  {
    goal_id: "goal-004",
    name: "Online Course 📚",
    target_amount: 800,
    current_balance: 650,
    target_date: futureDate(30),
    category: "education",
    status: "active",
    icon: "GraduationCap",
    created_at: pastDate(45),
  },
  {
    goal_id: "goal-005",
    name: "Fitness Equipment 🏋️",
    target_amount: 1200,
    current_balance: 300,
    target_date: futureDate(150),
    category: "health",
    status: "active",
    icon: "Dumbbell",
    created_at: pastDate(20),
  },
];

// ────────────────────────────────────────────────────────────
// TRANSACTIONS
// ────────────────────────────────────────────────────────────
export const mockTransactions: Transaction[] = [
  {
    tx_id: "tx-001",
    goal_id: "goal-001",
    amount: 150,
    merchant: "Travel Agency",
    date: pastDate(2),
    is_subscription: false,
    type: "credit",
    description: "Savings deposit – Tokyo Trip",
  },
  {
    tx_id: "tx-002",
    goal_id: null,
    amount: 14.99,
    merchant: "Netflix",
    date: pastDate(5),
    is_subscription: true,
    type: "debit",
    description: "Monthly subscription",
  },
  {
    tx_id: "tx-003",
    goal_id: null,
    amount: 9.99,
    merchant: "Spotify",
    date: pastDate(7),
    is_subscription: true,
    type: "debit",
    description: "Premium plan",
  },
  {
    tx_id: "tx-004",
    goal_id: "goal-002",
    amount: 500,
    merchant: "Direct Deposit",
    date: pastDate(10),
    is_subscription: false,
    type: "credit",
    description: "Emergency fund contribution",
  },
  {
    tx_id: "tx-005",
    goal_id: null,
    amount: 42.5,
    merchant: "DoorDash",
    date: pastDate(1),
    is_subscription: false,
    type: "debit",
    description: "Food delivery",
  },
  {
    tx_id: "tx-006",
    goal_id: "goal-003",
    amount: 200,
    merchant: "Savings Transfer",
    date: pastDate(3),
    is_subscription: false,
    type: "credit",
    description: "MacBook savings deposit",
  },
  {
    tx_id: "tx-007",
    goal_id: null,
    amount: 15.99,
    merchant: "Adobe Creative Cloud",
    date: pastDate(12),
    is_subscription: true,
    type: "debit",
    description: "Monthly subscription – unused last 60 days",
  },
  {
    tx_id: "tx-008",
    goal_id: null,
    amount: 6.99,
    merchant: "iCloud Storage",
    date: pastDate(15),
    is_subscription: true,
    type: "debit",
    description: "50GB plan",
  },
  {
    tx_id: "tx-009",
    goal_id: "goal-004",
    amount: 100,
    merchant: "Online Course Platform",
    date: pastDate(8),
    is_subscription: false,
    type: "credit",
    description: "Course fund deposit",
  },
  {
    tx_id: "tx-010",
    goal_id: null,
    amount: 129.99,
    merchant: "Amazon",
    date: pastDate(4),
    is_subscription: false,
    type: "debit",
    description: "Electronics purchase",
  },
  {
    tx_id: "tx-011",
    goal_id: null,
    amount: 11.99,
    merchant: "Hulu",
    date: pastDate(20),
    is_subscription: true,
    type: "debit",
    description: "Streaming – barely watched",
  },
  {
    tx_id: "tx-012",
    goal_id: "goal-005",
    amount: 50,
    merchant: "Savings Transfer",
    date: pastDate(6),
    is_subscription: false,
    type: "credit",
    description: "Fitness fund deposit",
  },
];

// ────────────────────────────────────────────────────────────
// SUBSCRIPTIONS
// ────────────────────────────────────────────────────────────
export const mockSubscriptions: Subscription[] = [
  {
    sub_id: "sub-001",
    service_name: "Netflix",
    monthly_cost: 14.99,
    last_used_date: pastDate(2),
    status: "active",
    category: "Entertainment",
  },
  {
    sub_id: "sub-002",
    service_name: "Spotify Premium",
    monthly_cost: 9.99,
    last_used_date: pastDate(1),
    status: "active",
    category: "Music",
  },
  {
    sub_id: "sub-003",
    service_name: "Adobe Creative Cloud",
    monthly_cost: 15.99,
    last_used_date: pastDate(62),
    status: "dormant",
    category: "Productivity",
  },
  {
    sub_id: "sub-004",
    service_name: "Hulu",
    monthly_cost: 11.99,
    last_used_date: pastDate(45),
    status: "dormant",
    category: "Entertainment",
  },
  {
    sub_id: "sub-005",
    service_name: "iCloud Storage",
    monthly_cost: 6.99,
    last_used_date: pastDate(1),
    status: "active",
    category: "Cloud Storage",
  },
  {
    sub_id: "sub-006",
    service_name: "LinkedIn Premium",
    monthly_cost: 29.99,
    last_used_date: pastDate(90),
    status: "dormant",
    category: "Professional",
  },
  {
    sub_id: "sub-007",
    service_name: "Headspace",
    monthly_cost: 12.99,
    last_used_date: pastDate(75),
    status: "dormant",
    category: "Wellness",
  },
];

// ────────────────────────────────────────────────────────────
// SIMULATOR PRODUCTS
// ────────────────────────────────────────────────────────────
export const simulatorProducts: SimulatorProduct[] = [
  {
    id: "prod-001",
    name: 'MacBook Air 15" M3',
    price: 1299,
    image: "/products/macbook.png",
    category: "Tech",
    description: "Apple M3 chip, 16GB RAM, 256GB SSD, Midnight finish",
  },
  {
    id: "prod-002",
    name: "Sony WH-1000XM5",
    price: 348,
    image: "/products/headphones.png",
    category: "Tech",
    description: "Industry-leading noise cancellation, 30hr battery",
  },
  {
    id: "prod-003",
    name: "iPad Pro 11″ M4",
    price: 999,
    image: "/products/ipad.png",
    category: "Tech",
    description: "M4 chip, Ultra Retina XDR display, Wi-Fi 6E",
  },
  {
    id: "prod-004",
    name: "PlayStation 5 Pro",
    price: 699,
    image: "/products/ps5.png",
    category: "Gaming",
    description: "Enhanced GPU, 2TB SSD, 8K output support",
  },
  {
    id: "prod-005",
    name: "DJI Mini 4 Pro",
    price: 759,
    image: "/products/drone.png",
    category: "Tech",
    description: "4K HDR, omnidirectional sensing, 34min flight time",
  },
];

// ────────────────────────────────────────────────────────────
// DASHBOARD STATS (computed from mock data)
// ────────────────────────────────────────────────────────────
export function computeDashboardStats(): DashboardStats {
  const activeMilestones = mockMilestones.filter((m) => m.status === "active");
  const totalSaved = activeMilestones.reduce((sum, m) => sum + m.current_balance, 0);
  const totalTarget = activeMilestones.reduce((sum, m) => sum + m.target_amount, 0);

  const dormantSubs = mockSubscriptions.filter((s) => s.status === "dormant");
  const activeSubs = mockSubscriptions.filter((s) => s.status === "active");

  return {
    total_saved: totalSaved,
    total_target: totalTarget,
    active_goals: activeMilestones.length,
    monthly_subscriptions: activeSubs.reduce((sum, s) => sum + s.monthly_cost, 0),
    dormant_subscriptions: dormantSubs.length,
    potential_monthly_savings: dormantSubs.reduce((sum, s) => sum + s.monthly_cost, 0),
    overall_progress_pct: totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0,
    on_track_goals: activeMilestones.filter((m) => {
      const pct = (m.current_balance / m.target_amount) * 100;
      return pct >= 40;
    }).length,
    at_risk_goals: activeMilestones.filter((m) => {
      const pct = (m.current_balance / m.target_amount) * 100;
      return pct < 40;
    }).length,
  };
}
