// src/lib/paypal-sdk.ts
// ============================================================
// PayPal Pace – single JS SDK loader
// ============================================================
// Every PayPal surface (Pay Later messaging, Smart Buttons) must share
// ONE SDK instance: loading it twice with different query params
// replaces window.paypal and tears down already-rendered components.
// Orders are created and captured server-side (/api/paypal/orders), so
// the client only ever sees order IDs.
// ============================================================

import { loadScript, type PayPalNamespace } from "@paypal/paypal-js";

let sdk: Promise<PayPalNamespace | null> | null = null;

export function loadPayPalSdk(): Promise<PayPalNamespace | null> {
  if (!sdk) {
    sdk = loadScript({
      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "",
      currency: "USD",
      intent: "capture",
      components: ["buttons", "messages", "funding-eligibility"],
      // Pay Later (Pay in 4 / Pay Monthly) is the core of Pace's pitch
      enableFunding: ["paylater"],
      // Sandbox-only override so Pay Later is offered regardless of the
      // developer's IP location (the merchant account is US).
      buyerCountry: "US",
    }).catch((err) => {
      sdk = null; // allow a retry
      throw err;
    });
  }
  return sdk;
}

export interface CapturedPayment {
  order_id: string;
  capture_id: string;
  status: string;
  funding: string;
}

/** Server-side order creation (same route the in-context flow uses). */
export async function createServerOrder(body: Record<string, unknown>): Promise<string> {
  const r = await fetch("/api/paypal/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data?.success || !data.order_id) throw new Error(data?.error || "Order creation failed");
  return data.order_id as string;
}

/** Server-side capture of a buyer-approved order. */
export async function captureServerOrder(orderId: string): Promise<{ order_id: string; status: string; capture_id: string }> {
  const r = await fetch("/api/paypal/orders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: orderId }),
  });
  const data = await r.json();
  if (!data?.success) throw new Error(data?.error || "Capture failed");
  return { order_id: data.order_id, status: data.status, capture_id: data.capture_id ?? "" };
}

/**
 * No-login sandbox path: the order is funded with PayPal's public sandbox
 * test card and completes in one call (useful when no sandbox buyer
 * account is at hand, e.g. while recording a demo).
 */
export async function instantSandboxCapture(body: Record<string, unknown>): Promise<CapturedPayment> {
  const r = await fetch("/api/paypal/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, in_context: true }),
  });
  const data = await r.json();
  if (!data?.success || !data.order_id) throw new Error(data?.error || "Sandbox order failed");
  if (data.status === "COMPLETED") {
    return { order_id: data.order_id, capture_id: data.capture_id ?? data.order_id, status: "COMPLETED", funding: "sandbox_card" };
  }
  const cap = await captureServerOrder(data.order_id);
  return { ...cap, funding: "sandbox_card" };
}

export const FUNDING_LABEL: Record<string, string> = {
  paylater: "PayPal Pay Later",
  paypal: "PayPal wallet",
  card: "Debit / credit card (PayPal)",
  venmo: "Venmo",
  sandbox_card: "Sandbox test card (in-context)",
};
