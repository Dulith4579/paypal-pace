"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plane,
  Shield,
  Laptop,
  GraduationCap,
  Dumbbell,
  TrendingUp,
  Calendar,
  DollarSign,
  Target,
  PlusCircle,
  CheckCircle2,
  X,
  Zap,
} from "lucide-react";
import type { Milestone } from "@/types/financial";
import { progressPercent, daysRemaining, baseDailyRate, remainingBalance, formatCurrency, formatDate } from "@/lib/math-engine";
import PayPalSmartButtons from "@/components/PayPalSmartButtons";
import { usePaceState, paceActions, contributedTo, todayISO } from "@/lib/pace-store";
import { instantSandboxCapture, FUNDING_LABEL, type CapturedPayment } from "@/lib/paypal-sdk";

interface MilestoneCardProps {
  milestone: Milestone;
  animationDelay?: number;
  onClick?: () => void;
}

function getMotivationalMessage(progress: number): string {
  if (progress >= 100) return "Fully funded — enjoy it! 🎉";
  if (progress >= 90) return "You're crushing it! Keep up the fantastic work.";
  if (progress >= 70) return "Great progress! Stay focused and you'll reach your goal soon.";
  if (progress >= 40) return "Good effort! Keep pushing forward.";
  return "Every step counts. Keep moving toward your milestone!";
}

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Plane,
  Shield,
  Laptop,
  GraduationCap,
  Dumbbell,
};

const categoryColors: Record<string, { bg: string; text: string; accent: string }> = {
  travel: { bg: "color-mix(in srgb, #3B82F6 14%, var(--bg-surface))", text: "color-mix(in srgb, #3B82F6 70%, var(--text-primary))", accent: "#3B82F6" },
  emergency: { bg: "color-mix(in srgb, #F59E0B 14%, var(--bg-surface))", text: "color-mix(in srgb, #F59E0B 70%, var(--text-primary))", accent: "#F59E0B" },
  tech: { bg: "color-mix(in srgb, #22C55E 14%, var(--bg-surface))", text: "color-mix(in srgb, #22C55E 70%, var(--text-primary))", accent: "#22C55E" },
  education: { bg: "color-mix(in srgb, #D946EF 14%, var(--bg-surface))", text: "color-mix(in srgb, #D946EF 70%, var(--text-primary))", accent: "#D946EF" },
  health: { bg: "color-mix(in srgb, #FB7185 14%, var(--bg-surface))", text: "color-mix(in srgb, #FB7185 70%, var(--text-primary))", accent: "#FB7185" },
  lifestyle: { bg: "color-mix(in srgb, #0EA5E9 14%, var(--bg-surface))", text: "color-mix(in srgb, #0EA5E9 70%, var(--text-primary))", accent: "#0EA5E9" },
  investment: { bg: "color-mix(in srgb, #10B981 14%, var(--bg-surface))", text: "color-mix(in srgb, #10B981 70%, var(--text-primary))", accent: "#10B981" },
  other: { bg: "color-mix(in srgb, #6B7280 14%, var(--bg-surface))", text: "color-mix(in srgb, #6B7280 70%, var(--text-primary))", accent: "#6B7280" },
};

const PRESETS = [25, 50, 100];

