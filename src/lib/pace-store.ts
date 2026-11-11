// src/lib/pace-store.ts
// ============================================================
// PayPal Pace – shared client state
// ============================================================
// One source of truth for everything the user *does* across the app:
// subscriptions hibernated on the dashboard, spending levers, PayPal
// purchases captured in the store, and goal contributions captured from
// milestone cards. Persisted to localStorage (and synced across tabs),
// and turned into a PaceContext that the solver / agent routes use, so
// the dashboard, checkout AI and grids all reason from the same facts.
// ============================================================

import { useSyncExternalStore } from "react";
import { FOOD_CAP_MONTHLY, pausedMonthlyOf } from "@/lib/arbitrage";
import {
  planPayments,
  isProtectedSub,
  fundingForecast,
  PAUSEABLE_SUBS,
  type PaceContext,
  type PlanType,
} from "@/lib/strategy-solver";
import { FUNDING_LABEL } from "@/lib/paypal-sdk";

export const PRIMARY_GOAL_ID = "goal-006";

export interface PacePurchase {
  order_id: string;
  capture_id: string;
  status: string;
  product: string;
  amount: number;
  plan: PlanType;
  installment: number;
  count: number;
  /** How it was funded: PayPal Pay Later / PayPal wallet / card / sandbox test card. */
  funding: string;
  paused_ids: string[];
  delay_days: number;
  /** ISO date (YYYY-MM-DD) of capture. */
  date: string;
}

export interface GoalContribution {
  order_id: string;
  capture_id: string;
  goal_id: string;
  amount: number;
  funding: string;
  date: string;
}

export type PaceEventKind = "hibernate" | "resume" | "lever" | "purchase" | "contribution" | "agent" | "firewall" | "guard";

/** One entry in the Agent Activity Timeline. */
export interface PaceEvent {
  id: string;
  /** ISO timestamp. */
  at: string;
  kind: PaceEventKind;
  title: string;
  detail?: string;
  /** Who acted: the user, the AI agent, or a guard/firewall. */
  actor: "you" | "agent" | "guard" | "firewall";
  /** Planted by the injection demo, not a real AI mistake. */
  demo?: boolean;
}

export interface PaceState {
  pausedIds: string[];
  foodCap: boolean;
  purchases: PacePurchase[];
  contributions: GoalContribution[];
  events: PaceEvent[];
}

const KEY = "paypal-pace:v1";
const EMPTY: PaceState = { pausedIds: [], foodCap: false, purchases: [], contributions: [], events: [] };
const MAX_EVENTS = 60;

let state: PaceState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

/** Protected subscriptions (Cloud Tier) can never be stored as paused. */
function sanitize(s: PaceState): PaceState {
  if (!Array.isArray(s.events)) s = { ...s, events: [] };
  return s.pausedIds.some(isProtectedSub) ? { ...s, pausedIds: s.pausedIds.filter((id) => !isProtectedSub(id)) } : s;
}

/** Timeline entries for purchases/contributions captured before the timeline existed. */
function backfillEvents(s: Partial<PaceState>): PaceEvent[] {
  const out: PaceEvent[] = [];
  for (const p of s.purchases ?? []) out.push(purchaseEvent(p, `${p.date}T12:00:00.000Z`));
  for (const c of s.contributions ?? []) out.push(contributionEvent(c, `${c.date}T12:00:00.000Z`));
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = sanitize({ ...EMPTY, ...parsed, events: Array.isArray(parsed.events) ? parsed.events : backfillEvents(parsed) });
      // Persist the cleanup (e.g. a stale "Cloud Tier paused" from an older build)
      const cleaned = JSON.stringify(state);
      if (cleaned !== raw) window.localStorage.setItem(KEY, cleaned);
    }
  } catch {
    /* private mode / corrupt JSON — start fresh */
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      state = e.newValue ? sanitize({ ...EMPTY, ...JSON.parse(e.newValue) }) : EMPTY;
    } catch {
      state = EMPTY;
    }
    listeners.forEach((l) => l());
  });
}

function set(update: (s: PaceState) => PaceState) {
  load();
  state = sanitize(update(state));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((l) => l());
}

