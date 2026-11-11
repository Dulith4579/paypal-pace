"use client";

import { useState } from "react";
import {
  Heart,
  X,
  Clock,
  TrendingUp,
  CreditCard,
  Scissors,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Calendar,
} from "lucide-react";
import type { RebalanceResult, RecoveryPath, ImpactCalculation } from "@/types/financial";
import { formatCurrency, formatDate } from "@/lib/math-engine";

interface ReassuranceModalProps {
  result: RebalanceResult;
  onClose: () => void;
  onSelectPath: (path: RecoveryPath) => void;
}

const pathIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  timeline_flex: Clock,
  micro_surge: TrendingUp,
  pay_later: CreditCard,
  subscription_cleanup: Scissors,
};

const pathColors: Record<string, { bg: string; accent: string; border: string }> = {
  timeline_flex: { bg: "color-mix(in srgb, #3B82F6 10%, var(--bg-surface))", accent: "#3B82F6", border: "color-mix(in srgb, #3B82F6 35%, var(--bg-surface))" },
  micro_surge: { bg: "color-mix(in srgb, #10B981 10%, var(--bg-surface))", accent: "#10B981", border: "color-mix(in srgb, #10B981 35%, var(--bg-surface))" },
  pay_later: { bg: "color-mix(in srgb, #D946EF 10%, var(--bg-surface))", accent: "#D946EF", border: "color-mix(in srgb, #D946EF 35%, var(--bg-surface))" },
  subscription_cleanup: { bg: "color-mix(in srgb, #F59E0B 10%, var(--bg-surface))", accent: "#F59E0B", border: "color-mix(in srgb, #F59E0B 35%, var(--bg-surface))" },
};

export default function ReassuranceModal({
  result,
  onClose,
  onSelectPath,
}: ReassuranceModalProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleSelectPath = async (path: RecoveryPath) => {
    setSelectedPath(path.type);
    setIsApplying(true);
    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setIsApplying(false);
    onSelectPath(path);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-overlay"
      style={{ background: "rgba(0, 0, 0, 0.4)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl animate-modal"
        style={{
          background: "var(--bg-surface)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* Header */}
        <div className="relative p-6 pb-4">
          {/* Close button */}
          <button
            id="reassurance-close"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </button>

          {/* Empathy Header */}
          <div className="flex items-start gap-4 mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 animate-float"
              style={{ background: "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)" }}
            >
              <Heart className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 pr-8">
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--brand-text)" }}>
                Life Happens! 🎉
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {result.empathy_message}
              </p>
            </div>
          </div>

          {/* Purchase Summary */}
          <div
            className="rounded-xl p-3 mb-2"
            style={{
              background: "linear-gradient(135deg, rgba(0, 112, 186, 0.06) 0%, rgba(0, 48, 135, 0.03) 100%)",
              border: "1px solid rgba(0, 112, 186, 0.1)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Purchase Amount
              </span>
              <span className="text-xl font-bold" style={{ color: "var(--brand-text)" }}>
                {formatCurrency(result.purchase_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Impact Analysis */}
        <div className="px-6 pb-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <AlertCircle className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
            Impact on Your Goals
          </h3>
          <div className="space-y-2">
            {result.impacts.map((impact: ImpactCalculation, index: number) => (
              <div
                key={impact.goal_id}
                className="rounded-lg p-3 animate-fade-in"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-default)",
                  animationDelay: `${index * 0.1}s`,
                  animationFillMode: "both",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{impact.goal_name}</span>
                  <span className="badge badge-warning">+{impact.delay_days} days</span>
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>New date: {formatDate(impact.new_target_date)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>+{formatCurrency(impact.daily_hike)}/day to stay on track</span>
                  </div>
                </div>
                {/* Mini progress bar */}
                <div className="mt-2 progress-bar" style={{ height: "4px" }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${impact.progress_pct}%`,
                      background: impact.progress_pct >= 50 ? "var(--success)" : "var(--warning)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recovery Paths */}
        <div className="px-6 pb-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Sparkles className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
            Your Recovery Options
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.recovery_paths.map((path: RecoveryPath, index: number) => {
              const Icon = pathIcons[path.type] || ChevronRight;
              const colors = pathColors[path.type] || pathColors.timeline_flex;
              const isSelected = selectedPath === path.type;

              return (
                <button
                  key={path.type}
                  id={`recovery-${path.type}`}
                  onClick={() => handleSelectPath(path)}
                  disabled={isApplying}
                  className="text-left rounded-xl p-4 transition-all hover:scale-[1.02] animate-fade-in-up relative"
                  style={{
                    background: isSelected ? colors.accent : colors.bg,
                    border: `2px solid ${isSelected ? colors.accent : colors.border}`,
                    color: isSelected ? "#ffffff" : "inherit",
                    animationDelay: `${(index + result.impacts.length) * 0.08}s`,
                    animationFillMode: "both",
                  }}
                >
                  {path.recommended && (
                    <span
                      className="absolute -top-2 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: "var(--paypal-gold)",
                        color: "var(--text-primary)",
                      }}
                    >
                      ⭐ Recommended
                    </span>
                  )}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isSelected ? "rgba(255,255,255,0.2)" : `${colors.accent}15`,
                      }}
                    >
                      <Icon
                        className="w-4.5 h-4.5"
                        style={{ color: isSelected ? "#ffffff" : colors.accent }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold mb-0.5">{path.title}</h4>
                      <p
                        className="text-xs leading-relaxed mb-2"
                        style={{
                          color: isSelected ? "rgba(255,255,255,0.85)" : "var(--text-secondary)",
                        }}
                      >
                        {path.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-lg font-bold">{path.metric_value}</span>
                          <span
                            className="text-[10px] ml-1"
                            style={{
                              color: isSelected ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
                            }}
                          >
                            {path.metric_label}
                          </span>
                        </div>
                        {isSelected && isApplying ? (
                          <span className="text-sm animate-spin">⏳</span>
                        ) : isSelected ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <ArrowRight
                            className="w-4 h-4"
                            style={{ color: "var(--text-muted)" }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="px-6 pb-6">
          <div
            className="rounded-xl p-4"
            style={{
              background: "linear-gradient(135deg, var(--paypal-navy) 0%, var(--paypal-blue) 100%)",
            }}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white mb-1">
                  Pace&apos;s Recommendation
                </h4>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {result.ai_recommendation}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