export default function MilestoneCard({ milestone: baseMilestone, animationDelay = 0, onClick }: MilestoneCardProps) {
  // Contributions captured via PayPal are kept in the shared pace-store
  const pace = usePaceState();
  const contributed = contributedTo(pace, baseMilestone.goal_id);
  const milestone = useMemo(
    () => ({ ...baseMilestone, current_balance: baseMilestone.current_balance + contributed }),
    [baseMilestone, contributed]
  );

  const [progress, setProgress] = useState(0);
  const [days, setDays] = useState(1);
  const [dailyRate, setDailyRate] = useState(0);

  useEffect(() => {
    const p = Math.min(100, progressPercent(milestone));
    const d = daysRemaining(milestone.target_date);
    const R = remainingBalance(milestone);
    setProgress(p);
    setDays(d);
    setDailyRate(baseDailyRate(R, d));
  }, [milestone]);

  // ── Contribute flow ─────────────────────────────────────
  const remaining = Math.max(0, Math.round(remainingBalance(milestone) * 100) / 100);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<(CapturedPayment & { amount: number }) | null>(null);
  // Read by PayPal's createOrder at click time (after render)
  const amountRef = useRef(Math.min(amount, remaining));
  useEffect(() => {
    amountRef.current = Math.min(amount, remaining);
  }, [amount, remaining]);

  const orderBody = useCallback(
    () => ({
      amount: amountRef.current,
      description: `Goal contribution · ${baseMilestone.name}`,
      currency: "USD",
    }),
    [baseMilestone.name]
  );

  const onCaptured = useCallback(
    (p: CapturedPayment) => {
      const value = amountRef.current;
      if (p.status === "COMPLETED") {
        paceActions.recordContribution({
          order_id: p.order_id,
          capture_id: p.capture_id,
          goal_id: baseMilestone.goal_id,
          amount: value,
          funding: p.funding,
          date: todayISO(),
        });
        setLastCapture({ ...p, amount: value });
        setOpen(false);
        setError(null);
      } else {
        setError(`Order ${p.order_id} is ${p.status} — nothing was added.`);
      }
    },
    [baseMilestone.goal_id]
  );

  const instant = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      onCaptured(await instantSandboxCapture(orderBody()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sandbox unreachable — nothing was charged.");
    } finally {
      setBusy(false);
    }
  }, [onCaptured, orderBody]);

  const Icon = iconMap[milestone.icon] || Target;
  const colors = categoryColors[milestone.category] || categoryColors.other;

  const progressColor = progress >= 70 ? "var(--success)" : progress >= 40 ? "var(--warning)" : "var(--danger)";
  const statusLabel = progress >= 100 ? "Funded" : progress >= 70 ? "On Track" : progress >= 40 ? "Watch" : "At Risk";
  const statusBadge = progress >= 70 ? "badge-success" : progress >= 40 ? "badge-warning" : "badge-danger";
  const effective = Math.min(amount, remaining);

  return (
    <div
      className="card p-5 cursor-pointer group animate-fade-in-up"
      style={{
        animationDelay: `${animationDelay}s`,
        animationFillMode: "both",
      }}
      onClick={onClick}
      id={`milestone-${milestone.goal_id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
            style={{ background: colors.bg }}
          >
            <Icon className="w-5 h-5" style={{ color: colors.accent }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">{milestone.name}</h3>
            <span className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
              {milestone.category}
            </span>
          </div>
        </div>
        <span className={`badge ${statusBadge}`}>{statusLabel}</span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Progress
          </span>
          <span className="text-xs font-bold" style={{ color: progressColor }}>
            {progress.toFixed(1)}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill animate-progress-fill"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${progressColor}, ${progressColor}dd)`,
            }}
          />
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {formatCurrency(milestone.current_balance)}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            of {formatCurrency(milestone.target_amount)}
            {contributed > 0 && <span style={{ color: "var(--success)" }}> · +{formatCurrency(contributed)} via PayPal</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold" style={{ color: "var(--accent-text)" }}>
            {formatCurrency(remaining)}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>remaining</div>
        </div>
      </div>

      <div className="mt-2 text-sm italic" style={{ color: "var(--text-muted)" }}>
        {getMotivationalMessage(progress)}
      </div>

      {/* ── Contribute via PayPal ───────────────────────── */}
      {/* stopPropagation: the card itself is clickable */}
      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
        {lastCapture && !open && (
          <div
            className="mb-2 p-2 rounded-lg text-[11px] flex items-start gap-2"
            style={{ background: "var(--success-bg)", color: "var(--success-text)" }}
            data-testid={`contribution-receipt-${milestone.goal_id}`}
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>
              {formatCurrency(lastCapture.amount)} added via {FUNDING_LABEL[lastCapture.funding] ?? lastCapture.funding} · capture{" "}
              <span className="font-mono">{lastCapture.capture_id}</span>
            </span>
          </div>
        )}

        {remaining <= 0 ? null : !open ? (
          <button
            data-testid={`contribute-open-${milestone.goal_id}`}
            onClick={() => {
              setOpen(true);
              setError(null);
            }}
            className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
            style={{ background: "var(--bg-primary)", color: "var(--brand-text)", border: "1px solid var(--border-default)" }}
          >
            <PlusCircle className="w-4 h-4" /> Contribute via PayPal
          </button>
        ) : (
          <div className="p-3 rounded-xl" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Add to {milestone.name}</span>
              <button onClick={() => setOpen(false)} aria-label="Close contribution panel" className="p-0.5">
                <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[...PRESETS.filter((p) => p < remaining), remaining].map((v, i) => (
                <button
                  key={`${v}-${i}`}
                  data-testid={`contribute-amount-${v}`}
                  onClick={() => setAmount(v)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    background: effective === v ? "var(--paypal-blue)" : "var(--bg-surface)",
                    color: effective === v ? "white" : "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {v === remaining ? `Rest (${formatCurrency(v)})` : formatCurrency(v)}
                </button>
              ))}
            </div>
            <PayPalSmartButtons
              fundingSources={["paypal", "card"]}
              height={36}
              getOrderBody={orderBody}
              onCaptured={onCaptured}
              onError={setError}
              onCancel={() => setError("PayPal window closed — nothing was charged.")}
            />
            <button
              data-testid={`contribute-instant-${milestone.goal_id}`}
              onClick={instant}
              disabled={busy}
              className="w-full mt-1 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1"
              style={{ color: "var(--accent-text)", border: "1px dashed var(--border-default)", cursor: busy ? "wait" : "pointer" }}
            >
              <Zap className="w-3.5 h-3.5" />
              {busy ? "Capturing…" : `Instant sandbox capture · ${formatCurrency(effective)} (test card)`}
            </button>
            {error && (
              <p className="text-[11px] mt-1.5" style={{ color: "var(--warning-text)" }} role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 pt-3 mt-3" style={{ borderTop: "1px solid var(--border-default)" }}>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {days}d left
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {formatCurrency(dailyRate)}/day
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {formatDate(milestone.target_date)}
          </span>
        </div>
      </div>
    </div>
  );
}
