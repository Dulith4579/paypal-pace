// src/components/PayPalPaceModal.tsx
"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  X,
  Shield,
  Sparkles,
  Zap,
  CheckCircle2,
  Plane,
  Brain,
  CreditCard,
  ArrowRight,
  Lock,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  User,
  DollarSign,
  Target,
  TrendingDown,
  Rocket,
  Scale,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import ExpenseRebalanceGrid from "@/components/ExpenseRebalanceGrid";
import { formatCurrency, formatDate } from "@/lib/math-engine";
import { mockMilestones, mockSubscriptions, userProfile } from "@/lib/mock-data";
import type { ExpenseItem, SavingsMilestone } from "@/lib/pacing";
import { projectGoal, planFromStrategyId, engineStrategyCards } from "@/lib/strategy-solver";
import ReasoningPanel, { type Reasoning } from "@/components/ReasoningPanel";
import PayLaterMessage from "@/components/PayLaterMessage";
import PayPalSmartButtons from "@/components/PayPalSmartButtons";
import { getPaceState, paceActions, paceContextOf, todayISO } from "@/lib/pace-store";
import { instantSandboxCapture, FUNDING_LABEL, type CapturedPayment } from "@/lib/paypal-sdk";

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────

interface PayPalPaceModalProps {
  productName: string;
  productPrice: number;
  merchantName: string;
  onClose: () => void;
}

interface Strategy {
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
  text_source?: "gemma" | "corrected" | "engine";
  solver_rank?: number;
  metrics?: { interest: number; total_cost: number; cash_out_before_deadline: number; paused_monthly: number; new_goal_date: string };
}

interface AiTrace {
  model: string;
  latency_ms: number;
  tokens_per_sec: number;
  candidates_evaluated: number;
  recommendation_by: "gemma" | "solver" | "solver_guardrail";
  gemma_pick?: string;
  verified_cards: number;
  corrected_cards: number;
  error?: string;
}

interface AgentInsights {
  utility_narrative: string;
  confidence: number;
  /** Engine feasibility (same formula as the dashboard); Gemma may adjust ±15. */
  confidence_baseline?: number;
  cash_flow_risk: string;
  subscription_notes: { id: string; subscription: string; note: string }[];
  source: "gemma" | "engine";
}

interface AgentResponse {
  ai_trace?: AiTrace;
  reasoning?: Reasoning;
  insights?: AgentInsights;
  strategies: Strategy[];
  user_context: {
    status: string;
    monthly_inflow: number;
    goal_name: string;
    goal_saved: number;
    goal_target: number;
    goal_date: string;
    cart_item: string;
    cart_price: number;
    utility_class: string;
  };
  classification: { class: string; label: string };
  source: string;
}

type ModalStage = "strategies" | "confirmation";
type PriorityMode = "career_growth" | "balanced" | "goal_shielding";

const PRIORITY_MODES: { id: PriorityMode; label: string; icon: typeof Rocket; desc: string }[] = [
  { id: "career_growth", label: "Career Growth", icon: Rocket, desc: "Maximize professional ROI" },
  { id: "balanced", label: "Balanced", icon: Scale, desc: "Equilibrium approach" },
  { id: "goal_shielding", label: "Goal Shield", icon: ShieldCheck, desc: "Protect Japan Trip" },
];

/**
 * Agent Activity Timeline: record what the agent decided for this checkout
 * (and any firewall catches). Stable ids → re-opening the same checkout with
 * the same shared state doesn't log twice.
 */
function logAgentRun(data: AgentResponse, mode: PriorityMode, product: string, ctxKey: string) {
  const r = data.reasoning;
  if (!r) return;
  const t = data.ai_trace;
  const base = `${todayISO()}|${product}|${mode}|${ctxKey}`;
  const label = PRIORITY_MODES.find((m) => m.id === mode)?.label ?? mode;
  const finalKey = r.firewall.find((f) => f.option === r.guardrail.final_pick)?.key;
  const c = r.candidates.find((x) => x.key === finalKey);
  const pick = c ? `${c.plan_label}${c.new_pauses.length ? ` + pause ${c.new_pauses.join(", ")}` : ""}` : `Option ${r.guardrail.final_pick}`;
  const ai =
    t && !t.error
      ? `Gemma picked ${t.gemma_pick ?? "—"}${t.recommendation_by === "solver_guardrail" ? " (overruled by the guardrail)" : ""} · firewall ${t.verified_cards}/3 verified`
      : "deterministic engine (local model offline)";
  paceActions.logEvent({
    id: `agent|${base}`,
    kind: "agent",
    actor: "agent",
    title: `Analyzed ${product.split("(")[0].trim()} checkout (${label}) → recommended ${pick}`,
    detail: `${r.candidates.length} plans scored · ${ai}${c ? ` · goal delay ${c.delay_days} days` : ""}`,
  });
  const corrected = r.firewall.filter((f) => f.status === "corrected");
  if (corrected.length)
    paceActions.logEvent({
      id: `firewall|${base}`,
      kind: "firewall",
      actor: "firewall",
      title: `Firewall blocked ${corrected.length} AI claim${corrected.length > 1 ? "s" : ""} before you saw ${corrected.length > 1 ? "them" : "it"}`,
      detail: corrected.map((f) => `Card ${f.option}: ${f.reasons[0] ?? "rejected"}`).join(" · "),
    });
}

