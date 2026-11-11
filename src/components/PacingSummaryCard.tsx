// src/components/PacingSummaryCard.tsx
"use client";

// Readable view of calculatePacing() output for the Agent Lab, with the raw
// engine JSON kept under a collapsible section for judges who want it.

import { Lightbulb, Clock, Gauge, ListChecks } from "lucide-react";
import type { calculatePacing } from "@/lib/pacing";
import { formatCurrency } from "@/lib/math-engine";

type PacingSummary = ReturnType<typeof calculatePacing>;

export default function PacingSummaryCard({ summary, productName }: { summary: PacingSummary; productName?: string }) {
  const intel = summary.intelligence;
  const snap = intel.milestone_snapshot;
  const saved = intel.without_pace_delay_days - intel.with_pace_delay_days;

  const stats = [
    { icon: Clock, label: "Goal delay without Pace", value: `${intel.without_pace_delay_days} days` },
    { icon: Clock, label: "Goal delay with Pace", value: `${intel.with_pace_delay_days} days` },
    { icon: Gauge, label: "Plan confidence", value: `${intel.confidence_score}%` },
    { icon: ListChecks, label: "Paused expenses", value: `${summary.expense_summary.paused_expenses_count} · ${formatCurrency(summary.expense_summary.paused_expenses_total)}/mo` },
  ];

  return (
    <section className="card p-5 mt-8" id="justification-section">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="w-5 h-5" style={{ color: "var(--paypal-blue)" }} />
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>How Pace decided</h2>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        {productName ? `${productName} · ` : ""}classified as <b>{intel.classification.label}</b>. {intel.classification.framingPrefix}
      </p>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-3 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}>
            <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <div className="text-lg font-bold">{value}</div>
          </div>
        ))}
      </div>

      {saved > 0 && (
        <p className="text-sm font-medium mb-4" style={{ color: "var(--success-text)" }}>
          Pace keeps the goal {saved} day{saved === 1 ? "" : "s"} closer to its original date.
        </p>
      )}

      <h3 className="text-sm font-semibold mb-2">Levers in the plan</h3>
      <ul className="flex flex-col gap-2 mb-4">
        {intel.levers.map((l) => (
          <li key={l.lever} className="text-sm p-3 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}>
            <b>{l.lever}</b>
            <span style={{ color: "var(--text-secondary)" }}> · {l.detail}</span>
          </li>
        ))}
      </ul>

      {snap && (
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          {snap.goal_name}: original target {snap.original_target_date} · with Pace {snap.with_pace_target_date} · without Pace {snap.without_pace_target_date}
        </p>
      )}

      <details>
        <summary className="text-xs font-semibold cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          Raw engine output (JSON)
        </summary>
        <pre
          className="mt-2 p-4 rounded-lg overflow-x-auto text-xs"
          style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          data-testid="pacing-summary"
        >
          {JSON.stringify(summary, null, 2)}
        </pre>
      </details>
    </section>
  );
}