export function getPaceState(): PaceState {
  load();
  return state;
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook — server render / hydration sees the empty state, then the stored one. */
export function usePaceState(): PaceState {
  return useSyncExternalStore(subscribe, getPaceState, () => EMPTY);
}

// ─── Activity events ───────────────────────────────────────────

const uniq = (ids: string[]) => [...new Set(ids)];
const nowISO = () => new Date().toISOString();
const newId = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const subNames = (ids: string[]) => PAUSEABLE_SUBS.filter((x) => ids.includes(x.id)).map((x) => x.name).join(" + ");
const PLAN_TEXT: Record<PlanType, string> = {
  outright: "paid in full",
  pay_in_4: "Pay in 4",
  pay_monthly_6: "Pay Monthly ×6",
  pay_monthly_12: "Pay Monthly ×12",
};

/** Fractional days until the primary goal is funded, for a given state. */
function fundedDays(s: PaceState): number {
  const extra = pausedMonthlyOf(s.pausedIds) + (s.foodCap ? FOOD_CAP_MONTHLY : 0);
  return fundingForecast(extra, undefined, paceContextOf(s)).funded_in_days;
}

/** "1.2 days sooner" / "0.4 days later" — the goal effect of going from prev to next. */
function goalEffect(prev: PaceState, next: PaceState): string {
  const d = Math.round((fundedDays(prev) - fundedDays(next)) * 10) / 10;
  if (d === 0) return "no change to the goal date";
  return `Japan Trip ${Math.abs(d).toFixed(1)} day${Math.abs(d) === 1 ? "" : "s"} ${d > 0 ? "sooner" : "later"}`;
}

function purchaseEvent(p: PacePurchase, at = nowISO()): PaceEvent {
  return {
    id: `purchase-${p.order_id}`,
    at,
    kind: "purchase",
    actor: "you",
    title: `PayPal captured ${usd(p.amount)} · ${p.product.split("(")[0].trim()} on ${PLAN_TEXT[p.plan]}`,
    detail: `${FUNDING_LABEL[p.funding] ?? p.funding}${p.plan !== "outright" ? ` · ${p.count} × ${usd(p.installment)}` : ""} · goal delay ${p.delay_days} days · order ${p.order_id}`,
  };
}

function contributionEvent(c: GoalContribution, at = nowISO()): PaceEvent {
  return {
    id: `contribution-${c.order_id}`,
    at,
    kind: "contribution",
    actor: "you",
    title: `Contributed ${usd(c.amount)} to the Japan Autumn Trip via PayPal`,
    detail: `${FUNDING_LABEL[c.funding] ?? c.funding} · capture ${c.capture_id}`,
  };
}

/** Apply a state change and log what it did (append-only, newest last, deduped by id). */
function setWithEvents(update: (s: PaceState) => PaceState, describe: (prev: PaceState, next: PaceState) => PaceEvent[]) {
  set((prev) => {
    const next = sanitize(update(prev));
    const fresh = describe(prev, next).filter((e) => !next.events.some((x) => x.id === e.id));
    return fresh.length ? { ...next, events: [...next.events, ...fresh].slice(-MAX_EVENTS) } : next;
  });
}

/** Events for a change in hibernated subscriptions. */
function pauseEvents(prev: PaceState, next: PaceState, by: PaceEvent["actor"], via?: string): PaceEvent[] {
  const added = next.pausedIds.filter((x) => !prev.pausedIds.includes(x));
  const removed = prev.pausedIds.filter((x) => !next.pausedIds.includes(x));
  const effect = goalEffect(prev, next);
  const out: PaceEvent[] = [];
  if (added.length)
    out.push({
      id: newId("hibernate"),
      at: nowISO(),
      kind: "hibernate",
      actor: by,
      title: `Hibernated ${subNames(added)} → ${effect}`,
      detail: `+${usd(pausedMonthlyOf(added))}/mo to the goal${via ? ` · via ${via}` : ""}`,
    });
  if (removed.length)
    out.push({
      id: newId("resume"),
      at: nowISO(),
      kind: "resume",
      actor: by,
      title: `Resumed ${subNames(removed)} → ${effect}`,
      detail: `${usd(pausedMonthlyOf(removed))}/mo back to spending${via ? ` · via ${via}` : ""}`,
    });
  return out;
}

// ─── Actions ───────────────────────────────────────────────────

export const paceActions = {
  setPaused(ids: string[], via?: string) {
    setWithEvents((s) => ({ ...s, pausedIds: uniq(ids) }), (a, b) => pauseEvents(a, b, "you", via));
  },
  togglePaused(id: string, paused: boolean) {
    setWithEvents(
      (s) => ({ ...s, pausedIds: paused ? uniq([...s.pausedIds, id]) : s.pausedIds.filter((x) => x !== id) }),
      (a, b) => pauseEvents(a, b, "you")
    );
  },
  /** `via` names the feature that suggested it (e.g. "Installment Guard"); those count as agent actions. */
  addPaused(ids: string[], via?: string) {
    setWithEvents((s) => ({ ...s, pausedIds: uniq([...s.pausedIds, ...ids]) }), (a, b) => pauseEvents(a, b, via ? "agent" : "you", via));
  },
  removePaused(ids: string[]) {
    setWithEvents((s) => ({ ...s, pausedIds: s.pausedIds.filter((x) => !ids.includes(x)) }), (a, b) => pauseEvents(a, b, "you"));
  },
  setFoodCap(on: boolean) {
    setWithEvents(
      (s) => ({ ...s, foodCap: on }),
      (a, b) =>
        a.foodCap === b.foodCap
          ? []
          : [
              {
                id: newId("lever"),
                at: nowISO(),
                kind: "lever",
                actor: "you",
                title: `${on ? "Capped food delivery at 2×/mo" : "Removed the food-delivery cap"} → ${goalEffect(a, b)}`,
                detail: `${on ? "+" : "−"}${usd(FOOD_CAP_MONTHLY)}/mo discretionary margin`,
              },
            ]
    );
  },
  recordPurchase(p: PacePurchase) {
    setWithEvents(
      (s) => ({
        ...s,
        purchases: [...s.purchases.filter((x) => x.order_id !== p.order_id), p],
        // Pauses chosen at checkout become the user's active hibernations
        pausedIds: uniq([...s.pausedIds, ...p.paused_ids]),
      }),
      (a, b) => [purchaseEvent(p), ...pauseEvents(a, b, "agent", "checkout plan")]
    );
  },
  recordContribution(c: GoalContribution) {
    setWithEvents(
      (s) => ({ ...s, contributions: [...s.contributions.filter((x) => x.order_id !== c.order_id), c] }),
      () => [contributionEvent(c)]
    );
  },
  /** Log an agent / firewall / guard event. Pass a stable `id` to log something only once. */
  logEvent(e: Omit<PaceEvent, "id" | "at"> & { id?: string }) {
    setWithEvents(
      (s) => s,
      () => [{ ...e, id: e.id ?? newId(e.kind), at: nowISO() }]
    );
  },
  reset() {
    set(() => EMPTY);
  },
};

// ─── Derived ───────────────────────────────────────────────────

export const todayISO = () => new Date().toISOString().split("T")[0];

function daysSince(iso: string): number {
  const ms = new Date(todayISO()).getTime() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function contributedTo(s: PaceState, goalId: string): number {
  return Math.round(s.contributions.filter((c) => c.goal_id === goalId).reduce((a, c) => a + c.amount, 0) * 100) / 100;
}

/** Installments still owed on a purchase, as day offsets from today. */
export function remainingPayments(p: PacePurchase): { day: number; amount: number }[] {
  const elapsed = daysSince(p.date);
  return planPayments(p.plan, p.amount)
    .map((x) => ({ day: x.day - elapsed, amount: x.amount }))
    // Today's installment still counts against today's cash flow (same model the solver used at checkout)
    .filter((x) => x.day >= 0);
}

/** The serializable context the solver / agents take. */
export function paceContextOf(s: PaceState): PaceContext {
  return {
    saved_extra: contributedTo(s, PRIMARY_GOAL_ID),
    prior_payments: s.purchases.flatMap(remainingPayments),
    already_paused: [...s.pausedIds].sort(),
    extra_monthly: s.foodCap ? FOOD_CAP_MONTHLY : 0,
  };
}
