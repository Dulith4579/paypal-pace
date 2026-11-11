// src/components/ExpenseRebalanceGrid.tsx
"use client";

import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { ColDef, GridReadyEvent, ICellRendererParams } from "ag-grid-community";
import { isProtectedSub, type GoalProjection } from "@/lib/strategy-solver";

// AG Grid v33+ requires explicit module registration (filters, pinned rows, etc.)
ModuleRegistry.registerModules([AllCommunityModule]);

const PINNED_ID = "__unlocked_total";
import {
  calculatePacing,
  type ExpenseItem,
  type SavingsMilestone,
  type PaceIntelligence,
} from "@/lib/pacing";
import {
  Target,
  Calendar,
  TrendingUp,
  Zap,
  ArrowRight,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/math-engine";

/**
 * AG Grid component displaying a list of expense items with interactive
 * pause toggles. When expenses are toggled, the live summary footer,
 * milestone date badges, and pacing calculations update immediately.
 */

interface ExpenseRebalanceGridProps {
  expenseItems: ExpenseItem[];
  savingsMilestones: SavingsMilestone[];
  purchaseAmount: number;
  productName?: string;
  onPacingUpdate: (summary: ReturnType<typeof calculatePacing> | null) => void;
  onExpenseToggle?: (items: ExpenseItem[]) => void;
  /** Solver-based goal projection from the parent; overrides the legacy pacing estimate. */
  projection?: GoalProjection;
}

export default function ExpenseRebalanceGrid({
  expenseItems: initialItems,
  savingsMilestones,
  purchaseAmount,
  productName,
  onPacingUpdate,
  onExpenseToggle,
  projection,
}: ExpenseRebalanceGridProps) {
  const [localItems, setLocalItems] = useState<ExpenseItem[]>(initialItems);

  // Parent → grid sync: selecting a strategy card re-applies its pre-pauses.
  useEffect(() => {
    setLocalItems(initialItems);
  }, [initialItems]);
  const [intelligence, setIntelligence] = useState<PaceIntelligence | null>(null);
  const [showAdaptedPill, setShowAdaptedPill] = useState(false);
  const adaptedTimer = useRef<NodeJS.Timeout | null>(null);



  // Recalculate pacing whenever relevant inputs change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (purchaseAmount > 0) {
      const summary = calculatePacing(
        purchaseAmount,
        localItems,
        savingsMilestones,
        productName
      );
      // Update intelligence only if it has actually changed to avoid re‑render loops
      if (
        intelligence?.confidence_score !== summary.intelligence.confidence_score ||
        intelligence?.classification?.label !== summary.intelligence.classification?.label
      ) {
        setIntelligence(summary.intelligence);
      }
      onPacingUpdate(summary);
    }
  }, [purchaseAmount, localItems, savingsMilestones, productName]);

  const handleToggle = useCallback(
    (expenseId: string, paused: boolean) => {
      if (isProtectedSub(expenseId)) return; // Cloud Tier is never paused
      const updated = localItems.map((exp) =>
        exp.expense_id === expenseId ? { ...exp, paused } : exp
      );
      setLocalItems(updated);
      onExpenseToggle?.(updated);

      // Show "Plan Adapted" pill
      setShowAdaptedPill(true);
      if (adaptedTimer.current) clearTimeout(adaptedTimer.current);
      adaptedTimer.current = setTimeout(() => setShowAdaptedPill(false), 3000);
    },
    [localItems, onExpenseToggle]
  );

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  // Column definitions with a custom cell renderer for the pause toggle
  const columnDefs: ColDef<ExpenseItem>[] = useMemo(
    () => [
      { headerName: "Name", field: "name", flex: 2 },
      {
        headerName: "Amount ($)",
        field: "amount",
        flex: 1,
        valueFormatter: (p) =>
          p.node?.rowPinned ? `+$${Number(p.value).toFixed(2)}/mo` : `$${Number(p.value).toFixed(2)}`,
      },
      { headerName: "Category · Why pause", field: "description", flex: 2.6, tooltipField: "description" },
      {
        field: "paused",
        headerName: "Status",
        flex: 1.2,
        filter: false,
        cellRenderer: (params: ICellRendererParams<ExpenseItem>) => {
          if (params.node.rowPinned) {
            return (
              <span style={{ fontWeight: 700, color: "#34D399" }}>💚 Total</span>
            );
          }
          if (!params.data) return null;
          const data = params.data;
          if (isProtectedSub(data.expense_id))
            return (
              <span
                data-testid={`locked-${data.expense_id}`}
                title="Protected dev tool — never paused by any plan or AI suggestion"
                style={{ fontSize: 12, fontWeight: 700, color: "#34D399", cursor: "not-allowed" }}
              >
                🔒 Protected
              </span>
            );
          return (
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!params.value}
                onChange={(e) => handleToggle(data.expense_id, e.target.checked)}
                data-testid={`toggle-pause-${data.expense_id}`}
                className="sr-only peer"
              />
              <div
                className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                style={{
                  background: params.value ? "#0070BA" : "#4B5563",
                }}
              />
            </label>
          );
        },
      },
    ],
    [handleToggle]
  );

  const defaultColDef: ColDef = useMemo(
    () => ({ sortable: true, filter: true, resizable: true }),
    []
  );

  // Summary calculations
  const totalExpense = useMemo(
    () => localItems.reduce((sum, e) => sum + e.amount, 0),
    [localItems]
  );
  const pausedCount = useMemo(
    () => localItems.filter((e) => e.paused).length,
    [localItems]
  );
  const pausedTotal = useMemo(
    () =>
      localItems
        .filter((e) => e.paused)
        .reduce((sum, e) => sum + e.amount, 0),
    [localItems]
  );
  const pinnedBottomRowData = useMemo<ExpenseItem[]>(
    () => [
      {
        expense_id: PINNED_ID,
        name: `Unlocked cash flow (${pausedCount} paused)`,
        amount: pausedTotal,
        description: `+$${(pausedTotal / 30).toFixed(2)}/day → goal`,
        paused: false,
      },
    ],
    [pausedCount, pausedTotal]
  );

  const dailyContribution = useMemo(
    () => (pausedTotal / 30).toFixed(2),
    [pausedTotal]
  );

  // Prefer the parent's solver projection (same math as the strategy cards)
  const status = projection
    ? {
        goal: projection.goal_name,
        date: projection.projected_date,
        withPace: projection.delay_days,
        withoutPace: projection.unmitigated_delay_days,
      }
    : intelligence?.milestone_snapshot
    ? {
        goal: intelligence.milestone_snapshot.goal_name,
        date: intelligence.milestone_snapshot.with_pace_target_date,
        withPace: intelligence.with_pace_delay_days,
        withoutPace: intelligence.without_pace_delay_days,
      }
    : null;

  return (
    <div className="card p-5" id="grid-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className="text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Expense Re‑balance Table
          </h3>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Toggle expenses to see live impact on your savings pace
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Adapted Pill */}
          {showAdaptedPill && (
            <span
              className="badge badge-success animate-slide-in-down"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Zap className="w-3 h-3" /> Plan Adapted
            </span>
          )}
          <span className="badge badge-info">AG Grid</span>
        </div>
      </div>

      {/* Milestone Date Badges */}
      {status && purchaseAmount > 0 && (
        <div
          className="mb-4 p-3 rounded-xl animate-fade-in"
          style={{
            background:
              "linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.15)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4" style={{ color: "var(--success)" }} />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--success)" }}
            >
              Milestone Protection Status
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
              }}
            >
              <Calendar
                className="w-3.5 h-3.5"
                style={{ color: "var(--accent-text)" }}
              />
              <span className="text-sm font-semibold">
                🎯 {status.goal}: {formatDate(status.date)}
              </span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background:
                    status.withPace === 0
                      ? "var(--success-bg)"
                      : "var(--warning-bg)",
                  color:
                    status.withPace === 0
                      ? "var(--success-text)"
                      : "var(--warning-text)",
                }}
              >
                {status.withPace === 0
                  ? "0 Days Delayed ✅"
                  : `${status.withPace} Day${status.withPace !== 1 ? "s" : ""} Delayed`}
              </span>
            </div>
            {status.withoutPace > 0 && (
              <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                <span style={{ textDecoration: "line-through", color: "var(--danger)" }}>
                  Without Pace: +{status.withoutPace} days
                </span>
                <ArrowRight className="w-3 h-3" />
                <span style={{ color: "var(--success)", fontWeight: 600 }}>
                  With Pace: +{status.withPace} days
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AG Grid */}
      <div className="ag-theme-quartz-dark pace-grid" style={{ width: "100%", minHeight: 200 }}>
        <AgGridReact<ExpenseItem> theme="legacy"
          rowData={localItems}
          getRowId={(p) => p.data.expense_id}
          pinnedBottomRowData={pinnedBottomRowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          domLayout="autoHeight"
          onGridReady={onGridReady}
        />
      </div>

      {/* Live Summary Footer */}
      <div
        className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3"
        id="grid-summary"
      >
        {[
          {
            label: "Total Expenses",
            value: `$${totalExpense.toFixed(2)}`,
            color: "var(--text-primary)",
          },
          {
            label: "Paused Items",
            value: String(pausedCount),
            color: "var(--warning)",
          },
          {
            label: "Paused Total",
            value: `$${pausedTotal.toFixed(2)}`,
            color: "var(--danger)",
          },
          {
            label: "Net Monthly Savings",
            value: `$${pausedTotal.toFixed(2)}`,
            color: "var(--success)",
          },
          {
            label: "Daily Rate",
            value: `$${dailyContribution}/day`,
            color: "var(--accent-text)",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="p-3 rounded-lg text-center"
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              className="text-lg font-bold"
              style={{ color: s.color }}
              data-testid={`summary-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {s.value}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
