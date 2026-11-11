// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import MilestoneCard from "@/components/MilestoneCard";
import CheckoutSimulator from "@/components/CheckoutSimulator";
import ReassuranceModal from "@/components/ReassuranceModal";
import StudioDashboard from "@/components/StudioDashboard";
import ExpenseRebalanceGrid from "@/components/ExpenseRebalanceGrid";
import MilestoneArbitrageCard from "@/components/MilestoneArbitrageCard";
import InstallmentGuard from "@/components/InstallmentGuard";
import AgentTimeline from "@/components/AgentTimeline";
import AgentLab from "@/components/AgentLab";
import PacingSummaryCard from "@/components/PacingSummaryCard";
import dynamic from "next/dynamic";
import Link from "next/link";

// AG Charts renders on a canvas and uses today's date: client-only (no prerender)
const GoalTrajectoryChart = dynamic(() => import("@/components/GoalTrajectoryChart"), {
  ssr: false,
  loading: () => <div className="card p-4 animate-pulse" style={{ height: 392 }} />,
});
import { mockMilestones, computeDashboardStats } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/math-engine";
import { calculatePacing, type ExpenseItem } from "@/lib/pacing";
import type { RebalanceResult, RecoveryPath, DashboardStats } from "@/types/financial";
import {
  Target,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Wallet,
  Zap,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  FlaskConical,
  ShoppingBag,
  PiggyBank,
} from "lucide-react";

/** Tabs: dashboard = Overview, goals = Goals & Savings, checkout = Agent Lab. Linkable as /#goals etc. */
const SECTIONS = ["dashboard", "goals", "checkout"] as const;

