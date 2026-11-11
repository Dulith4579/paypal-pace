// src/app/store-standard/page.tsx
"use client";

// ============================================================
// Apex Electronics — baseline storefront WITHOUT PayPal Pace
// ============================================================
// Same store, same catalog, ordinary checkout: Add to Cart → cart drawer →
// pay the full amount (real PayPal card / PayPal buttons, sandbox) or leave.
// Used in the demo to show the cash-flow friction that makes shoppers
// abandon high-ticket carts. Nothing here reads or writes Pace state.
// ============================================================

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Truck, X, Lock, CircleCheck, ArrowRight } from "lucide-react";
import PayPalSmartButtons from "@/components/PayPalSmartButtons";
import {
  MERCHANT,
  product,
  catalog,
  StoreHeader,
  CatalogView,
  ProductDetail,
  StoreFooter,
  type Category,
} from "@/components/storefront/Storefront";
import type { CapturedPayment } from "@/lib/paypal-sdk";
import { formatCurrency } from "@/lib/math-engine";

export default function StandardStorePage() {
  const [view, setView] = useState<"catalog" | "product">("catalog");
  const [cart, setCart] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const [paid, setPaid] = useState<CapturedPayment | null>(null);

  const go = (v: "catalog" | "product") => {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addToCart = (id: string) => setCart((c) => (c.includes(id) ? c : [...c, id]));
  const addFlagshipAndOpen = () => {
    addToCart(product.id);
    setPaid(null);
    setDrawerOpen(true);
  };

  return (
    <>
      <div className="min-h-screen flex flex-col" style={{ background: "var(--store-bg)" }}>
        <StoreHeader
          cartCount={cart.length}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            if (view !== "catalog") setView("catalog");
          }}
          category={category}
          onCategory={(c) => {
            setCategory(c);
            go("catalog");
          }}
          onHome={() => {
            setCategory(null);
            setQuery("");
            go("catalog");
          }}
          onCart={() => setDrawerOpen(true)}
        />

        <div className="flex-1">
          {view === "catalog" ? (
            <CatalogView
              query={query}
              category={category}
              cart={cart}
              onAdd={addToCart}
              onConfigure={() => go("product")}
              onClearFilters={() => {
                setQuery("");
                setCategory(null);
              }}
            />
          ) : (
            <ProductDetail onBack={() => go("catalog")} cart={cart} onAdd={addToCart} buyBox={<StandardBuyBox onAdd={addFlagshipAndOpen} />} />
          )}
        </div>

        <StoreFooter />
      </div>

      <CartDrawer
        open={drawerOpen}
        cart={cart}
        paid={paid}
        onClose={() => setDrawerOpen(false)}
        onRemove={(id) => setCart((c) => c.filter((x) => x !== id))}
        onPaid={(p) => {
          setPaid(p);
          if (p.status === "COMPLETED") setCart([]);
        }}
        onAbandon={() => {
          setDrawerOpen(false);
          setAbandoned(true);
        }}
      />

      {abandoned && (
        <AbandonedOverlay
          onBackToStore={() => {
            setAbandoned(false);
            setCart([]);
            go("catalog");
          }}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// BUY BOX (no Pace: price + Add to Cart only)
// ────────────────────────────────────────────────────────────

function StandardBuyBox({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="sticky top-28 rounded-2xl border overflow-hidden"
      style={{ background: "var(--store-surface)", borderColor: "var(--store-border)", boxShadow: "var(--store-shadow)" }}
    >
      <div className="p-5" style={{ borderBottom: "1px solid var(--store-border)" }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold" style={{ color: "var(--store-text)" }}>
            {formatCurrency(product.price)}
          </span>
          <span className="text-sm line-through" style={{ color: "var(--store-faint)" }}>
            {formatCurrency(product.wasPrice)}
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: "var(--store-deal-bg)", color: "var(--store-deal-text)" }}>
            Save {formatCurrency(product.wasPrice - product.price)}
          </span>
        </div>
        <div className="mt-4 flex items-start gap-2 text-sm" style={{ color: "var(--store-ok)" }}>
          <Truck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <b>In stock.</b> Delivers in 2 business days via Priority Shipping
          </span>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <button
          id="add-to-cart-btn"
          onClick={onAdd}
          className="w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99]"
          style={{ background: "var(--store-cta)", color: "var(--store-cta-text)" }}
        >
          <ShoppingCart className="w-4 h-4" /> Add to Cart ({formatCurrency(product.price)})
        </button>
        <p className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "var(--store-muted)" }}>
          <Lock className="w-3 h-3" /> Secure checkout
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// CART DRAWER (the friction)
// ────────────────────────────────────────────────────────────

function CartDrawer({
  open,
  cart,
  paid,
  onClose,
  onRemove,
  onPaid,
  onAbandon,
}: {
  open: boolean;
  cart: string[];
  paid: CapturedPayment | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  onPaid: (p: CapturedPayment) => void;
  onAbandon: () => void;
}) {
  const [payError, setPayError] = useState<string | null>(null);
  const items = catalog.filter((i) => cart.includes(i.id));
  const subtotal = items.reduce((a, i) => a + i.price, 0);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(2,6,23,0.55)", opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      <aside
        id="cart-drawer"
        role="dialog"
        aria-label="Your cart"
        className="absolute right-0 top-0 h-full w-full max-w-[420px] flex flex-col transition-transform duration-300 ease-out"
        style={{
          background: "var(--store-surface)",
          borderLeft: "1px solid var(--store-border)",
          boxShadow: "-20px 0 40px rgba(0,0,0,0.25)",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--store-border)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--store-text)" }}>
            Your Cart ({items.length} Item{items.length === 1 ? "" : "s"})
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10" aria-label="Close cart" style={{ color: "var(--store-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {paid ? (
            <div className="p-4 rounded-xl text-sm" style={{ background: "var(--store-ok-bg)", border: "1px solid var(--store-ok-border)" }} id="standard-order-confirmation">
              <div className="flex items-center gap-2 font-bold" style={{ color: "var(--store-ok)" }}>
                <CircleCheck className="w-5 h-5" /> Order confirmed
              </div>
              <p className="mt-1 text-xs font-mono" style={{ color: "var(--store-muted)" }}>
                Order {paid.order_id} · Capture {paid.capture_id} · {paid.status}
              </p>
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm py-10 text-center" style={{ color: "var(--store-muted)" }}>
              Your cart is empty.
            </p>
          ) : (
            <>
              {items.map((i) => (
                <div key={i.id} className="flex gap-3 items-center" data-testid={`cart-line-${i.id}`}>
                  <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden" style={{ background: "var(--store-photo)" }}>
                    <Image src={i.image} alt={i.title} fill sizes="64px" className="object-contain p-1 mix-blend-multiply" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug" style={{ color: "var(--store-text)" }}>
                      {i.id === product.id ? 'Apex Air 13" Laptop · 16GB / 512GB' : i.title}
                    </p>
                    <button onClick={() => onRemove(i.id)} className="text-xs underline" style={{ color: "var(--store-muted)" }}>
                      Remove
                    </button>
                  </div>
                  <span className="text-sm font-bold" style={{ color: "var(--store-text)" }}>
                    {formatCurrency(i.price)}
                  </span>
                </div>
              ))}

              <dl className="pt-3 space-y-1.5 text-sm" style={{ borderTop: "1px solid var(--store-border)" }}>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--store-text-3)" }}>Subtotal</dt>
                  <dd className="font-semibold" style={{ color: "var(--store-text)" }}>
                    {formatCurrency(subtotal)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--store-text-3)" }}>Shipping</dt>
                  <dd className="font-semibold" style={{ color: "var(--store-ok)" }}>
                    FREE · Priority Shipping
                  </dd>
                </div>
                <div className="flex justify-between pt-2" style={{ borderTop: "1px solid var(--store-border)" }}>
                  <dt className="font-bold" style={{ color: "var(--store-text)" }}>
                    Total
                  </dt>
                  <dd className="font-bold" style={{ color: "var(--store-text)" }}>
                    {formatCurrency(subtotal)}
                  </dd>
                </div>
              </dl>

              {/* Traditional, pay-in-full options (real PayPal sandbox buttons) */}
              <div className="space-y-2" id="standard-payments">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--store-muted)" }}>
                  Pay {formatCurrency(subtotal)} in full
                </p>
                <PayPalSmartButtons
                  fundingSources={["card", "paypal"]}
                  height={44}
                  renderKey={String(subtotal)}
                  getOrderBody={() => ({ amount: subtotal, currency: "USD", description: `${MERCHANT} — order` })}
                  onCaptured={(p) => {
                    setPayError(null);
                    onPaid(p);
                  }}
                  onError={(m) => setPayError(m)}
                />
                {payError && (
                  <p className="text-xs" style={{ color: "var(--store-error)" }}>
                    Payment failed: {payError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {items.length > 0 && !paid && (
          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--store-border)" }}>
            <button
              id="abandon-cart-btn"
              onClick={onAbandon}
              className="w-full py-2.5 rounded-lg text-sm font-semibold border transition-all hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: "var(--store-border-strong)", color: "var(--store-text-3)" }}
            >
              ✕ Leave Store / Abandon Cart
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ABANDONED
// ────────────────────────────────────────────────────────────

function AbandonedOverlay({ onBackToStore }: { onBackToStore: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(2,6,23,0.72)" }} id="abandoned-overlay">
      <div
        className="w-full max-w-md rounded-2xl p-6 text-center"
        style={{ background: "var(--store-surface)", border: "1px solid var(--store-border)", boxShadow: "var(--store-shadow)" }}
      >
        <div className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
          <ShoppingCart className="w-6 h-6" style={{ color: "#EF4444" }} />
        </div>
        <h2 className="text-lg font-bold" style={{ color: "var(--store-text)" }}>
          Cart Abandoned.
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--store-text-3)" }}>
          Reason: High cash-flow shock and milestone derailment risk.
        </p>
        <Link
          href="/store"
          id="see-pace-link"
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
          style={{ background: "#FFC439", color: "#003087" }}
        >
          See how PayPal Pace solves this <ArrowRight className="w-4 h-4" />
        </Link>
        <div>
          <button onClick={onBackToStore} className="mt-3 text-xs underline" style={{ color: "var(--store-muted)" }}>
            Back to the store
          </button>
        </div>
      </div>
    </div>
  );
}
