// src/components/MilestoneArbitrageCard.tsx
"use client";

// ============================================================
// Milestone Arbitrage & Impulse Shock-Absorber (dashboard card)
// ============================================================
// Self-contained: own state, own API sub-handler
// (/api/agent/arbitrage). Deterministic numbers render instantly
// client-side; local Gemma 2B then upgrades the narrative in the
// background. Does not touch checkout / PayPal Sandbox logic.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Plane, Zap, Utensils, Search, Snowflake, ShieldCheck, Lock, Cpu, Loader2 } from "lucide-react";
import {
  buildAudit,
  simulateImpulse,
  leverImpact,
  pausedMonthlyOf,
  IDLE_PAIR,
  FOOD_CAP_MONTHLY,
  type AuditRow,
  type ImpulseVerdict,
} from "@/lib/arbitrage";
import { fundingForecast, isProtectedSub, resumeOutlook, type ResumeOutlook } from "@/lib/strategy-solver";
import { userProfile } from "@/lib/mock-data";
import { formatCurrency, formatDate, addDaysToDate } from "@/lib/math-engine";
import { usePaceState, paceActions, paceContextOf, remainingPayments, todayISO } from "@/lib/pace-store";
import { FUNDING_LABEL } from "@/lib/paypal-sdk";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Telemetry {
  engine: "gemma" | "deterministic";
  latency_ms: number;
  cloud_calls: 0;
  firewall: { checked: number; corrected: number };
  error?: string;
}

const CHIPS = [
  { emoji: "🎧", label: "ANC Headphones", amount: 350 },
  { emoji: "🖥️", label: "4K Dev Monitor", amount: 299 },
  { emoji: "⌨️", label: "Mechanical Keyboard", amount: 180 },
];

type GridRow = AuditRow & {
  pinned?: boolean;
  /** Wake-up date for a hibernated sub: when it can be resumed with 0 days goal delay. */
  resume?: ResumeOutlook & { label: string; tip: string };
};

/** "Resume Dec 3" / "Resume anytime" / "Keep paused" + tooltip text. */
function resumeLabel(o: ResumeOutlook): { label: string; tip: string } {
  const date = formatDate(addDaysToDate(todayISO(), o.day));
  const cost = o.buffer_cost_days > 0 ? ` Resuming then uses ${o.buffer_cost_days.toFixed(1)} days of your buffer.` : "";
  if (o.kind === "hold") return { label: "Keep paused", tip: `Your goal is behind schedule — resuming would delay it further.` };
  if (o.kind === "now") return { label: "Resume anytime", tip: `Safe to resume today: the Japan trip stays on time.${cost}` };
  return { label: `Resume ${date}`, tip: `Safe to resume on ${date} (${o.reason}) — the Japan trip stays on time.${cost}` };
}

/**
 * Wrapper: every forecast depends on today's date, which Next.js (with
 * cacheComponents) must not read during prerender — so the interactive
 * card mounts client-side only, behind a lightweight skeleton.
 */
export default function MilestoneArbitrageCard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <section className="card p-5 mb-8" id="milestone-arbitrage" aria-busy="true">
        <h2 className="text-lg font-bold">Milestone Arbitrage &amp; Impulse Shock-Absorber</h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Loading on-device forecast…</p>
      </section>
    );
  }
  return <ArbitrageCardBody />;
}