// ────────────────────────────────────────────────────────────
// DATA PREPARATION
// ────────────────────────────────────────────────────────────

/** Build subscription expense items for AG Grid */
function buildExpenseItems(): ExpenseItem[] {
  const names = ["StreamFlix", "Meal Delivery", "Gym Add-on", "Cloud Tier"];
  const subs: ExpenseItem[] = [
    { expense_id: "sub-sf", name: "StreamFlix", amount: 14.99, description: "Entertainment – Active", paused: false },
    { expense_id: "sub-md", name: "Meal Delivery", amount: 29.99, description: "Food – Rarely used (42 days idle)", paused: false },
    { expense_id: "sub-ga", name: "Gym Add-on", amount: 19.99, description: "Wellness – Premium tier (dormant)", paused: false },
    { expense_id: "sub-ct", name: "Cloud Tier", amount: 12.99, description: "Productivity – Dev storage (active)", paused: false },
    ...mockSubscriptions
      .filter((s) => s.status === "dormant" && !names.includes(s.service_name))
      .slice(0, 2)
      .map((s) => ({
        expense_id: s.sub_id,
        name: s.service_name,
        amount: s.monthly_cost,
        description: `${s.category} – Dormant`,
        paused: false,
      })),
  ];
  return subs;
}

/** Get the Japan Autumn Trip milestone */
function getJapanMilestone(): SavingsMilestone {
  // Single source of truth: the same goal the agent/solver reasons about
  const g = userProfile.primary_goal;
  return {
    goal_id: "goal-006",
    name: g.name,
    target_amount: g.target,
    current_balance: g.saved,
    target_date: g.target_date,
    category: "travel",
    status: "active",
    icon: "Plane",
    created_at: "2026-09-01",
  };
}

/**
 * Apply a strategy's pre-pause IDs to expense items. Subscriptions the user
 * already hibernated on the dashboard (shared pace-store) stay paused.
 */
function applyPrePauses(items: ExpenseItem[], prePauseIds: string[], alreadyPaused: string[] = []): ExpenseItem[] {
  return items.map((item) => ({
    ...item,
    paused: prePauseIds.includes(item.expense_id) || alreadyPaused.includes(item.expense_id),
  }));
}

// ────────────────────────────────────────────────────────────
// SEVERITY STYLING
// ────────────────────────────────────────────────────────────

const severityStyles = {
  safe: {
    border: "rgba(16, 185, 129, 0.3)",
    bg: "rgba(16, 185, 129, 0.04)",
    accent: "#10B981",
    badgeBg: "var(--success-bg)",
    badgeColor: "var(--success-text)",
    selectedBorder: "#10B981",
    selectedBg: "rgba(16, 185, 129, 0.08)",
  },
  moderate: {
    border: "rgba(59, 130, 246, 0.3)",
    bg: "rgba(59, 130, 246, 0.04)",
    accent: "#3B82F6",
    badgeBg: "var(--info-bg)",
    badgeColor: "var(--info-text)",
    selectedBorder: "#3B82F6",
    selectedBg: "rgba(59, 130, 246, 0.08)",
  },
  danger: {
    border: "rgba(239, 68, 68, 0.25)",
    bg: "rgba(239, 68, 68, 0.03)",
    accent: "#EF4444",
    badgeBg: "var(--danger-bg)",
    badgeColor: "var(--danger-text)",
    selectedBorder: "#EF4444",
    selectedBg: "rgba(239, 68, 68, 0.06)",
  },
};

// ────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────

