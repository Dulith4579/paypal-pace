// src/components/PayLaterMessage.tsx
"use client";

// Official PayPal Pay Later messaging (JS SDK `messages` component).
// PayPal computes the offer text itself ("Pay in 4 interest-free payments
// of $274.75…"), so the copy is always compliant with the live terms.

import { useEffect, useRef, useState } from "react";
import { loadPayPalSdk } from "@/lib/paypal-sdk";
import { useResolvedTheme } from "@/lib/theme";

interface Props {
  amount: number;
  placement?: "home" | "category" | "product" | "cart" | "payment";
  className?: string;
  id?: string;
}

export default function PayLaterMessage({ amount, placement = "product", className, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // PayPal's message is black text by default; use its white variant on dark pages
  const theme = useResolvedTheme();

  useEffect(() => {
    let cancelled = false;
    loadPayPalSdk()
      .then((paypal) => {
        if (cancelled || !ref.current || !paypal?.Messages) return;
        ref.current.innerHTML = "";
        return paypal
          .Messages({
            amount,
            currency: "USD",
            placement,
            style: { layout: "text", logo: { type: "inline" }, text: { size: 12, color: theme === "dark" ? "white" : "black" } },
            onRender: () => !cancelled && setState("ready"),
          })
          .render(ref.current);
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [amount, placement, theme]);

  return (
    <div
      className={`paypal-embed ${className ?? ""}`}
      id={id}
      data-paylater-state={state}
      // PayPal's iframe document is light; a matching color-scheme keeps it transparent on dark pages
      style={{ colorScheme: "light" }}
    >
      <div ref={ref} style={{ minHeight: state === "error" ? 0 : 20 }} />
    </div>
  );
}