function ArbitrageCardBody() {
  const goal = userProfile.primary_goal;

  // ── State ───────────────────────────────────────────────
  // Hibernations, levers, purchases and contributions live in the shared
  // pace-store, so checkout (store page) and this card see the same facts.
  const pace = usePaceState();
  const { pausedIds, foodCap } = pace;
  const fullCtx = useMemo(() => paceContextOf(pace), [pace]);
  const ctxKey = JSON.stringify([fullCtx.saved_extra, fullCtx.prior_payments]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ saved_extra: fullCtx.saved_extra, prior_payments: fullCtx.prior_payments }), [ctxKey]);
  const setFoodCap = useCallback((fn: (v: boolean) => boolean) => paceActions.setFoodCap(fn(foodCap)), [foodCap]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>(() => buildAudit([], ctx));
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [aiBusy, setAiBusy] = useState(0);
  const [sim, setSim] = useState<{ verdict: ImpulseVerdict; coach: string | null; ai: "pending" | "gemma" | "engine" } | null>(null);
  const [custom, setCustom] = useState("");
  const simReq = useRef(0);
  const lastSim = useRef<{ amount: number; label: string } | null>(null);

  // ── Derived numbers (all deterministic) ─────────────────
  const extra = pausedMonthlyOf(pausedIds) + (foodCap ? FOOD_CAP_MONTHLY : 0);
  const baseline = useMemo(() => fundingForecast(0, undefined, ctx), [ctx]);
  const forecast = useMemo(() => fundingForecast(extra, undefined, ctx), [extra, ctx]);
  const idleActive = IDLE_PAIR.every((id) => pausedIds.includes(id));
  const idleMonthly = pausedMonthlyOf(IDLE_PAIR);
  // Lever impact = effect of adding the lever on top of everything else currently on
  const leverA = useMemo(
    () => leverImpact(extra - pausedMonthlyOf(IDLE_PAIR.filter((id) => pausedIds.includes(id))), idleMonthly, ctx),
    [extra, idleMonthly, pausedIds, ctx]
  );
  const leverB = useMemo(
    () => leverImpact(extra - (foodCap ? FOOD_CAP_MONTHLY : 0), FOOD_CAP_MONTHLY, ctx),
    [extra, foodCap, ctx]
  );
  const saved = goal.saved + ctx.saved_extra;
  const progress = Math.min(100, Math.round((saved / goal.target) * 100));
  const activePlans = pace.purchases
    .map((p) => ({ p, left: remainingPayments(p) }))
    .filter((x) => x.left.length > 0 || x.p.date === todayISO());
  const soonerTotal = Math.max(0, baseline.funded_in_days - forecast.funded_in_days);

  // ── Background AI calls ─────────────────────────────────
  const callAgent = useCallback(async <T,>(body: object): Promise<T | null> => {
    setAiBusy((n) => n + 1);
    try {
      const r = await fetch("/api/agent/arbitrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    } finally {
      setAiBusy((n) => n - 1);
    }
  }, []);

  // AI Value Audit — notes don't depend on pause state; refetch only when
  // real-world facts (contributions / plans owed) change the forecast.
  useEffect(() => {
    callAgent<{ rows: AuditRow[]; telemetry: Telemetry }>({ op: "audit", pausedIds: [], ctx }).then((res) => {
      if (!res) return setAuditRows(buildAudit([], ctx));
      setAuditRows(res.rows);
      setTelemetry(res.telemetry);
    });
  }, [callAgent, ctx]);

  const runSimulation = useCallback(
    (amount: number, label: string) => {
      if (!(amount > 0)) return;
      lastSim.current = { amount, label };
      const id = ++simReq.current;
      // 1) Instant engine verdict
      setSim({ verdict: simulateImpulse(amount, label, pausedIds, foodCap, ctx), coach: null, ai: "pending" });
      // 2) Gemma upgrade in the background
      callAgent<{ verdict: ImpulseVerdict; coach_note: string | null; telemetry: Telemetry }>({
        op: "simulate", amount, label, pausedIds, foodCap, ctx,
      }).then((res) => {
        if (id !== simReq.current) return; // stale
        if (!res) {
          setSim((s) => (s ? { ...s, ai: "engine" } : s));
          return;
        }
        setTelemetry(res.telemetry);
        setSim({ verdict: res.verdict, coach: res.coach_note, ai: res.telemetry.engine === "gemma" ? "gemma" : "engine" });
      });
    },
    [pausedIds, foodCap, callAgent, ctx]
  );

  // Re-run the active simulation when levers / shared facts change the cash-flow picture
  useEffect(() => {
    if (lastSim.current) runSimulation(lastSim.current.amount, lastSim.current.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausedIds, foodCap, ctx]);

  // ── Actions (write to the shared store) ─────────────────
  // Stable identity (grid column defs depend on it): read the latest state at call time.
  const toggleSub = useCallback((id: string, paused: boolean) => paceActions.togglePaused(id, paused), []);
  const toggleIdlePair = useCallback(() => {
    if (IDLE_PAIR.every((id) => pausedIds.includes(id))) paceActions.removePaused(IDLE_PAIR);
    else paceActions.addPaused(IDLE_PAIR);
  }, [pausedIds]);
  const hibernateIdle = useCallback(() => paceActions.addPaused(IDLE_PAIR), []);

  // ── Grid ────────────────────────────────────────────────
  const rowData: GridRow[] = useMemo(
    () =>
      auditRows.map((r) => {
        const paused = pausedIds.includes(r.id);
        if (!paused) return { ...r, paused };
        const o = resumeOutlook(r.monthly, extra, ctx);
        return { ...r, paused, resume: { ...o, ...resumeLabel(o) } };
      }),
    [auditRows, pausedIds, extra, ctx]
  );
  const pinned: GridRow[] = useMemo(
    () => [
      {
        ...auditRows[0],
        id: "__pinned",
        name: `Unlocked (${pausedIds.length} paused${foodCap ? " + food cap" : ""})`,
        category: "",
        monthly: extra,
        usage_label: "",
        cost_per_use: null,
        pinned: true,
        // AG Grid only redraws a cell when its field value changes, so the
        // footer text must live in the column's own field ("note").
        note: `${goal.name} fully funded ${formatDate(forecast.funded_date)} · ${forecast.days_ahead.toFixed(1)} days ahead of deadline${soonerTotal > 0 ? ` (${soonerTotal.toFixed(1)} days sooner)` : ""}`,
      },
    ],
    [auditRows, pausedIds.length, foodCap, extra, forecast, soonerTotal, goal.name]
  );

  const columnDefs: ColDef<GridRow>[] = useMemo(
    () => [
      {
        headerName: "Service",
        field: "name",
        flex: 1.4,
        minWidth: 150,
        cellRenderer: (p: ICellRendererParams<GridRow>) =>
          p.data?.pinned ? (
            <b style={{ color: "#34D399" }}>{p.value}</b>
          ) : (
            <div style={{ lineHeight: 1.3, paddingTop: 6 }}>
              <div style={{ fontWeight: 600 }}>{p.value}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{p.data?.category}</div>
            </div>
          ),
      },
      {
        headerName: "$/mo",
        field: "monthly",
        width: 110,
        valueFormatter: (p) => (p.data?.pinned ? `+$${Number(p.value).toFixed(2)}` : `$${Number(p.value).toFixed(2)}`),
      },
      { headerName: "Usage", field: "usage_label", flex: 1, minWidth: 130 },
      {
        headerName: "Value / use",
        field: "cost_per_use",
        width: 120,
        valueFormatter: (p) =>
          p.data?.pinned ? "" : p.value === null ? "∞ (idle)" : `$${Number(p.value).toFixed(2)}/${p.data?.unit}`,
      },
      {
        headerName: "AI Value Audit",
        field: "note",
        flex: 3,
        minWidth: 260,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (p: ICellRendererParams<GridRow>) =>
          p.data?.pinned ? (
            <span style={{ color: "#34D399", fontWeight: 600 }}>{p.value}</span>
          ) : (
            <span style={{ lineHeight: 1.45, display: "block", padding: "6px 0" }}>
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, marginRight: 6,
                  background: p.data?.verdict === "protect" ? "rgba(16,185,129,.2)" : "rgba(245,158,11,.2)",
                  color: p.data?.verdict === "protect" ? "#34D399" : "#FBBF24",
                }}
              >
                {p.data?.verdict === "protect" ? "PROTECT" : p.data?.verdict === "idle" ? "IDLE" : p.data?.verdict === "freeze" ? "FREEZE" : "BUFFER"}
              </span>
              {p.value}
              <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 6 }}>
                {p.data?.note_source === "gemma" ? "🧠 Gemma" : "🧮 engine"}
              </span>
            </span>
          ),
      },
      {
        headerName: "Status",
        field: "paused",
        width: 150,
        // Include the wake-up label so AG Grid redraws the cell when it changes
        valueGetter: (p) => (p.data ? `${p.data.paused}|${p.data.resume?.label ?? ""}` : ""),
        tooltipValueGetter: (p) => p.data?.resume?.tip ?? "",
        cellRenderer: (p: ICellRendererParams<GridRow>) => {
          if (!p.data || p.data.pinned) return null;
          const d = p.data;
          if (isProtectedSub(d.id))
            return (
              <span
                data-testid={`arb-locked-${d.id}`}
                title="Protected dev tool — never paused by any plan or AI suggestion"
                style={{ fontSize: 12, fontWeight: 700, color: "#34D399", cursor: "not-allowed" }}
              >
                🔒 Protected
              </span>
            );
          return (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!d.paused}
                onChange={(e) => toggleSub(d.id, e.target.checked)}
                data-testid={`arb-toggle-${d.id}`}
                style={{ accentColor: "#0070BA", width: 16, height: 16 }}
              />
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                <span style={{ fontSize: 12, color: d.paused ? "#93C5FD" : "#9CA3AF" }}>{d.paused ? "Paused" : "Active"}</span>
                {d.resume && (
                  <span
                    data-testid={`arb-resume-${d.id}`}
                    style={{ fontSize: 10, color: d.resume.kind === "hold" ? "#FBBF24" : "#34D399" }}
                  >
                    ⏰ {d.resume.label}
                  </span>
                )}
              </span>
            </label>
          );
        },
      },
    ],
    [toggleSub]
  );

  // ── Render ──────────────────────────────────────────────
  const tele =
    aiBusy > 0
      ? { text: "⏳ Gemma 2B reasoning on-device…", tone: "#93C5FD" }
      : telemetry?.engine === "gemma"
      ? { text: `🧠 Gemma 2B (On-Device Edge) · ${telemetry.latency_ms}ms · 🔒 0 Cloud Calls`, tone: "#34D399" }
      : telemetry
      ? { text: "⚡ Deterministic engine (local model offline) · 🔒 0 Cloud Calls", tone: "#FBBF24" }
      : { text: "🔒 0 Cloud Calls · local only", tone: "#9CA3AF" };

  return (
    <section className="card p-5 mb-8" id="milestone-arbitrage">
      {/* Header + telemetry strip */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,112,186,.1)" }}>
            <Zap className="w-5 h-5" style={{ color: "var(--accent-text)" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Milestone Arbitrage &amp; Impulse Shock-Absorber</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Turn idle spend into trip days — and test any impulse buy before it hits your goal
            </p>
          </div>
        </div>
        <div
          id="arb-telemetry"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold"
          style={{ background: "#0B1F3A", color: tele.tone }}
        >
          <Cpu className="w-3.5 h-3.5" />
          {tele.text}
          {telemetry && telemetry.firewall.checked > 0 && (
            <span style={{ color: "#9CA3AF", fontWeight: 500 }}>
              · 🛡️ {telemetry.firewall.checked - telemetry.firewall.corrected}/{telemetry.firewall.checked} verified
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        {/* ── LEFT: Fast-forward levers + Japan goal ─────── */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Milestone Fast-Forward Levers
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            {[
              {
                id: "lever-freeze",
                active: idleActive,
                onClick: toggleIdlePair,
                icon: Snowflake,
                title: "⚡ Freeze 2 Idle Subs",
                unlock: `+${formatCurrency(leverA.monthly)}/mo`,
                feedback: `Pulls ${goal.name} ${leverA.days_sooner.toFixed(1)} days sooner · ${formatCurrency(leverA.yearly)}/yr back`,
              },
              {
                id: "lever-food",
                active: foodCap,
                onClick: () => setFoodCap((v) => !v),
                icon: Utensils,
                title: "🍱 Cap Food Delivery to 2x/mo",
                unlock: `+${formatCurrency(FOOD_CAP_MONTHLY)}/mo margin`,
                feedback: `Fully funded by ${formatDate(leverB.forecast.funded_date)} with zero debt`,
              },
            ].map((l) => (
              <button
                key={l.id}
                id={l.id}
                onClick={l.onClick}
                className="text-left p-3 rounded-xl transition-all hover:scale-[1.01]"
                style={{
                  background: l.active ? "rgba(16,185,129,.08)" : "var(--bg-primary)",
                  border: `2px solid ${l.active ? "#10B981" : "var(--border-default)"}`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">{l.title}</span>
                  {l.active && <span className="text-[10px] font-bold" style={{ color: "#10B981" }}>ON</span>}
                </div>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--success)" }}>{l.unlock}</div>
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{l.feedback}</div>
              </button>
            ))}
          </div>

          {/* Japan Autumn Trip goal card */}
          <div
            id="arb-goal-card"
            className="p-4 rounded-xl"
            style={{ background: "linear-gradient(135deg, rgba(16,185,129,.06), rgba(0,112,186,.05))", border: "1px solid rgba(16,185,129,.2)" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}>
                <Plane className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">🎯 {goal.name}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {formatCurrency(saved)} / {formatCurrency(goal.target)} · deadline {formatDate(goal.target_date)}
                  {ctx.saved_extra > 0 && (
                    <span style={{ color: "var(--success)" }}> · +{formatCurrency(ctx.saved_extra)} via PayPal</span>
                  )}
                </div>
              </div>
              <span
                id="arb-goal-status"
                className="text-[11px] font-bold px-2 py-1 rounded-full"
                style={
                  forecast.delay_days > 0
                    ? { background: "var(--warning-bg)", color: "var(--warning-text)" }
                    : { background: "var(--success-bg)", color: "var(--success-text)" }
                }
              >
                {forecast.delay_days > 0 ? `+${forecast.delay_days} days late` : `${forecast.days_ahead.toFixed(1)} days ahead`}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--border-default)" }}>
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#10B981,#059669)" }} />
            </div>
            <div className="flex flex-wrap justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span>{progress}% funded · saving {formatCurrency(forecast.daily_rate)}/day</span>
              <span>
                Fully funded <b style={{ color: "var(--text-primary)" }}>{formatDate(forecast.funded_date)}</b>
                {soonerTotal > 0 && <span style={{ color: "var(--success)" }}> (−{soonerTotal.toFixed(1)} days)</span>}
              </span>
            </div>

            {/* Real PayPal plans captured in the store — they shape this forecast */}
            {activePlans.length > 0 && (
              <div id="arb-active-plans" className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px dashed var(--border-default)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Active PayPal plans in this forecast
                </div>
                {activePlans.map(({ p, left }) => {
                  const next = left[0];
                  return (
                    <div key={p.order_id} className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span style={{ color: "var(--text-primary)" }}>
                        💻 <b>{p.product.split("(")[0].trim()}</b> ·{" "}
                        {p.plan === "pay_in_4" ? "Pay in 4" : p.plan === "outright" ? "Paid in full" : `Pay Monthly ×${p.count}`} ·{" "}
                        {FUNDING_LABEL[p.funding] ?? p.funding}
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {next
                          ? `${left.length} payment${left.length > 1 ? "s" : ""} left · next ${formatCurrency(next.amount)} ${
                              next.day === 0 ? "today" : formatDate(addDaysToDate(todayISO(), next.day))
                            }`
                          : "settled"}{" "}
                        · <span className="font-mono">{p.order_id}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Impulse shock-absorber ─────────────── */}
        <div id="impulse-dock" className="p-4 rounded-xl" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
            <span className="text-sm font-bold">🔍 Simulate Discretionary Purchase</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                data-testid={`chip-${c.amount}`}
                onClick={() => runSimulation(c.amount, c.label)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-[1.03]"
                style={{
                  background: sim?.verdict.label === c.label ? "var(--paypal-blue)" : "var(--bg-surface)",
                  color: sim?.verdict.label === c.label ? "white" : "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {c.emoji} ${c.amount} {c.label}
              </button>
            ))}
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                runSimulation(Number(custom), "Custom purchase");
              }}
            >
              <input
                type="number"
                min={1}
                step="0.01"
                inputMode="decimal"
                placeholder="$ Amount"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                data-testid="impulse-custom"
                className="w-24 px-2 py-1.5 rounded-full text-xs"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              />
              <button type="submit" className="px-2.5 py-1.5 rounded-full text-xs font-semibold text-white" style={{ background: "var(--paypal-navy)" }}>
                Go
              </button>
            </form>
          </div>

          {!sim ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              Pick a chip or enter an amount — you&apos;ll get an instant verdict, then Gemma 2B&apos;s on-device read.
            </p>
          ) : (
            <div id="impulse-verdict" className="space-y-2">
              {[
                {
                  k: "Feasibility Score",
                  v: `${sim.verdict.feasibility}% Feasible via ${sim.verdict.plan_label}`,
                  c: sim.verdict.feasibility >= 75 ? "var(--success)" : sim.verdict.feasibility >= 50 ? "var(--warning-text)" : "var(--danger)",
                },
                { k: "Pacing Structure", v: sim.verdict.structure, c: "var(--brand-text)" },
                { k: "Milestone Impact", v: sim.verdict.impact, c: "var(--text-primary)" },
              ].map((row) => (
                <div key={row.k} className="p-2.5 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{row.k}</div>
                  <div className="text-sm font-semibold" style={{ color: row.c }}>{row.v}</div>
                </div>
              ))}
              <div className="flex items-start gap-2 text-xs pt-1" style={{ color: "var(--text-secondary)" }}>
                {sim.ai === "pending" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mt-0.5" /> Engine verdict shown · Gemma 2B refining on-device…
                  </>
                ) : sim.ai === "gemma" ? (
                  <>
                    <span>🧠</span>
                    <span>{sim.coach ?? "Gemma confirmed the engine's verdict."}</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span> Local model unavailable — deterministic verdict.
                  </>
                )}
              </div>
              {sim.verdict.extra_pause_ids.length > 0 && sim.verdict.delay_now > 0 && sim.verdict.delay_with_extra === 0 && (
                <button
                  onClick={() => paceActions.addPaused(sim.verdict.extra_pause_ids, "Impulse simulator")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                  style={{ background: "#10B981" }}
                >
                  <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
                  Apply: pause {sim.verdict.extra_pause_names.join(" + ")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Feature 1: Value-per-use audit grid ─────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-bold">Subscription Value-per-Use Audit</div>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Toggle any service — the pinned footer re-forecasts {goal.name} instantly
          </div>
        </div>
        <button
          id="hibernate-idle"
          onClick={hibernateIdle}
          disabled={idleActive}
          className="px-3 py-2 rounded-lg text-xs font-bold text-white transition-all"
          style={{ background: idleActive ? "#10B981" : "linear-gradient(135deg,#003087,#0070BA)", opacity: idleActive ? 0.85 : 1 }}
        >
          {idleActive ? "✓ 2 Idle Subs Hibernated" : `⚡ Hibernate 2 Idle Subs (+${formatCurrency(idleMonthly)}/mo)`}
        </button>
      </div>
      <div className="ag-theme-quartz-dark pace-grid" style={{ width: "100%" }}>
        <AgGridReact<GridRow>
          theme="legacy"
          rowData={rowData}
          pinnedBottomRowData={pinned}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          domLayout="autoHeight"
          suppressMovableColumns
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <p className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Lock className="w-3 h-3" /> All figures computed by the on-device Pace solver; Gemma 2B narrates them behind a numeric firewall.
          Changes here sync to checkout.
        </p>
        {(pausedIds.length > 0 || foodCap || pace.purchases.length > 0 || pace.contributions.length > 0) && (
          <ResetButton />
        )}
      </div>
    </section>
  );
}

/** Two-step reset for demo retakes (clears hibernations, levers, recorded captures). */
function ResetButton() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      id="pace-reset"
      onClick={() => (armed ? (paceActions.reset(), setArmed(false)) : setArmed(true))}
      className="text-[10px] font-semibold px-2 py-1 rounded-md"
      style={{
        color: armed ? "white" : "var(--text-muted)",
        background: armed ? "var(--danger)" : "transparent",
        border: "1px solid var(--border-default)",
      }}
    >
      {armed ? "Click again to reset demo state" : "↺ Reset demo state"}
    </button>
  );
}
