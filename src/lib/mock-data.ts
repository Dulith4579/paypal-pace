// src/lib/mock-data.ts
import type { Milestone, Transaction, Subscription, SimulatorProduct, DashboardStats } from "@/types/financial";

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
// User Financial Profile
// ────────────────────────────────────────────────────────────
export const userProfile = {
  name: "Alex Chen",
  status: "Computing / CS Student & Part-Time Freelancer",
  monthly_net_inflow: 1800.0,
  // Alias for component expectations
  monthly_inflow: 1800.0,
  // Rent share, food, transport — what's left flows to savings goals
  monthly_fixed_costs: 450.0,
  primary_goal: {
    name: "Japan Autumn Trip",
    saved: 2150,
    target: 3200,
    // Relative so the demo never drifts. At 44 days the real solver resolves
    // Pay in 4 + paused leaks to 0 days delay, while paying in full still
    // delays the trip. (At ~51+ days every plan is 0-delay and the
    // comparison stops being meaningful; below ~41 Pay in 4 slips too.)
    target_date: futureDate(44),
  },
  cart_item: {
    name: "Apex Air 13 Dev Workstation",
    price: 1099.0,
    utility_class: "Career Asset / High ROI",
  },
};


// Milestones
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
    name: "Pro Laptop Upgrade 💻",
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
  // Japan Autumn Trip goal
  {
    goal_id: "goal-006",
    name: "Japan Autumn Trip",
    target_amount: 3200,
    current_balance: 2150,
    target_date: futureDate(44), // same deadline as userProfile.primary_goal
    category: "travel",
    status: "active",
    icon: "Plane",
    created_at: pastDate(30),
  },
];

// Transactions
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
    merchant: "StreamFlix",
    date: pastDate(5),
    is_subscription: true,
    type: "debit",
    description: "Monthly subscription",
  },
  {
    tx_id: "tx-003",
    goal_id: null,
    amount: 9.99,
    merchant: "TuneBox",
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
    merchant: "QuickBite Delivery",
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
    description: "Laptop savings deposit",
  },
  {
    tx_id: "tx-007",
    goal_id: null,
    amount: 15.99,
    merchant: "Creative Suite Pro",
    date: pastDate(12),
    is_subscription: true,
    type: "debit",
    description: "Monthly subscription – unused last 60 days",
  },
  {
    tx_id: "tx-008",
    goal_id: null,
    amount: 6.99,
    merchant: "Cloud Drive Storage",
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
    merchant: "Online Marketplace",
    date: pastDate(4),
    is_subscription: false,
    type: "debit",
    description: "Electronics purchase",
  },
  {
    tx_id: "tx-011",
    goal_id: null,
    amount: 11.99,
    merchant: "StreamPlus",
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

// Subscriptions
export const mockSubscriptions: Subscription[] = [
  {
    sub_id: "sub-001",
    service_name: "StreamFlix",
    monthly_cost: 14.99,
    last_used_date: pastDate(2),
    status: "active",
    category: "Entertainment",
  },
  {
    sub_id: "sub-002",
    service_name: "TuneBox Premium",
    monthly_cost: 9.99,
    last_used_date: pastDate(1),
    status: "active",
    category: "Music",
  },
  {
    sub_id: "sub-003",
    service_name: "Creative Suite Pro",
    monthly_cost: 15.99,
    last_used_date: pastDate(62),
    status: "dormant",
    category: "Productivity",
  },
  {
    sub_id: "sub-004",
    service_name: "StreamPlus",
    monthly_cost: 11.99,
    last_used_date: pastDate(45),
    status: "dormant",
    category: "Entertainment",
  },
  {
    sub_id: "sub-005",
    service_name: "Cloud Drive Storage",
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

// Simulator products
export const simulatorProducts: SimulatorProduct[] = [
  {
    id: "prod-001",
    name: 'Apex Air 15" Laptop',
    price: 1299,
    image: "/products/macbook.png",
    category: "Tech",
    description: "8-core chip, 16GB RAM, 256GB SSD, Midnight finish",
  },
  {
    id: "prod-002",
    name: "QuietWave ANC Headphones",
    price: 348,
    image: "/products/headphones.png",
    category: "Tech",
    description: "Industry-leading noise cancellation, 30hr battery",
  },
  {
    id: "prod-003",
    name: "Apex Tab Pro 11\"",
    price: 999,
    image: "/products/ipad.png",
    category: "Tech",
    description: "Octa-core chip, 120Hz OLED display, Wi-Fi 6E",
  },
  {
    id: "prod-004",
    name: "Game Console Pro",
    price: 699,
    image: "/products/ps5.png",
    category: "Gaming",
    description: "Enhanced GPU, 2TB SSD, 8K output support",
  },
  {
    id: "prod-005",
    name: "SkyLite Mini Drone",
    price: 759,
    image: "/products/drone.png",
    category: "Tech",
    description: "4K HDR, omnidirectional sensing, 34min flight time",
  },
];

// Dashboard stats computation
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
