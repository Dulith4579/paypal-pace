// src/components/AgentTimeline.tsx
"use client";

// ============================================================
// Agent Activity Timeline
// ============================================================
// One chronological audit feed of everything Pace did for this user,
// across the whole app: hibernations (with their goal effect), PayPal
// captures, checkout analyses (Gemma pick, guardrail, firewall), firewall
// catches, and the live Next-Installment Guard status on top.
// Reads only the shared pace-store — no new data, no new API calls.
// ============================================================

import { useMemo, useState } from "react";
import {
  Activity,
  BedDouble,
  Sunrise,
  SlidersHorizontal,
  CreditCard,
  PiggyBank,
  Brain,
  ShieldX,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { usePaceState, todayISO, type PaceEvent, type PaceEventKind } from "@/lib/pace-store";
import { guardRows, PLAN_NAME } from "@/lib/installment-guard";
import { formatCurrency, formatDate, addDaysToDate } from "@/lib/math-engine";

const KIND: Record<PaceEventKind, { icon: typeof Activity; color: string }> = {
  hibernate: { icon: BedDouble, color: "#3B82F6" },
  resume: { icon: Sunrise, color: "#94A3B8" },
  lever: { icon: SlidersHorizontal, color: "#3B82F6" },
  purchase: { icon: CreditCard, color: "#0070BA" },
  contribution: { icon: PiggyBank, color: "#10B981" },
  agent: { icon: Brain, color: "#8B5CF6" },
  firewall: { icon: ShieldX, color: "#EF4444" },
  guard: { icon: ShieldCheck, color: "#10B981" },
};

const ACTOR: Record<PaceEvent["actor"], { label: string; bg: string; fg: string }> = {
  you: { label: "You", bg: "rgba(59,130,246,0.12)", fg: "color-mix(in srgb, #2563EB 75%, var(--text-primary))" },
  agent: { label: "Agent", bg: "rgba(139,92,246,0.14)", fg: "color-mix(in srgb, #7C3AED 75%, var(--text-primary))" },
  firewall: { label: "Firewall", bg: "rgba(239,68,68,0.12)", fg: "color-mix(in srgb, #DC2626 75%, var(--text-primary))" },
  guard: { label: "Guard", bg: "rgba(16,185,129,0.14)", fg: "color-mix(in srgb, #059669 75%, var(--text-primary))" },
};

type Filter = "all" | "agent";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AgentTimeline() {
  const pace = usePaceState();
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);

  // Live guard status (recomputed, not logged — it changes as days pass)
  const guard = useMemo(() => guardRows(pace), [pace]);
  const events = useMemo(() => {
    const list = [...pace.events].reverse();
    return filter === "agent" ? list.filter((e) => e.actor !== "you") : list;
  }, [pace.events, filter]);
  const visible = showAll ? events : events.slice(0, 8);

  return (
    <div className="card p-4 h-full" id="agent-timeline">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Activity className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Agent Activity Timeline
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          everything Pace audited, executed and protected
        </span>
        <div className="ml-auto flex gap-1 text-[10px]">
          {(["all", "agent"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              data-testid={`timeline-filter-${f}`}
              className="px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: filter === f ? "var(--paypal-blue)" : "var(--bg-primary)",
                color: filter === f ? "white" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              {f === "all" ? "All" : "Agent & guards"}
            </button>
          ))}
        </div>
      </div>

      {/* Live: next-installment guard */}
      {guard.map(({ p, next, ok, slip, shortBy }) => (
        <div
          key={p.order_id}
          className="mb-2 p-2 rounded-lg text-[11px] flex items-start gap-2"
          style={{
            background: ok ? "rgba(16,185,129,0.07)" : "rgba(245,158,11,0.09)",
            border: `1px dashed ${ok ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.5)"}`,
          }}
          data-testid="timeline-guard-live"
        >
          {ok ? (
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#10B981" }} />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
          )}
          <div>
            <b>Now · Guard:</b> {PLAN_NAME[p.plan]} payment #{next.n} {formatCurrency(next.amount)} due{" "}
            {next.day === 0 ? "today" : formatDate(addDaysToDate(todayISO(), next.day))} —{" "}
            {ok
              ? "covered, 0 days goal slippage ✅"
              : [shortBy > 0 ? `short ${formatCurrency(shortBy)}` : "", slip > 0 ? `goal +${slip} days` : ""].filter(Boolean).join(" · ") + " ⚠️"}
          </div>
        </div>
      ))}

      {events.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }} data-testid="timeline-empty">
          No activity yet: hibernate a subscription, contribute to a goal, or check out in the Store, and Pace logs what it did
          and why.
        </p>
      ) : (
        <ol className="relative ml-2" style={{ borderLeft: "2px solid var(--border-default)" }}>
          {visible.map((e) => {
            const k = KIND[e.kind];
            const a = ACTOR[e.actor];
            const Icon = k.icon;
            return (
              <li key={e.id} className="relative pl-5 pb-3" data-testid={`timeline-event-${e.kind}`}>
                <span
                  className="absolute -left-[11px] top-0 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--bg-surface)", border: `2px solid ${k.color}` }}
                >
                  <Icon className="w-2.5 h-2.5" style={{ color: k.color }} />
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span>{when(e.at)}</span>
                  <span className="px-1.5 rounded-full font-bold" style={{ background: a.bg, color: a.fg }}>
                    {a.label}
                  </span>
                  {e.demo && (
                    <span className="px-1.5 rounded-full font-bold" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
                      demo injection
                    </span>
                  )}
                </div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
                  {e.title}
                </div>
                {e.detail && (
                  <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {e.detail}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {events.length > 8 && (
        <button
          type="button"
          className="text-[11px] underline"
          style={{ color: "var(--accent-text)" }}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show latest 8" : `Show all ${events.length}`}
        </button>
      )}
    </div>
  );
}
