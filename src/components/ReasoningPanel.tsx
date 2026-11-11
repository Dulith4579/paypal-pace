// src/components/ReasoningPanel.tsx
"use client";

// ============================================================
// Glass-box reasoning — "why did the AI recommend this?"
// ============================================================
// Shows the whole neuro-symbolic pipeline for one checkout:
//   1. every plan × pause combination the solver simulated, with the
//      score broken into its weighted parts (AG Grid + custom renderer)
//   2. the guardrail decision on Gemma's pick
//   3. the numeric/semantic firewall log, incl. Gemma's original text
//      when it was rejected
// ============================================================

import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { ColDef, ICellRendererParams, RowClassParams } from "ag-grid-community";
import { ChevronDown, ChevronRight, Microscope, FlaskConical, Loader2, Download } from "lucide-react";
import type { PaceContext } from "@/lib/strategy-solver";
import { paceActions } from "@/lib/pace-store";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface ReasoningCandidate {
  rank: number;
  key: string;
  plan_label: string;
  emoji: string;
  pauses: string[];
  new_pauses: string[];
  delay_days: number;
  interest: number;
  paused_monthly: number;
  score: number;
  parts: { delay_cost: number; interest_cost: number; pain: number; recovered_bonus: number };
  shown_as?: "A" | "B" | "C";
}

export interface Reasoning {
  mode: string;
  weights: { perDelayDay: number; perInterestDollar: number; perRecoveredDollar: number };
  context: { already_paused: string[]; saved_extra: number; prior_payment_total: number; remaining: number; days_left: number };
  candidates: ReasoningCandidate[];
  firewall: {
    option: "A" | "B" | "C";
    key: string;
    status: "verified" | "corrected" | "missing" | "engine";
    gemma_title?: string;
    gemma_text?: string;
    reasons: string[];
    solver_facts?: string;
    replacement_text?: string;
  }[];
  guardrail: {
    gemma_pick?: string;
    final_pick: "A" | "B" | "C";
    by: "gemma" | "solver" | "solver_guardrail";
    reason: string;
    gap?: number;
    threshold?: number;
  };
}

const PART_COLORS = {
  delay_cost: "#F87171",
  interest_cost: "#FBBF24",
  pain: "#A78BFA",
  recovered_bonus: "#34D399",
};

/** Diverging bar: costs grow right of the axis, the pause bonus grows left. */
function ScoreBar({ parts, max }: { parts: ReasoningCandidate["parts"]; max: number }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const seg = (v: number, c: string, title: string) =>
    v > 0 ? <div title={`${title}: ${v.toFixed(1)}`} style={{ width: pct(v), background: c, height: 10 }} /> : null;
  return (
    <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 0 }}>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
        {seg(parts.recovered_bonus, PART_COLORS.recovered_bonus, "Recovered-cash bonus (−)")}
      </div>
      <div style={{ width: 1, height: 18, background: "#64748B" }} />
      <div style={{ flex: 2, display: "flex" }}>
        {seg(parts.delay_cost, PART_COLORS.delay_cost, "Goal-delay cost")}
        {seg(parts.interest_cost, PART_COLORS.interest_cost, "Interest cost")}
        {seg(parts.pain, PART_COLORS.pain, "Lifestyle pain")}
      </div>
    </div>
  );
}

/** "12.0 delay + 32.2 interest + 2 pain − 39.0 bonus = 7.2" — used by tooltips and the CSV decision log. */
function scoreFormula(c: ReasoningCandidate): string {
  const p = c.parts;
  return `${p.delay_cost.toFixed(1)} delay + ${p.interest_cost.toFixed(1)} interest + ${p.pain.toFixed(1)} pain − ${p.recovered_bonus.toFixed(1)} bonus = ${c.score.toFixed(1)}`;
}

const MODE_LABEL: Record<string, string> = {
  career_growth: "Career Growth",
  balanced: "Balanced",
  goal_shielding: "Goal Shield",
};

/** Inputs the "Inject Hallucination" demo needs to re-run the solver server-side. */
export interface InjectionDemo {
  price: number;
  product: string;
  context: PaceContext;
}

interface InjectionResult {
  kind: "delay" | "protected";
  key: string;
  mode: string;
  option: string;
  injected_claim: string;
  injected_text: string;
  caught: boolean;
  reasons: string[];
  solver_facts: string;
  replacement_text: string;
}