export default function PayPalPaceModal({
  productName,
  productPrice,
  merchantName,
  onClose,
}: PayPalPaceModalProps) {
  // Shared app facts at the moment checkout opens (dashboard hibernations,
  // goal contributions, installments owed). Frozen for this modal session
  // so the agent cache key — and the store page's precompute — match.
  const [paceCtx] = useState(() => paceContextOf(getPaceState()));
  const alreadyPaused = paceCtx.already_paused;

  // ── State ─────────────────────────────────────────────────
  const [stage, setStage] = useState<ModalStage>("strategies");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(true);
  const [agentSource, setAgentSource] = useState<string>("loading");
  const [aiTrace, setAiTrace] = useState<AiTrace | null>(null);
  const [insights, setInsights] = useState<AgentInsights | null>(null);
  const [reasoning, setReasoning] = useState<Reasoning | null>(null);
  const [priorityMode, setPriorityMode] = useState<PriorityMode>("balanced");
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>(() => applyPrePauses(buildExpenseItems(), [], alreadyPaused));
  const [pausedSubNames, setPausedSubNames] = useState<string[]>([]);
  const [pacingData, setPacingData] = useState<any>(null);
  // Memoize milestone array to avoid new reference each render
  // (will be defined after refs)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [orderId, setOrderId] = useState<string>("");
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [captureId, setCaptureId] = useState<string>("");
  const [fundingSource, setFundingSource] = useState<string>("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────
  const abortControllerRef = useRef<AbortController | null>(null);
  const baseItems = useRef<ExpenseItem[]>(buildExpenseItems());
  const japanMilestone = useRef<SavingsMilestone>(getJapanMilestone());
  const fetchCountRef = useRef(0);
  const milestoneArray = useMemo(() => [japanMilestone.current], []);

  // ── Derived constants ────────────────────────────────────
  const installmentAmount = (productPrice / 4).toFixed(2);
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId);
  const selectedPlan = selectedStrategy ? planFromStrategyId(selectedStrategy.id) : "pay_in_4";
  const planCount = selectedPlan === "outright" ? 1 : selectedPlan === "pay_in_4" ? 4 : selectedPlan === "pay_monthly_6" ? 6 : 12;

  // Live goal projection: same simulation as the solver, re-run whenever the
  // user picks a card or toggles any subscription in the grid.
  const goalProjection = useMemo(() => {
    const pausedMonthly = expenseItems.filter((e) => e.paused).reduce((s, e) => s + e.amount, 0);
    return projectGoal(productPrice, selectedPlan, pausedMonthly, paceCtx);
  }, [expenseItems, productPrice, selectedPlan, paceCtx]);

  // ── Backup plans when /api/agent is unreachable ────────────────────
  // Same solver the agent uses, run in the browser — every number on these
  // cards is computed for this product, mode and shared state (no fixed copy).
  const buildFallbackStrategies = useCallback(
    (mode: PriorityMode): Strategy[] => engineStrategyCards(productPrice, mode, productName, paceCtx),
    [productPrice, productName, paceCtx]
  );

  // ── Adjust strategies based on mode (identity for now, can be extended)
  const adjustStrategiesForMode = useCallback((strategies: Strategy[], mode: PriorityMode): Strategy[] => {
    return strategies;
  }, []);

  // ── Fetch agent strategies (re-callable on mode change) ────
  const fetchAgentStrategies = useCallback(async (mode: PriorityMode, signal: AbortSignal) => {
    const loadStart = Date.now();
    setIsLoadingAgent(true);
    setFetchError(null);
    setAgentSource("loading");
    try {
      const resp = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Justify purchasing ${productName} for $${productPrice}`,
          productName,
          purchaseAmount: productPrice,
          priorityMode: mode,
          context: paceCtx,
        }),
        signal,
      });
      if (signal.aborted) return;
      if (resp.ok) {
        const data: AgentResponse = await resp.json();
        const adjusted = adjustStrategiesForMode(data.strategies, mode);
        setStrategies(adjusted);
        setAgentSource(data.source);
        setAiTrace(data.ai_trace ?? null);
        setInsights(data.insights ?? null);
        setReasoning(data.reasoning ?? null);
        logAgentRun(data, mode, productName, JSON.stringify(paceCtx));
        // Contextual rationale per subscription: base label + AI note
        const fresh = buildExpenseItems();
        baseItems.current = fresh.map((item) => {
          const n = data.insights?.subscription_notes.find((x) => x.id === item.expense_id);
          return n ? { ...item, description: `${item.description} · ${n.note}` } : item;
        });
        const recommended = adjusted.find((s) => s.recommended);
        if (recommended) {
          setSelectedStrategyId(recommended.id);
          setExpenseItems(applyPrePauses(baseItems.current, recommended.pre_pause_ids, alreadyPaused));
        }
      } else {
        console.warn("Agent API returned non-OK status:", resp.status);
        const fallback = buildFallbackStrategies(mode);
        setStrategies(fallback);
        setAgentSource("fallback");
        setReasoning(null);
        // Choose first strategy of the mode as selected
        if (fallback.length > 0) {
          setSelectedStrategyId(fallback[0].id);
          setExpenseItems(applyPrePauses(baseItems.current, fallback[0].pre_pause_ids, alreadyPaused));
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      console.warn("Agent fetch error, using fallback:", err);
      setFetchError("Unable to retrieve AI strategies. Using fallback options.");
      const fallback = buildFallbackStrategies(mode);
      setStrategies(fallback);
      setAgentSource("fallback");
      setReasoning(null);
      if (fallback.length > 0) {
        setSelectedStrategyId(fallback[0].id);
        setExpenseItems(applyPrePauses(baseItems.current, fallback[0].pre_pause_ids, alreadyPaused));
      }
    } finally {
      if (!signal.aborted) {
        const loadElapsed = Date.now() - loadStart;
        if (loadElapsed < 1000) {
          await new Promise((r) => setTimeout(r, 1000 - loadElapsed));
        }
        setIsLoadingAgent(false);
      }
    }
  }, [productName, productPrice, buildFallbackStrategies, adjustStrategiesForMode, paceCtx, alreadyPaused]);

  // ── Trigger fetch on mount AND on priorityMode change ──────
  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    fetchAgentStrategies(priorityMode, controller.signal);
    return () => {
      controller.abort();
    };
  }, [priorityMode, fetchAgentStrategies]);

  // ── Handle priority mode change ──────────────────────────
  const handlePriorityModeChange = useCallback((mode: PriorityMode) => {
    // Abort any in-flight request before switching
    abortControllerRef.current?.abort();
    setPriorityMode(mode);
  }, []);

  // ── Handle strategy selection ─────────────────────────────
  const handleSelectStrategy = useCallback((strategy: Strategy) => {
    setSelectedStrategyId(strategy.id);
    // Re-apply pre-pauses for this strategy
    setExpenseItems(applyPrePauses(baseItems.current, strategy.pre_pause_ids, alreadyPaused));
  }, [alreadyPaused]);

  // ── Expense toggle handler (user manual override) ─────────
  const handleExpenseToggle = useCallback((items: ExpenseItem[]) => {
    setExpenseItems(items);
    const paused = items.filter((e) => e.paused).map((e) => e.name);
    setPausedSubNames(paused);
  }, []);

  // ── Payment ───────────────────────────────────────────────
  const installmentValue = Number(selectedStrategy?.installment_amount ?? productPrice / 4);

  /** Order body shared by the Smart Buttons and the instant sandbox path. */
  const orderBody = useCallback(
    () => ({
      amount: productPrice,
      description: productName,
      currency: "USD",
      installment_plan: { type: selectedPlan, count: planCount, installment: installmentValue },
    }),
    [productPrice, productName, selectedPlan, planCount, installmentValue]
  );

  /** Shared success path: receipt + write the result into the app-wide pace-store. */
  const finalizePayment = useCallback(
    (p: CapturedPayment) => {
      const pausedItems = expenseItems.filter((e) => e.paused);
      setPausedSubNames(pausedItems.map((e) => e.name));
      setOrderId(p.order_id);
      setCaptureId(p.capture_id || "—");
      setOrderStatus(p.status);
      setFundingSource(p.funding);
      setPaymentError(null);
      if (p.status === "COMPLETED") {
        paceActions.recordPurchase({
          order_id: p.order_id,
          capture_id: p.capture_id,
          status: p.status,
          product: productName,
          amount: productPrice,
          plan: selectedPlan,
          installment: installmentValue,
          count: planCount,
          funding: p.funding,
          paused_ids: pausedItems.map((e) => e.expense_id),
          delay_days: goalProjection.delay_days,
          date: todayISO(),
        });
      }
      setStage("confirmation");
    },
    [expenseItems, productName, productPrice, selectedPlan, installmentValue, planCount, goalProjection.delay_days]
  );

  // No-login path: order funded with PayPal's public sandbox test card, so it
  // completes in one call without leaving the modal.
  const handleApproveAndPay = useCallback(async () => {
    setIsProcessingPayment(true);
    setPaymentError(null);
    try {
      finalizePayment(await instantSandboxCapture(orderBody()));
    } catch (err) {
      console.error("Payment error:", err);
      // Be honest in the receipt: this is NOT a real sandbox transaction
      setPausedSubNames(expenseItems.filter((e) => e.paused).map((e) => e.name));
      setOrderId(`OFFLINE-DEMO-${Date.now().toString(36).toUpperCase()}`);
      setCaptureId("— (sandbox unreachable)");
      setOrderStatus("DEMO_ONLY");
      setFundingSource("");
      setStage("confirmation");
    } finally {
      setIsProcessingPayment(false);
    }
  }, [finalizePayment, orderBody, expenseItems]);

  // ── Copy to clipboard ─────────────────────────────────────
  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  // ── Derived values ────────────────────────────────────────
  const pausedTotal = expenseItems
    .filter((e) => e.paused)
    .reduce((s, e) => s + e.amount, 0);
  // Goal balance includes contributions captured from the dashboard (pace-store)
  const milestone = useMemo(
    () => ({ ...japanMilestone.current, current_balance: japanMilestone.current.current_balance + paceCtx.saved_extra }),
    [paceCtx.saved_extra]
  );
  const progressPct = Math.min(100, Math.round((milestone.current_balance / milestone.target_amount) * 100));
  const hibernatedNames = buildExpenseItems()
    .filter((e) => alreadyPaused.includes(e.expense_id))
    .map((e) => e.name);
  const dynamicDelay = goalProjection.delay_days;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl animate-modal"
        style={{
          background: "var(--bg-surface)",
          boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.35)",
        }}
      >
        {/* ══════════════════════════════════════════════════════
            HEADER — PayPal Pace Secure Checkout Banner
            ══════════════════════════════════════════════════════ */}
        <div
          className="relative px-6 py-4"
          style={{
            background: "linear-gradient(135deg, #003087 0%, #0070BA 100%)",
            borderRadius: "16px 16px 0 0",
          }}
        >
          <button
            id="pace-modal-close"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg transition-all hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-white/80" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/15">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold text-lg tracking-tight">PayPal Pace</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto mr-8">
              <Lock className="w-3 h-3 text-white/60" />
              <span className="text-[11px] text-white/60 font-medium">Secure Checkout</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-white/70 text-xs">
              {merchantName} — {formatCurrency(productPrice)} USD
            </p>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10">
              <Plane className="w-3.5 h-3.5 text-[#FFC439]" />
              <span className="text-[11px] text-white font-semibold">
                Japan Autumn Trip Protected
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            USER FINANCIAL CONTEXT BAR
            ══════════════════════════════════════════════════════ */}
        <div
          className="mx-6 mt-4 p-3 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-default)",
          }}
        >
          {[
            { icon: User, label: userProfile.status, sub: userProfile.name },
            { icon: DollarSign, label: formatCurrency(userProfile.monthly_net_inflow) + "/mo", sub: "Net Inflow" },
            { icon: Target, label: `${formatCurrency(milestone.current_balance)} / ${formatCurrency(milestone.target_amount)}`, sub: "Japan Autumn Trip" },
            { icon: Sparkles, label: userProfile.cart_item.utility_class, sub: productName.split("/")[0].trim() },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0, 112, 186, 0.08)" }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: "var(--accent-text)" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{item.label}</div>
                  <div className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>{item.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════
            MILESTONE SHIELD BADGE
            ══════════════════════════════════════════════════════ */}
        <div
          className="mx-6 mt-3 p-3 rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(0, 112, 186, 0.04) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.15)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
            >
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  🎯 Japan Autumn Trip
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-all duration-300"
                  style={{
                    background: dynamicDelay === 0 ? "var(--success-bg)" : dynamicDelay <= 15 ? "var(--warning-bg)" : "var(--danger-bg)",
                    color: dynamicDelay === 0 ? "var(--success-text)" : dynamicDelay <= 15 ? "var(--warning-text)" : "var(--danger-text)",
                  }}
                >
                  {dynamicDelay === 0 ? "0 Days Delay ✅" : `+${dynamicDelay} Days Delay`}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                <span>{formatCurrency(milestone.current_balance)} / {formatCurrency(milestone.target_amount)}</span>
                <span>Target: {formatDate(milestone.target_date)}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-default)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg, #10B981, #059669)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            STAGE: STRATEGIES — Multi-Strategy Cards + AG Grid
            ══════════════════════════════════════════════════════ */}
        {stage === "strategies" && (
          <div className="px-6 py-4">
            {/* Engine Header */}
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                Intelligent Affordability Engine
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full ml-auto"
                style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}
              >
                {agentSource === "ollama" || agentSource === "ollama_partial"
                  ? `🧠 Edge AI · Gemma 2 on-device · ${aiTrace?.latency_ms ?? "?"}ms · 0 bytes to cloud`
                  : agentSource === "loading"
                  ? "⏳ Reasoning on-device…"
                  : `⚡ Deterministic fallback engine${aiTrace?.error ? " (local model unreachable)" : ""}`}
              </span>
            </div>

            {/* ── AI TRACE: Propose → Verify pipeline ─────────── */}
            {!isLoadingAgent && aiTrace && (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 px-3 py-2 rounded-lg text-[10px]"
                style={{ background: "var(--bg-primary)", border: "1px dashed var(--border-default)", color: "var(--text-secondary)" }}
              >
                <span>🧮 Solver simulated <b>{aiTrace.candidates_evaluated}</b> plans</span>
                <span>→</span>
                {aiTrace.error ? (
                  <span>🧠 Gemma offline — showing solver's top 3</span>
                ) : (
                  <>
                    <span>
                      🧠 Gemma 2 picked <b>Option {aiTrace.gemma_pick}</b> in {(aiTrace.latency_ms / 1000).toFixed(1)}s
                    </span>
                    <span>→</span>
                    <span>
                      🛡️ Firewall: {aiTrace.verified_cards}/3 verified
                      {aiTrace.corrected_cards > 0 && `, ${aiTrace.corrected_cards} corrected`}
                    </span>
                    {aiTrace.recommendation_by === "solver_guardrail" && (
                      <span style={{ color: "var(--warning-text)" }}>⚖️ Guardrail overrode AI pick</span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── SHARED STATE NOTICE (from dashboard) ───────── */}
            {(hibernatedNames.length > 0 || paceCtx.saved_extra > 0 || paceCtx.prior_payments.length > 0) && (
              <div
                id="pace-shared-context"
                className="mb-3 px-3 py-2 rounded-lg text-[11px]"
                style={{ background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.2)", color: "var(--text-secondary)" }}
              >
                🔗 <b>Synced from your dashboard:</b>{" "}
                {[
                  hibernatedNames.length && `${hibernatedNames.join(" + ")} already hibernated`,
                  paceCtx.saved_extra > 0 && `${formatCurrency(paceCtx.saved_extra)} contributed via PayPal`,
                  paceCtx.prior_payments.length > 0 &&
                    `${formatCurrency(paceCtx.prior_payments.reduce((a, p) => a + p.amount, 0))} still owed on earlier Pace plans`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . The solver plans around these.
              </div>
            )}

            {/* ── PRIORITY MODE SELECTOR ─────────────────────── */}
            <div
              className="flex gap-2 mb-4 p-1.5 rounded-xl"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}
            >
              {PRIORITY_MODES.map((mode) => {
                const Icon = mode.icon;
                const isActive = priorityMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    id={`priority-mode-${mode.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-semibold transition-all duration-200"
                    style={{
                      background: isActive
                        ? mode.id === "career_growth"
                          ? "linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.1))"
                          : mode.id === "goal_shielding"
                          ? "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))"
                          : "linear-gradient(135deg, rgba(0, 112, 186, 0.15), rgba(0, 48, 135, 0.1))"
                        : "transparent",
                      color: isActive
                        ? mode.id === "career_growth"
                          ? "#8B5CF6"
                          : mode.id === "goal_shielding"
                          ? "#10B981"
                          : "var(--paypal-blue)"
                        : "var(--text-muted)",
                      border: isActive
                        ? `1px solid ${
                            mode.id === "career_growth"
                              ? "rgba(139, 92, 246, 0.3)"
                              : mode.id === "goal_shielding"
                              ? "rgba(16, 185, 129, 0.3)"
                              : "rgba(0, 112, 186, 0.3)"
                          }`
                        : "1px solid transparent",
                      cursor: isLoadingAgent ? "wait" : "pointer",
                      opacity: isLoadingAgent && !isActive ? 0.5 : 1,
                    }}
                    onClick={() => !isLoadingAgent && handlePriorityModeChange(mode.id)}
                    disabled={isLoadingAgent}
                    title={mode.desc}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{mode.label}</span>
                    {isActive && isLoadingAgent && (
                      <RefreshCw className="w-3 h-3 animate-spin ml-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── AI INSIGHTS (strict-schema output) ─────────── */}
            {!isLoadingAgent && insights && (
              <div
                className="mb-3 p-3 rounded-xl grid gap-2 sm:grid-cols-[1fr_auto]"
                style={{ background: "rgba(0, 112, 186, 0.05)", border: "1px solid rgba(0, 112, 186, 0.15)" }}
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                    <b>💼 Utility:</b> {insights.utility_narrative}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    <b>💧 Cash-flow risk:</b> {insights.cash_flow_risk}
                  </p>
                </div>
                <div className="text-center px-3 py-1 rounded-lg self-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Feasibility Score
                  </div>
                  <div className="text-lg font-bold" style={{ color: "var(--accent-text)" }}>{insights.confidence}%</div>
                  <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                    {insights.source === "gemma" ? "(Gemma 2B · on-device)" : "(deterministic engine)"}
                  </div>
                  {insights.confidence_baseline !== undefined && (
                    <div className="text-[9px]" style={{ color: "var(--text-muted)" }} id="feasibility-baseline">
                      engine {insights.confidence_baseline}% · AI ±15 max
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── STRATEGY CARDS ─────────────────────────────── */}
            {isLoadingAgent ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--paypal-blue)", borderTopColor: "transparent" }} />
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Simulating plans & asking Gemma 2 for the best fit…
                </span>
              </div>
            ) : (
              <div className="space-y-3 mb-5">
                {strategies.map((strategy, idx) => {
                  const isSelected = strategy.id === selectedStrategyId;
                  const sev = severityStyles[strategy.impact_severity];
                  return (
                    <button
                      key={strategy.id}
                      id={`strategy-${strategy.id}`}
                      className="w-full text-left rounded-xl p-4 transition-all duration-200 animate-fade-in-up"
                      style={{
                        background: isSelected ? sev.selectedBg : sev.bg,
                        border: `2px solid ${isSelected ? sev.selectedBorder : sev.border}`,
                        animationDelay: `${idx * 0.08}s`,
                        animationFillMode: "both",
                        cursor: "pointer",
                      }}
                      onClick={() => handleSelectStrategy(strategy)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Selection indicator */}
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                          style={{
                            border: `2px solid ${isSelected ? sev.accent : "var(--border-default)"}`,
                            background: isSelected ? sev.accent : "transparent",
                          }}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                              {strategy.emoji} {strategy.name}
                            </span>
                            {strategy.recommended && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: "linear-gradient(135deg, #FFC439, #F0B72A)", color: "#003087" }}
                              >
                                ⭐ {strategy.badge}
                              </span>
                            )}
                            {!strategy.recommended && (
                              <span
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                style={{ background: sev.badgeBg, color: sev.badgeColor }}
                              >
                                {strategy.badge}
                              </span>
                            )}
                          </div>

                          {/* Rationale */}
                          <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--text-secondary)" }}>
                            {strategy.rationale}
                          </p>

                          {/* Structure */}
                          <div
                            className="text-[11px] p-2 rounded-lg mb-2"
                            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
                          >
                            <span className="font-semibold" style={{ color: "var(--brand-text)" }}>Structure: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{strategy.structure}</span>
                          </div>

                          {/* Impact badge */}
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                              style={{ background: sev.badgeBg, color: sev.badgeColor }}
                            >
                              {strategy.impact_label}
                            </span>
                            {strategy.text_source && (
                              <span
                                className="text-[10px] ml-auto"
                                style={{ color: "var(--text-muted)" }}
                                title={strategy.text_source === "corrected" ? "Gemma's text contained a number the solver couldn't verify, so it was replaced" : undefined}
                              >
                                {strategy.text_source === "gemma"
                                  ? "🧠 Gemma · ✓ numbers verified"
                                  : strategy.text_source === "corrected"
                                  ? "🛡️ AI text auto-corrected"
                                  : "🧮 Solver"}
                                {strategy.solver_rank ? ` · rank #${strategy.solver_rank}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── GLASS BOX: full reasoning trail ─────────────── */}
            {!isLoadingAgent && reasoning && (
              <ReasoningPanel
                reasoning={reasoning}
                gemmaOnline={!aiTrace?.error}
                demo={{ price: productPrice, product: productName, context: paceCtx }}
              />
            )}

            {/* ── AG GRID — Expense Rebalance Dock ────────────── */}
            {!isLoadingAgent && (
              <>
                <ExpenseRebalanceGrid
                  expenseItems={expenseItems}
                  savingsMilestones={milestoneArray}
                  purchaseAmount={productPrice}
                  productName={productName}
                  onPacingUpdate={(data) => setPacingData(data)}
                  onExpenseToggle={handleExpenseToggle}
                  projection={goalProjection}
                />

                {/* ── PAY WITH PAYPAL (real buyer approval) ─────── */}
                <div
                  id="pace-pay-section"
                  className="mt-6 p-4 rounded-xl"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                      Pay with PayPal — {selectedStrategy?.name || "selected plan"}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {selectedPlan === "outright"
                        ? "Single payment"
                        : selectedPlan === "pay_in_4"
                        ? "Choose Pay in 4 in the PayPal window"
                        : "Choose Pay Monthly in the PayPal window"}
                    </span>
                  </div>
                  {/* Official Pay Later offer, computed by PayPal for this exact amount */}
                  <PayLaterMessage amount={productPrice} placement="cart" className="mb-3" id="modal-paylater-message" />
                  <PayPalSmartButtons
                    fundingSources={selectedPlan === "outright" ? ["paypal", "card"] : ["paylater", "paypal"]}
                    renderKey={selectedPlan}
                    getOrderBody={orderBody}
                    onCaptured={finalizePayment}
                    onError={(m) => setPaymentError(m)}
                    onCancel={() => setPaymentError("PayPal window closed — no payment was taken.")}
                  />
                  {paymentError && (
                    <p className="text-[11px] mt-1" style={{ color: "var(--warning-text)" }} role="alert">
                      {paymentError}
                    </p>
                  )}

                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px" style={{ background: "var(--border-default)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      or, without a sandbox buyer login
                    </span>
                    <div className="flex-1 h-px" style={{ background: "var(--border-default)" }} />
                  </div>

                  <button
                    id="approve-strategy-pay"
                    className="w-full py-3 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      background: "linear-gradient(135deg, #003087 0%, #0070BA 100%)",
                      color: "white",
                      border: "none",
                      cursor: isProcessingPayment ? "wait" : "pointer",
                    }}
                    onClick={handleApproveAndPay}
                    disabled={isProcessingPayment}
                  >
                    {isProcessingPayment ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing Sandbox Payment...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Instant Sandbox Capture · {formatCurrency(productPrice)}
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                    <Lock className="w-3 h-3 inline mr-1" style={{ verticalAlign: "middle" }} />
                    Instant capture uses PayPal&apos;s public sandbox test card · real order on api-m.sandbox.paypal.com
                    {" • Protected by PayPal Buyer Protection"}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            STAGE: CONFIRMATION — PayPal Receipt Card
            ══════════════════════════════════════════════════════ */}
        {stage === "confirmation" && (
          <div className="px-6 py-6">
            {/* Success Header */}
            <div className="text-center mb-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
              >
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                {orderStatus === "COMPLETED"
                  ? "Payment Captured Successfully!"
                  : orderStatus === "DEMO_ONLY"
                  ? "Demo Receipt (PayPal Sandbox unreachable)"
                  : `Order ${orderStatus}`}
              </h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {selectedStrategy?.name || "Plan"} applied
                {orderStatus === "COMPLETED" && " · verified on api-m.sandbox.paypal.com"}.
              </p>
            </div>

            {/* Selected Strategy Summary */}
            {selectedStrategy && (
              <div
                className="p-4 rounded-xl mb-4"
                style={{
                  background: severityStyles[selectedStrategy.impact_severity].selectedBg,
                  border: `1px solid ${severityStyles[selectedStrategy.impact_severity].selectedBorder}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold">{selectedStrategy.emoji} {selectedStrategy.name}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{selectedStrategy.structure}</p>
              </div>
            )}

            {/* Order Details Card */}
            <div
              className="p-5 rounded-xl mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(0, 48, 135, 0.03) 0%, rgba(0, 112, 186, 0.05) 100%)",
                border: "1px solid rgba(0, 112, 186, 0.15)",
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--brand-text)" }}>
                  PayPal Sandbox Receipt
                </span>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Sandbox Order ID", value: orderId, field: "order" },
                  { label: "Capture ID", value: captureId, field: "capture" },
                ].map((row) => (
                  <div key={row.field} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>{row.label}</div>
                      <div className="font-mono text-sm font-bold" style={{ color: "var(--brand-text)" }}>{row.value}</div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(row.value || "", row.field)}
                      className="p-1.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {copiedField === row.field ? (
                        <Check className="w-4 h-4" style={{ color: "var(--success)" }} />
                      ) : (
                        <Copy className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      )}
                    </button>
                  </div>
                ))}

                {/* Funding source */}
                {fundingSource && (
                  <div className="p-3 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Funded by</div>
                    <div className="font-semibold text-sm" id="receipt-funding" style={{ color: "var(--brand-text)" }}>
                      {FUNDING_LABEL[fundingSource] ?? fundingSource}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {fundingSource === "paylater"
                        ? `${merchantName} is paid ${formatCurrency(productPrice)} in full; your installments are with PayPal.`
                        : fundingSource === "sandbox_card"
                        ? `Full ${formatCurrency(productPrice)} captured; the ${selectedPlan === "outright" ? "payment" : "installment schedule below"} is Pace's plan.`
                        : `Buyer-approved in the PayPal window.`}
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Status</div>
                    <div className="font-semibold text-sm" style={{ color: orderStatus === "COMPLETED" ? "var(--success)" : "var(--warning-text)" }}>{orderStatus}</div>
                  </div>
                  {orderStatus === "COMPLETED" ? (
                    <CheckCircle2 className="w-5 h-5" style={{ color: "var(--success)" }} />
                  ) : (
                    <AlertTriangle className="w-5 h-5" style={{ color: "var(--warning)" }} />
                  )}
                </div>
              </div>
            </div>

            {/* Paused Subscriptions */}
            {pausedSubNames.length > 0 && (
              <div
                className="p-4 rounded-xl mb-4"
                style={{ background: "var(--warning-bg)", border: "1px solid rgba(245, 158, 11, 0.2)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" style={{ color: "var(--warning)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--warning-text)" }}>Subscription Leaks Paused</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pausedSubNames.map((name) => (
                    <span key={name} className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning-text)" }}>
                      ⏸️ {name}
                    </span>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--warning-text)" }}>
                  {formatCurrency(pausedTotal)}/mo recovered and redirected to milestone protection.
                </p>
              </div>
            )}

            {/* Milestone Preservation */}
            <div
              className="p-4 rounded-xl mb-4"
              style={{
                background:
                  goalProjection.delay_days === 0
                    ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                    : "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                  <Plane className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-white font-bold text-sm">
                    {goalProjection.delay_days === 0
                      ? `✅ ${milestone.name} target date preserved`
                      : `⚠️ ${milestone.name} moves +${goalProjection.delay_days} days (you chose this trade-off)`}
                  </div>
                  <div className="text-white/80 text-xs">
                    {goalProjection.delay_days === 0
                      ? `Target date: ${formatDate(milestone.target_date)}`
                      : `${formatDate(milestone.target_date)} → ${formatDate(goalProjection.projected_date)}`}{" "}
                    • {formatCurrency(milestone.current_balance)} / {formatCurrency(milestone.target_amount)}
                    {goalProjection.unmitigated_delay_days > goalProjection.delay_days &&
                      ` • ${goalProjection.unmitigated_delay_days - goalProjection.delay_days} days saved vs. paying in full`}
                  </div>
                </div>
              </div>
            </div>

            {/* Pay in 4 Schedule */}
            {selectedPlan !== "outright" && (
              <div
                className="p-4 rounded-xl mb-4"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                    {selectedPlan === "pay_in_4" ? "Pay in 4 Schedule · 0% APR" : `Pay Monthly Schedule · ${planCount} payments`}
                    {fundingSource === "paylater" ? " · final terms shown by PayPal" : " · Pace plan"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: Math.min(planCount, 4) }, (_, i) => i).map((i) => (
                    <div
                      key={i}
                      className="text-center p-2 rounded-lg"
                      style={{
                        background: i === 0 ? "rgba(0, 112, 186, 0.08)" : "var(--bg-surface)",
                        border: `1px solid ${i === 0 ? "rgba(0, 112, 186, 0.2)" : "var(--border-default)"}`,
                      }}
                    >
                      <div className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>
                        {selectedPlan === "pay_in_4"
                          ? i === 0 ? "Today" : `+${i * 2} wks`
                          : i === 3 && planCount > 4 ? `+${planCount - 3} more` : `Month ${i + 1}`}
                      </div>
                      <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>
                        ${selectedStrategy?.installment_amount ?? installmentAmount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Close */}
            <button
              id="pace-confirmation-close"
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.01]"
              style={{
                background: "linear-gradient(135deg, #003087 0%, #0070BA 100%)",
                color: "white",
                border: "none",
              }}
              onClick={onClose}
            >
              Close
            </button>
            {orderStatus === "COMPLETED" && (
              <a
                href="/"
                id="pace-view-dashboard"
                className="block text-center text-xs font-semibold mt-3"
                style={{ color: "var(--accent-text)" }}
              >
                View the updated {milestone.name} forecast on your dashboard →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
