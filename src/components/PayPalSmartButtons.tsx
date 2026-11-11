// src/components/PayPalSmartButtons.tsx
"use client";

// Real PayPal Smart Buttons with buyer approval (popup), one button per
// funding source. Orders are created + captured on our server
// (/api/paypal/orders) — the browser never holds credentials.
//
// Funding sources the account/buyer isn't eligible for are skipped
// (e.g. Pay Later outside $30–$1,500), so the UI never shows a dead button.

import { useEffect, useRef, useState } from "react";
import { loadPayPalSdk, createServerOrder, captureServerOrder, type CapturedPayment } from "@/lib/paypal-sdk";
import { useResolvedTheme } from "@/lib/theme";

type Funding = "paylater" | "paypal" | "card";

interface Props {
  fundingSources: Funding[];
  /** Read at click time, so the latest amount/plan is always used. */
  getOrderBody: () => Record<string, unknown>;
  onCaptured: (p: CapturedPayment) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
  height?: number;
  /** Changing this re-renders the buttons. */
  renderKey?: string;
}

export default function PayPalSmartButtons({
  fundingSources,
  getOrderBody,
  onCaptured,
  onError,
  onCancel,
  height = 44,
  renderKey = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "none" | "error">("loading");
  // Keep callbacks fresh without re-rendering PayPal iframes on every parent render
  const cb = useRef({ getOrderBody, onCaptured, onError, onCancel });
  useEffect(() => {
    cb.current = { getOrderBody, onCaptured, onError, onCancel };
  });
  const sourcesKey = fundingSources.join(",");
  // Card button: PayPal's white variant on dark pages (gold/blue work on both)
  const theme = useResolvedTheme();

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendered: any[] = [];

    loadPayPalSdk()
      .then(async (paypal) => {
        const root = containerRef.current;
        if (cancelled || !root || !paypal?.Buttons) return;
        root.innerHTML = "";
        const renders: Promise<void>[] = [];
        for (const source of sourcesKey.split(",") as Funding[]) {
          const slot = document.createElement("div");
          slot.dataset.funding = source;
          slot.style.marginBottom = "8px";
          root.appendChild(slot);
          const button = paypal.Buttons!({
            fundingSource: source,
            style: {
              // Card: horizontal + no tagline ("Powered by PayPal" is dark text, unreadable on dark pages)
              ...(source === "card" ? { layout: "horizontal" as const, tagline: false } : { layout: "vertical" as const }),
              shape: "rect",
              height,
              color: source === "card" ? (theme === "dark" ? "white" : "black") : source === "paylater" ? "gold" : "blue",
              label: "pay",
            },
            createOrder: () => createServerOrder(cb.current.getOrderBody()),
            onApprove: async (data) => {
              try {
                const cap = await captureServerOrder(data.orderID);
                // One button per funding source, so the button tells us how it was funded
                cb.current.onCaptured({ ...cap, funding: source });
              } catch (e) {
                cb.current.onError?.(e instanceof Error ? e.message : String(e));
              }
            },
            onCancel: () => cb.current.onCancel?.(),
            onError: (err) => cb.current.onError?.(err instanceof Error ? err.message : String(err)),
          });
          if (!button.isEligible()) {
            slot.remove();
            continue;
          }
          rendered.push(button);
          // Render all funding sources in parallel; render() rejects if torn
          // down mid-render (React dev double effects) — expected
          renders.push(button.render(slot).catch(() => {}));
        }
        await Promise.all(renders);
        if (!cancelled) setStatus(renders.length ? "ready" : "none");
      })
      .catch(() => !cancelled && setStatus("error"));

    return () => {
      cancelled = true;
      rendered.forEach((b) => b?.close?.().catch?.(() => {}));
    };
  }, [sourcesKey, height, renderKey, theme]);

  return (
    <div data-smart-buttons={status}>
      {status === "error" && (
        <p className="text-[11px] mb-2" style={{ color: "var(--warning-text)" }}>
          PayPal buttons couldn&apos;t load (network / ad-blocker). Use the instant sandbox capture below.
        </p>
      )}
      {/* color-scheme "light" = PayPal iframes stay transparent on dark pages */}
      <div ref={containerRef} className="paypal-embed" style={{ colorScheme: "light" }} />
      {status === "loading" && (
        <div className="h-11 rounded-lg animate-pulse mb-2" style={{ background: "var(--border-default)" }} />
      )}
    </div>
  );
}
