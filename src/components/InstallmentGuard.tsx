// src/components/InstallmentGuard.tsx
"use client";

// ============================================================
// Next-Installment Guard — the co-pilot keeps working after checkout
// ============================================================
// For every PayPal plan captured in the store (pace-store), shows the
// next installment, whether the projected surplus between now and its
// due date covers it, and the goal slippage across ALL remaining
// payments (same fundingForecast the dashboard card uses). If cash is
// short or the goal would slip, it proposes the smallest set of
// subscriptions to hibernate (Cloud Tier is protected, never offered)
// and applies it in one click through the shared store.
// ============================================================

import { useMemo } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { usePaceState, paceActions, todayISO } from "@/lib/pace-store";
import { guardRows, PLAN_NAME } from "@/lib/installment-guard";
import { FUNDING_LABEL } from "@/lib/paypal-sdk";
import { formatCurrency, formatDate, addDaysToDate } from "@/lib/math-engine";

export default function InstallmentGuard() {
  const pace = usePaceState();

  const rows = useMemo(() => guardRows(pace), [pace]);

  if (!rows.length) return null;

  return (
    <div className="card p-4 mb-6" id="installment-guard">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4" style={{ color: "var(--success)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Next-Installment Guard
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          checks every upcoming PayPal payment against your projected surplus and the Japan goal
        </span>
      </div>
      <div className="space-y-2">
        {rows.map(({ p, next, accrued, shortBy, slip, ok, fix }) => (
          <div
            key={p.order_id}
            data-testid={`guard-${p.order_id}`}
            className="p-3 rounded-lg text-xs"
            style={{
              background: ok ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.08)",
              border: `1px solid ${ok ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.35)"}`,
            }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {ok ? (
                <ShieldCheck className="w-4 h-4" style={{ color: "var(--success)" }} />
              ) : (
                <ShieldAlert className="w-4 h-4" style={{ color: "var(--warning-text)" }} />
              )}
              <b style={{ color: "var(--text-primary)" }}>
                {PLAN_NAME[p.plan]} Payment #{next.n} of {next.total}: {formatCurrency(next.amount)}
              </b>
              <span style={{ color: "var(--text-secondary)" }}>
                due {next.day === 0 ? "today" : `in ${next.day} day${next.day === 1 ? "" : "s"}`} (
                {formatDate(addDaysToDate(todayISO(), next.day))})
              </span>
              <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                {p.product.split("(")[0].trim()} · {FUNDING_LABEL[p.funding] ?? p.funding}
              </span>
            </div>
            <div className="mt-1" style={{ color: ok ? "var(--success-text)" : "var(--warning-text)" }} data-testid="guard-verdict">
              {ok
                ? `Projected surplus by then (${formatCurrency(accrued)}) covers this payment with 0 days goal slippage ✅`
                : [
                    shortBy > 0 ? `Projected surplus by then (${formatCurrency(accrued)}) is short by ${formatCurrency(shortBy)}` : null,
                    slip > 0 ? `the Japan goal slips ${slip} day${slip === 1 ? "" : "s"} across your remaining payments` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") + " ⚠️"}
            </div>
            {!ok && fix && (
              <button
                type="button"
                className="mt-2 px-2.5 py-1 rounded-md text-[11px] font-semibold"
                style={{ background: "var(--paypal-blue)", color: "white" }}
                onClick={() => paceActions.addPaused(fix.ids, "Installment Guard")}
                data-testid={`guard-fix-${p.order_id}`}
              >
                Shield it: hibernate {fix.names.join(" + ")} (+{formatCurrency(fix.monthly)}/mo)
              </button>
            )}
            {!ok && !fix && (
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                No pausable subscription closes the gap on its own (Cloud Tier stays protected) — consider a goal contribution.
              </div>
            )}
            <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {next.left} payment{next.left === 1 ? "" : "s"} left · order <span className="font-mono">{p.order_id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