export default function ReasoningPanel({
  reasoning,
  gemmaOnline,
  demo,
}: {
  reasoning: Reasoning;
  gemmaOnline: boolean;
  demo?: InjectionDemo;
}) {
  const [open, setOpen] = useState(false);
  const [rawInjection, setInjection] = useState<InjectionResult | null>(null);
  // Only show an injection that belongs to the plans currently on screen (mode switches reset it)
  const injection =
    rawInjection && reasoning.mode === rawInjection.mode && reasoning.firewall.some((f) => f.key === rawInjection.key)
      ? rawInjection
      : null;
  const [injecting, setInjecting] = useState(false);
  const [injectError, setInjectError] = useState<string | null>(null);

  // Plant a hallucination in the final card's AI text and run the real firewall on it
  const inject = useCallback(
    async (kind: "delay" | "protected") => {
      if (!demo) return;
      const target = reasoning.firewall.find((f) => f.option === reasoning.guardrail.final_pick) ?? reasoning.firewall[0];
      if (!target) return;
      setInjecting(true);
      setInjectError(null);
      try {
        const res = await fetch("/api/agent/firewall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            price: demo.price,
            product: demo.product,
            mode: reasoning.mode,
            key: target.key,
            base_text: target.status === "verified" ? target.gemma_text : undefined,
            kind,
            context: demo.context,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result: InjectionResult = { ...(await res.json()), option: target.option, mode: reasoning.mode };
        setInjection(result);
        paceActions.logEvent({
          kind: "firewall",
          actor: "firewall",
          demo: true,
          title: `${result.caught ? "Firewall caught" : "Firewall MISSED"} a planted claim: ${result.injected_claim}`,
          detail: `Card ${result.option} · ${result.reasons[0] ?? ""}${result.caught ? ` · corrected to: ${result.solver_facts}` : ""}`,
        });
      } catch (e) {
        setInjectError(e instanceof Error ? e.message : String(e));
        setInjection(null);
      } finally {
        setInjecting(false);
      }
    },
    [demo, reasoning]
  );
  const gridRef = useRef<AgGridReact<ReasoningCandidate>>(null);
  // AG Grid CSV export: the full decision log (every plan scored, with its breakdown)
  const exportDecisionLog = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({
      fileName: `paypal-pace-decision-log-${reasoning.mode}.csv`,
      prependContent: [
        [{ data: { value: `PayPal Pace decision log · ${MODE_LABEL[reasoning.mode] ?? reasoning.mode} mode` } }],
        [{ data: { value: `Guardrail: ${reasoning.guardrail.reason}` } }],
        [],
      ],
    });
  }, [reasoning]);
  const { candidates, weights, guardrail, firewall, context } = reasoning;
  const finalKey = firewall.find((f) => f.option === guardrail.final_pick)?.key;
  const gemmaKey = firewall.find((f) => f.option === guardrail.gemma_pick)?.key;

  const maxPart = useMemo(
    () =>
      Math.max(
        1,
        ...candidates.map((c) => Math.max(c.parts.recovered_bonus, c.parts.delay_cost + c.parts.interest_cost + c.parts.pain))
      ),
    [candidates]
  );

  const columnDefs = useMemo<ColDef<ReasoningCandidate>[]>(
    () => [
      { headerName: "#", field: "rank", width: 50, sort: "asc" },
      {
        headerName: "Plan",
        field: "plan_label",
        width: 118,
        cellRenderer: (p: ICellRendererParams<ReasoningCandidate>) => (
          <span>
            {p.data?.emoji} {p.value}
          </span>
        ),
      },
      {
        headerName: "Pauses",
        field: "pauses",
        flex: 1,
        minWidth: 100,
        valueFormatter: (p) => {
          const d = p.data;
          if (!d || !d.pauses.length) return "—";
          const kept = d.pauses.filter((n) => !d.new_pauses.includes(n));
          return [...d.new_pauses, ...kept.map((n) => `${n} (kept)`)].join(", ");
        },
        tooltipValueGetter: (p) => p.valueFormatted ?? "",
      },
      {
        headerName: "Delay",
        field: "delay_days",
        width: 64,
        valueFormatter: (p) => (p.value ? `+${p.value}d` : "0d"),
        cellStyle: (p) => ({ color: p.value ? "#F87171" : "#34D399", fontWeight: 600 }),
      },
      { headerName: "Interest", field: "interest", width: 78, valueFormatter: (p) => `$${Number(p.value).toFixed(2)}` },
      {
        headerName: "Breakdown",
        headerTooltip: "Recovered-cash bonus grows left of the axis; delay, interest and lifestyle costs grow right",
        colId: "breakdown",
        flex: 1,
        minWidth: 104,
        sortable: false,
        // Text value: drives the hover tooltip and the CSV export (the bar is just its picture)
        valueGetter: (p) => (p.data ? scoreFormula(p.data) : ""),
        tooltipValueGetter: (p) => (p.data ? scoreFormula(p.data) : ""),
        cellRenderer: (p: ICellRendererParams<ReasoningCandidate>) =>
          p.data ? <ScoreBar parts={p.data.parts} max={maxPart} /> : null,
      },
      {
        headerName: "Score",
        field: "score",
        width: 70,
        valueFormatter: (p) => Number(p.value).toFixed(1),
        tooltipValueGetter: (p) => (p.data ? `Lower is better · ${scoreFormula(p.data)}` : ""),
        cellStyle: { fontWeight: 700 },
      },
      {
        headerName: "Card",
        headerTooltip: "Letter = shown as a card · 🧠 = Gemma's pick · ⭐ = final recommendation",
        colId: "role",
        width: 82,
        sortable: false,
        valueGetter: (p) => {
          const d = p.data;
          if (!d) return "";
          return [
            d.shown_as ?? "",
            d.key === gemmaKey && gemmaOnline ? "🧠" : "",
            d.key === finalKey ? "⭐" : "",
          ].join(" ").trim();
        },
      },
    ],
    [maxPart, gemmaKey, finalKey, gemmaOnline]
  );

  const shownCount = candidates.filter((c) => c.shown_as).length;
  const hibernated = context.already_paused.length;

  return (
    <div className="mb-3 rounded-xl" style={{ border: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
      <button
        id="glass-box-toggle"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Microscope className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
          Glass box: how this was decided
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {candidates.length} plans scored · {shownCount} shown ·{" "}
          {firewall.filter((f) => f.status === "corrected").length} AI texts corrected
        </span>
        <span className="ml-auto">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3" id="glass-box">
          {/* Objective */}
          <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <b>{MODE_LABEL[reasoning.mode] ?? reasoning.mode} objective</b> (lower is better):{" "}
            <code className="px-1 rounded" style={{ background: "var(--bg-surface)" }}>
              score = {weights.perDelayDay}·delayDays + {weights.perInterestDollar}·interest$ + lifestylePain − {weights.perRecoveredDollar}·recovered$/mo
            </code>
            <div className="mt-1" style={{ color: "var(--text-muted)" }}>
              Inputs: ${context.remaining.toFixed(2)} left to save in {context.days_left} days
              {context.saved_extra > 0 && ` · includes $${context.saved_extra.toFixed(2)} you contributed via PayPal`}
              {context.prior_payment_total > 0 && ` · $${context.prior_payment_total.toFixed(2)} still owed on earlier Pace plans`}
              {hibernated > 0 && ` · ${hibernated} subscription${hibernated > 1 ? "s" : ""} already hibernated on your dashboard`}
            </div>
          </div>

          {/* Candidate grid */}
          <div className="ag-theme-quartz-dark pace-grid" style={{ width: "100%", height: 300 }}>
            <AgGridReact<ReasoningCandidate>
              ref={gridRef}
              theme="legacy"
              rowData={candidates}
              columnDefs={columnDefs}
              getRowId={(p) => p.data.key}
              rowHeight={30}
              headerHeight={32}
              suppressMovableColumns
              tooltipShowDelay={300}
              getRowStyle={(p: RowClassParams<ReasoningCandidate>) =>
                p.data?.key === finalKey
                  ? { background: "rgba(255,196,57,0.16)" }
                  : p.data?.shown_as
                  ? { background: "rgba(0,112,186,0.18)" }
                  : undefined
              }
            />
          </div>
          <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {[
              ["Goal-delay cost", PART_COLORS.delay_cost],
              ["Interest cost", PART_COLORS.interest_cost],
              ["Lifestyle pain", PART_COLORS.pain],
              ["Recovered-cash bonus", PART_COLORS.recovered_bonus],
            ].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, background: c, display: "inline-block", borderRadius: 2 }} /> {l}
              </span>
            ))}
            <span>· Card column: letter = shown as a card, 🧠 = Gemma&apos;s pick, ⭐ = final (gold row) · hover a score for its math</span>
            <button
              type="button"
              id="glass-box-export"
              onClick={exportDecisionLog}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold"
              style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--accent-text)" }}
              title="Download every plan the solver scored, with the score math and the guardrail decision (AG Grid CSV export)"
            >
              <Download className="w-3 h-3" /> Decision log (CSV)
            </button>
          </div>

          {/* Guardrail */}
          <div
            className="p-2.5 rounded-lg text-[11px]"
            id="glass-box-guardrail"
            style={{
              background: guardrail.by === "solver_guardrail" ? "var(--warning-bg)" : "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            <b>⚖️ Guardrail:</b> {guardrail.reason}
          </div>

          {/* Firewall log */}
          <div className="space-y-1.5" id="glass-box-firewall">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-semibold" style={{ color: "var(--brand-text)" }}>
                🛡️ Firewall log — every sentence Gemma wrote, checked against the solver
              </div>
              {demo && (
                <div className="ml-auto flex items-center gap-1.5">
                  {injection && (
                    <button
                      type="button"
                      className="text-[10px] underline"
                      style={{ color: "var(--text-muted)" }}
                      onClick={() => inject(injection.kind === "delay" ? "protected" : "delay")}
                      data-testid="inject-switch-kind"
                    >
                      try: {injection.kind === "delay" ? "“pause Cloud Tier”" : "fake delay"}
                    </button>
                  )}
                  <button
                    type="button"
                    id="inject-hallucination"
                    role="switch"
                    aria-checked={!!injection}
                    disabled={injecting}
                    onClick={() => (injection ? setInjection(null) : inject("delay"))}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      border: `1px solid ${injection ? "#EF4444" : "var(--border-default)"}`,
                      background: injection ? "rgba(239,68,68,0.12)" : "var(--bg-surface)",
                      color: injection ? "#EF4444" : "var(--text-secondary)",
                    }}
                    title="Demo: plant a fake claim in the AI text and watch the real firewall catch it"
                  >
                    {injecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                    {injection ? "Hallucination injected · ON" : "Inject Hallucination"}
                  </button>
                </div>
              )}
            </div>
            {injectError && (
              <div className="text-[10px]" style={{ color: "var(--warning-text)" }}>
                Injection demo failed ({injectError}).
              </div>
            )}
            {injection && (
              <div
                className="p-2 rounded-lg text-[11px]"
                id="injected-entry"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px dashed #EF4444" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <b>🧪 Demo injection · Card {injection.option}</b>
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: injection.caught ? "var(--warning-bg)" : "var(--danger-bg)",
                      color: injection.caught ? "var(--warning-text)" : "var(--danger-text)",
                    }}
                    data-testid="injection-verdict"
                  >
                    {injection.caught ? "✗ Caught by firewall → engine text" : "⚠ NOT caught"}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>planted: {injection.injected_claim}</span>
                </div>
                <p className="mt-1 italic" style={{ color: "#EF4444", textDecoration: injection.caught ? "line-through" : undefined }}>
                  “{injection.injected_text}”
                </p>
                <ul className="mt-1 list-disc pl-4" style={{ color: "var(--text-secondary)" }}>
                  {injection.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                {injection.caught && (
                  <div className="mt-1.5 pl-2" style={{ borderLeft: "2px solid var(--success-text)" }} data-testid="injection-fix">
                    <div style={{ color: "var(--success-text)" }}>
                      <b>Corrected to solver facts:</b> {injection.solver_facts}
                    </div>
                    <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      Shown instead: “{injection.replacement_text}”
                    </p>
                  </div>
                )}
              </div>
            )}
            {firewall.map((f) => (
              <div
                key={f.option}
                className="p-2 rounded-lg text-[11px]"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              >
                <div className="flex items-center gap-2">
                  <b>Card {f.option}</b>
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background:
                        f.status === "verified" ? "var(--success-bg)" : f.status === "engine" ? "var(--bg-primary)" : "var(--warning-bg)",
                      color:
                        f.status === "verified" ? "var(--success-text)" : f.status === "engine" ? "var(--text-muted)" : "var(--warning-text)",
                    }}
                  >
                    {f.status === "verified"
                      ? "✓ Gemma text verified"
                      : f.status === "corrected"
                      ? "✗ Gemma text rejected → engine text"
                      : f.status === "missing"
                      ? "Gemma skipped → engine text"
                      : "Engine text (model offline)"}
                  </span>
                </div>
                {f.gemma_text && (
                  <p
                    className="mt-1 italic"
                    style={{
                      color: f.status === "corrected" ? "#EF4444" : "var(--text-muted)",
                      textDecoration: f.status === "corrected" ? "line-through" : undefined,
                    }}
                  >
                    “{f.gemma_title ? `${f.gemma_title}: ` : ""}
                    {f.gemma_text}”
                  </p>
                )}
                {f.reasons.length > 0 && (
                  <ul className="mt-1 list-disc pl-4" style={{ color: "var(--text-secondary)" }}>
                    {f.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {f.status === "corrected" && f.solver_facts && (
                  <div className="mt-1.5 pl-2" style={{ borderLeft: "2px solid var(--success-text)" }} data-testid={`firewall-fix-${f.option}`}>
                    <div style={{ color: "var(--success-text)" }}>
                      <b>Corrected to solver facts:</b> {f.solver_facts}
                    </div>
                    {f.replacement_text && (
                      <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        Shown instead: “{f.replacement_text}”
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