export default function Home() {
  const [activeSection, setActiveSectionState] = useState("dashboard");

  // Keep the tab in the URL hash so /#goals and /#checkout are shareable
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if ((SECTIONS as readonly string[]).includes(h)) setActiveSectionState(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const setActiveSection = (section: string) => {
    setActiveSectionState(section);
    window.history.replaceState(null, "", section === "dashboard" ? window.location.pathname : `#${section}`);
    window.scrollTo({ top: 0 });
  };
  const [rebalanceResult, setRebalanceResult] = useState<RebalanceResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedPathMessage, setSelectedPathMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    total_saved: 0,
    total_target: 0,
    active_goals: 0,
    monthly_subscriptions: 0,
    dormant_subscriptions: 0,
    potential_monthly_savings: 0,
    overall_progress_pct: 0,
    on_track_goals: 0,
    at_risk_goals: 0,
  });

  // Mock expense items for the grid
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([
    { expense_id: "exp-001", name: "Pro Laptop", amount: 1299, description: "High utility laptop", paused: false },
    { expense_id: "exp-002", name: "Gym Membership", amount: 45, description: "Health & fitness", paused: false },
    { expense_id: "exp-003", name: "Streaming Service", amount: 12.99, description: "Entertainment", paused: false },
    { expense_id: "exp-004", name: "Cloud Storage", amount: 9.99, description: "Software subscription", paused: false },
    { expense_id: "exp-005", name: "Takeout Food", amount: 85, description: "Dining out", paused: false },
    { expense_id: "exp-006", name: "Online Course", amount: 29.99, description: "Education platform", paused: false },
  ]);

  const [purchaseAmount, setPurchaseAmount] = useState(0);
  const [productName, setProductName] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pacingSummary, setPacingSummary] = useState<any>(null);

  useEffect(() => {
    setStats(computeDashboardStats());
  }, []);

  /**
   * Called when CheckoutSimulator completes a purchase simulation.
   * Receives the raw dollar amount and product name, then triggers pacing recalculation.
   */
  const handlePurchaseComplete = (amount: number, name: string) => {
    setPurchaseAmount(amount);
    setProductName(name);
    // Also recalculate pacing immediately with current expenses
    const summary = calculatePacing(amount, expenseItems, mockMilestones, name);
    setPacingSummary(summary);
  };

  const handleSelectPath = (path: RecoveryPath) => {
    setSelectedPathMessage(`✅ "${path.title}" activated! ${path.impact_summary}`);
    setShowModal(false);
    setTimeout(() => setSelectedPathMessage(null), 5000);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar onNavigate={setActiveSection} activeSection={activeSection} />
      <main className="flex-1 max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Success Banner */}
        {selectedPathMessage && (
          <div
            className="mb-6 p-4 rounded-xl flex items-center gap-3 animate-slide-in-down"
            style={{ background: "var(--success-bg)", border: "1px solid rgba(16, 185, 129, 0.2)" }}
          >
            <Sparkles className="w-5 h-5 flex-shrink-0" style={{ color: "var(--success)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--success-text)" }}>{selectedPathMessage}</span>
          </div>
        )}

        {activeSection === "dashboard" && (
          <>
            {/* Hero Banner */}
            <div
              className="relative rounded-2xl p-6 sm:p-8 mb-8 overflow-hidden"
              style={{ background: "linear-gradient(135deg, var(--paypal-navy) 0%, var(--paypal-blue) 60%, #00A0E3 100%)" }}
            >
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
              <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-[#FFC439]" />
                    <span className="text-sm font-semibold text-[#FFC439] uppercase tracking-wider">Your Financial Pace</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">Good afternoon, Demo User! 👋</h1>
                  <p className="text-sm sm:text-base text-white/75 max-w-lg">
                    You&apos;re {stats.overall_progress_pct}% toward your combined savings targets. {stats.at_risk_goals > 0 ? ` ${stats.at_risk_goals} goal${stats.at_risk_goals > 1 ? "s" : ""} need${stats.at_risk_goals === 1 ? "s" : ""} attention.` : " All goals are on track! 🎯"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link id="hero-store-btn" href="/store" className="btn btn-gold btn-lg">
                    <ShoppingBag className="w-4 h-4" /> Shop with Pace
                  </Link>
                  <button
                    id="hero-simulate-btn"
                    className="btn btn-lg"
                    style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)" }}
                    onClick={() => setActiveSection("checkout")}
                  >
                    <FlaskConical className="w-4 h-4" /> Open Agent Lab
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid mb-8">
              {[
                { label: "Total Saved", value: formatCurrency(stats.total_saved), subtext: `of ${formatCurrency(stats.total_target)} target`, icon: Wallet, color: "#10B981", bgColor: "#ECFDF5", trend: "+12.5%", trendUp: true },
                { label: "Active Goals", value: String(stats.active_goals), subtext: `${stats.on_track_goals} on track`, icon: Target, color: "#3B82F6", bgColor: "#EFF6FF", trend: null, trendUp: true },
                { label: "Monthly Subs", value: formatCurrency(stats.monthly_subscriptions), subtext: `${stats.dormant_subscriptions} dormant detected`, icon: DollarSign, color: "#F59E0B", bgColor: "#FEF3C7", trend: null, trendUp: false },
                { label: "Potential Savings", value: formatCurrency(stats.potential_monthly_savings), subtext: "from dormant subscriptions", icon: TrendingUp, color: "#8B5CF6", bgColor: "#F5F3FF", trend: "/month", trendUp: true },
              ].map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="card p-5 animate-fade-in-up"
                    style={{ animationDelay: `${index * 0.08}s`, animationFillMode: "both" }}
                    id={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.bgColor }}>
                        <Icon className="w-5 h-5" style={{ color: stat.color }} />
                      </div>
                      {stat.trend && (
                        <span
                          className="flex items-center gap-0.5 text-xs font-semibold"
                          style={{ color: stat.trendUp ? "var(--success)" : "var(--danger)" }}
                        >
                          {stat.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {stat.trend}
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-bold mb-0.5">{stat.value}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{stat.subtext}</div>
                    <div className="text-xs font-medium mt-2" style={{ color: "var(--text-secondary)" }}>{stat.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Milestone Arbitrage & Impulse Shock-Absorber (on-device Gemma) */}
            {/* Next-installment guard: appears once a PayPal plan is captured in the store */}
            <InstallmentGuard />

            {/* Goal trajectory (AG Charts) + Agent Activity Timeline */}
            <div className="grid gap-6 lg:grid-cols-2 items-start mb-6">
              <GoalTrajectoryChart />
              <AgentTimeline />
            </div>

            {/* Pointer to the moved goal tools */}
            <button
              id="overview-goals-cta"
              onClick={() => setActiveSection("goals")}
              className="card p-4 mb-8 w-full flex items-center justify-between gap-3 text-left transition-transform hover:scale-[1.005]"
            >
              <span className="flex items-center gap-3">
                <PiggyBank className="w-5 h-5" style={{ color: "#10B981" }} />
                <span>
                  <span className="block text-sm font-semibold">Find money for your goals</span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                    Hibernate subscriptions, test impulse buys and contribute to milestones in Goals &amp; Savings
                  </span>
                </span>
              </span>
              <ArrowUpRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            </button>
          </>
        )}

        {activeSection === "goals" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold mb-1">Goals &amp; Savings</h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Where your money goes, and what Pace suggests changing to protect your goals.
              </p>
            </div>

            <MilestoneArbitrageCard />

            {/* Milestone Cards */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                    <Shield className="w-5 h-5" style={{ color: "#3B82F6" }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Your Milestones</h2>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Track progress toward your savings goals</p>
                  </div>
                </div>
              </div>
              <div className="dashboard-grid">
                {mockMilestones.map((milestone, index) => (
                  <MilestoneCard key={milestone.goal_id} milestone={milestone} animationDelay={index * 0.08} />
                ))}
              </div>
            </div>

            {/* AG Studio Dashboard */}
            <div className="mb-8"><StudioDashboard /></div>
          </>
        )}

        {activeSection === "checkout" && (
          <>
            <AgentLab />
            <CheckoutSimulator onPurchaseComplete={handlePurchaseComplete} />
            <section className="my-8" id="grid-section">
              <ExpenseRebalanceGrid
                expenseItems={expenseItems}
                savingsMilestones={mockMilestones}
                purchaseAmount={purchaseAmount}
                productName={productName}
                onPacingUpdate={setPacingSummary}
                onExpenseToggle={setExpenseItems}
              />
            </section>
            {pacingSummary?.intelligence && <PacingSummaryCard summary={pacingSummary} productName={productName} />}
          </>
        )}

        {/* Footer */}
        <footer
          className="py-4 px-6 text-center mt-8"
          style={{ borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Built with ❤️ for the <strong style={{ color: "var(--accent-text)" }}>PayPal AI Hackathon</strong> — Powered by <strong style={{ color: "var(--brand-text)" }}>AG Grid Studio</strong> &amp; <strong>Next.js</strong>
          </p>
        </footer>

        {/* Reassurance Modal */}
        {showModal && rebalanceResult && (
          <ReassuranceModal result={rebalanceResult} onClose={() => setShowModal(false)} onSelectPath={handleSelectPath} />
        )}
      </main>
    </div>
  );
}
