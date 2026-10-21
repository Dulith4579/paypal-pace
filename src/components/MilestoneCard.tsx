"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import type { Milestone } from "@/types/financial";
import { progressPercent, daysRemaining, baseDailyRate, remainingBalance, formatCurrency, formatDate } from "@/lib/math-engine";

interface MilestoneCardProps {
  milestone: Milestone;
  animationDelay?: number;
  onClick?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Plane,
  Shield,
  Laptop,
  GraduationCap,
  Dumbbell,
};

const categoryColors: Record<string, { bg: string; text: string; accent: string }> = {
  travel: { bg: "#EFF6FF", text: "#1E40AF", accent: "#3B82F6" },
  emergency: { bg: "#FEF3C7", text: "#92400E", accent: "#F59E0B" },
  tech: { bg: "#F0FDF4", text: "#166534", accent: "#22C55E" },
  education: { bg: "#FDF4FF", text: "#86198F", accent: "#D946EF" },
  health: { bg: "#FFF1F2", text: "#9F1239", accent: "#FB7185" },
  lifestyle: { bg: "#F0F9FF", text: "#075985", accent: "#0EA5E9" },
  investment: { bg: "#ECFDF5", text: "#065F46", accent: "#10B981" },
  other: { bg: "#F3F4F6", text: "#374151", accent: "#6B7280" },
};

export default function MilestoneCard({ milestone, animationDelay = 0, onClick }: MilestoneCardProps) {
  const [progress, setProgress] = useState(0);
  const [days, setDays] = useState(1);
  const [dailyRate, setDailyRate] = useState(0);

  useEffect(() => {
    const p = progressPercent(milestone);
    const d = daysRemaining(milestone.target_date);
    const R = remainingBalance(milestone);
    const rate = baseDailyRate(R, d);
    setProgress(p);
    setDays(d);
    setDailyRate(rate);
  }, [milestone]);


  const Icon = iconMap[milestone.icon] || Target;
  const colors = categoryColors[milestone.category] || categoryColors.other;

  const progressColor = progress >= 70 ? "var(--success)" : progress >= 40 ? "var(--warning)" : "var(--danger)";
  const statusLabel = progress >= 70 ? "On Track" : progress >= 40 ? "Watch" : "At Risk";
  const statusBadge = progress >= 70 ? "badge-success" : progress >= 40 ? "badge-warning" : "badge-danger";

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
            <span
              className="text-xs capitalize"
              style={{ color: "var(--text-muted)" }}
            >
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
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold" style={{ color: "var(--paypal-blue)" }}>
            {formatCurrency(remainingBalance(milestone))}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>remaining</div>
        </div>
      </div>

      {/* Stats Row */}
      <div
        className="flex items-center gap-4 pt-3"
        style={{ borderTop: "1px solid var(--border-default)" }}
      >
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
