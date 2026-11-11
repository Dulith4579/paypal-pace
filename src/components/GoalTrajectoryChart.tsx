// src/components/GoalTrajectoryChart.tsx
"use client";

// ============================================================
// Goal Trajectory — AG Charts (same vendor as AG Grid)
// ============================================================
// "0 days delay" as a picture: the Japan goal balance day by day,
// With Pace (installments absorbed by hibernated subscriptions + levers)
// vs Without Pace (pay in full, nothing paused), against the goal line
// and the deadline. Every point comes from goalTrajectory() — the same
// cash-flow model the solver and dashboard forecast use.
//   • Active PayPal plan in pace-store → your real plan vs paying the rest now
//   • No plan yet → the cart item: the solver's best plan vs paying in full
// Loaded client-only (next/dynamic, ssr:false) from the dashboard.
// ============================================================

import { useMemo } from "react";
import { AgCharts } from "ag-charts-react";
import { ModuleRegistry, AllCommunityModule, type AgCartesianChartOptions } from "ag-charts-community";
import { TrendingUp } from "lucide-react";
import { usePaceState, paceContextOf, todayISO } from "@/lib/pace-store";
import { goalTrajectory, solveStrategies, planPayments, PAUSEABLE_SUBS } from "@/lib/strategy-solver";
import { pausedMonthlyOf, FOOD_CAP_MONTHLY } from "@/lib/arbitrage";
import { userProfile } from "@/lib/mock-data";
import { formatDate, addDaysToDate } from "@/lib/math-engine";

ModuleRegistry.registerModules([AllCommunityModule]);

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function verdict(fundedDay: number | null, deadline: number): string {
  if (fundedDay === null) return "not funded in range";
  const d = deadline - fundedDay;
  return d >= 0 ? `funded ${formatDate(addDaysToDate(todayISO(), fundedDay))} (${d} days early)` : `funded ${formatDate(addDaysToDate(todayISO(), fundedDay))} (+${-d} days late)`;
}

export default function GoalTrajectoryChart() {
  const pace = usePaceState();

  const model = useMemo(() => {
    const ctx = paceContextOf(pace);
    const extra = pausedMonthlyOf(pace.pausedIds) + (pace.foodCap ? FOOD_CAP_MONTHLY : 0);
    const owed = ctx.prior_payments.reduce((a, p) => a + p.amount, 0);
    const active = pace.purchases.length > 0 && ctx.prior_payments.some((p) => p.day > 0);

    let withPay = ctx.prior_payments;
    let withExtra = extra;
    let withoutPay = owed > 0 ? [{ day: 0, amount: Math.round(owed * 100) / 100 }] : [];
    let title: string;
    let withLabel: string;
    if (active) {
      const p = pace.purchases[pace.purchases.length - 1];
      title = `Your ${p.product.split("(")[0].trim()} plan vs paying the rest now`;
      withLabel = "With Pace (your plan + hibernations)";
    } else {
      // No plan yet: what Pace would do for the cart item, vs paying in full
      const { name, price } = userProfile.cart_item;
      const best = solveStrategies(price, "balanced", ctx).picks[0];
      withPay = [...ctx.prior_payments, ...planPayments(best.plan, price)];
      withExtra = extra + pausedMonthlyOf(best.new_pause_ids);
      withoutPay = [...withoutPay, { day: 0, amount: price }];
      const pauses = PAUSEABLE_SUBS.filter((s) => best.new_pause_ids.includes(s.id)).map((s) => s.name);
      title = `If you buy ${name.split("(")[0].trim()} today`;
      withLabel = `With Pace (${best.plan_label}${pauses.length ? ` + pause ${pauses.join(", ")}` : ""})`;
    }

    // Horizon: past the deadline and past the later funding day
    const probe = goalTrajectory(0, withoutPay, ctx, 400);
    const D = probe.deadline_day;
    const H = Math.min(400, Math.max(D, probe.funded_day ?? D) + 14);
    const w = goalTrajectory(withExtra, withPay, ctx, H);
    const wo = goalTrajectory(0, withoutPay, ctx, H);

    const t0 = new Date(`${todayISO()}T00:00:00`).getTime();
    const rows = w.points.map((pt, i) => ({
      date: new Date(t0 + pt.day * 86_400_000),
      withPace: pt.balance,
      withoutPace: wo.points[i]?.balance ?? null,
    }));
    return {
      rows,
      title,
      withLabel,
      target: w.target,
      deadline: new Date(t0 + D * 86_400_000),
      withVerdict: verdict(w.funded_day, D),
      withoutVerdict: verdict(wo.funded_day, D),
      onTime: w.funded_day !== null && w.funded_day <= D,
    };
  }, [pace]);

  const options = useMemo<AgCartesianChartOptions>(
    () => ({
      data: model.rows,
      theme: "ag-default-dark",
      background: { fill: "#0B1F3A" },
      padding: { top: 10, right: 18, bottom: 6, left: 6 },
      series: [
        {
          type: "line",
          xKey: "date",
          yKey: "withPace",
          yName: model.withLabel,
          stroke: "#34D399",
          strokeWidth: 3,
          marker: { enabled: false },
        },
        {
          type: "line",
          xKey: "date",
          yKey: "withoutPace",
          yName: "Without Pace (pay in full, nothing paused)",
          stroke: "#F87171",
          strokeWidth: 2,
          lineDash: [6, 4],
          marker: { enabled: false },
        },
      ],
      // AG Charts 14: axes are a dictionary keyed by axis id (x / y)
      axes: {
        x: {
          type: "time",
          position: "bottom",
          crossLines: [
            {
              type: "line",
              value: model.deadline,
              stroke: "#FBBF24",
              strokeWidth: 1.5,
              lineDash: [4, 4],
              label: { text: "Trip deadline", position: "top", color: "#FBBF24", fontSize: 11 },
            },
          ],
        },
        y: {
          type: "number",
          position: "left",
          label: { formatter: ({ value }: { value: number }) => usd0(value) },
          crossLines: [
            {
              type: "line",
              value: model.target,
              stroke: "#FBBF24",
              strokeWidth: 1.5,
              label: { text: `Goal ${usd0(model.target)}`, position: "top-left", color: "#FBBF24", fontSize: 11 },
            },
          ],
        },
      },
      legend: { position: "bottom" },
    }),
    [model]
  );

  return (
    <div className="card p-4" id="goal-trajectory">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4" style={{ color: "var(--accent-text)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Goal Trajectory · {model.title}
        </span>
        <span
          className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(255,105,0,0.12)", color: "#FF6900" }}
        >
          AG CHARTS
        </span>
      </div>
      <div className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }} data-testid="trajectory-verdict">
        <span style={{ color: model.onTime ? "var(--success-text)" : "var(--warning-text)", fontWeight: 600 }}>With Pace: {model.withVerdict}</span>
        {" · "}
        <span style={{ color: "var(--danger-text)" }}>Without: {model.withoutVerdict}</span>
      </div>
      <div style={{ height: 320, borderRadius: 12, overflow: "hidden" }}>
        <AgCharts options={options} />
      </div>
    </div>
  );
}
