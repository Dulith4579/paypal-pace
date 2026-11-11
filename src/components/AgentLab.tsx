// src/components/AgentLab.tsx
"use client";

// ============================================================
// Agent Lab — run the PayPal Pace checkout agent on any purchase
// ============================================================
// Opens the exact PayPalPaceModal the /store uses (same /api/agent
// Solve → Propose → Verify pipeline, same firewall injection demo,
// same real PayPal sandbox capture) for any product name and price,
// without going through the storefront. A completed payment is written
// to the shared pace-store, so it shows on the Overview tab.
// ============================================================

import { useState } from "react";
import { FlaskConical, Calculator, Brain, ShieldCheck, Play, Plane } from "lucide-react";
import PayPalPaceModal from "@/components/PayPalPaceModal";
import { simulatorProducts, userProfile } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/math-engine";

const MAX_PRICE = 100_000; // matches the agent / firewall request validation

const PRESETS = [
  { name: 'Apex Air 13" Laptop - Sand (8-core CPU, 16GB Memory, 512GB SSD)', short: 'Apex Air 13" Laptop', price: 1099 },
  ...simulatorProducts.map((p) => ({ name: p.name, short: p.name, price: p.price })),
];

const STEPS = [
  { icon: Calculator, title: "1 · Solve", text: "Deterministic solver ranks every PayPal plan × subscription-pause combo against your goal." },
  { icon: Brain, title: "2 · Propose", text: "Gemma 2 (local, via Ollama) picks a plan for your priority mode and explains it." },
  { icon: ShieldCheck, title: "3 · Verify", text: "Numeric firewall checks every number Gemma wrote. Try “Inject Hallucination” in the reasoning panel." },
];

export default function AgentLab() {
  const [name, setName] = useState(PRESETS[0].name);
  const [price, setPrice] = useState(String(PRESETS[0].price));
  const [open, setOpen] = useState(false);

  const amount = parseFloat(price);
  const valid = name.trim().length > 0 && Number.isFinite(amount) && amount > 0 && amount <= MAX_PRICE;
  const goal = userProfile.primary_goal;

  const inputStyle = {
    border: "2px solid var(--border-default)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
  } as const;

  return (
    <section className="card p-5 sm:p-6 mb-8" id="agent-lab">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0, 112, 186, 0.1)" }}>
          <FlaskConical className="w-5 h-5" style={{ color: "var(--paypal-blue)" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold">Agent Lab: test Pace on any purchase</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Same checkout agent as the store, with your own product and price. Completing the PayPal step creates a real sandbox order that shows on Overview.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <div className="lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Quick picks
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {PRESETS.map((p) => {
              const active = p.name === name && String(p.price) === price;
              return (
                <button
                  key={p.name}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setName(p.name);
                    setPrice(String(p.price));
                  }}
                  style={{
                    background: active ? "var(--paypal-blue)" : "var(--bg-primary)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {p.short} · {formatCurrency(p.price)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Product
              <input
                id="lab-product-name"
                value={name}
                maxLength={150}
                onChange={(e) => setName(e.target.value)}
                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Price (USD)
              <input
                id="lab-product-price"
                type="number"
                min={1}
                max={MAX_PRICE}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold outline-none"
                style={inputStyle}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button id="lab-run-btn" type="button" className="btn btn-primary btn-lg" disabled={!valid} onClick={() => setOpen(true)}>
              <Play className="w-4 h-4" /> Run Pace checkout
            </button>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <Plane className="w-3.5 h-3.5" />
              Goal: {goal.name} · {formatCurrency(goal.saved)} of {formatCurrency(goal.target)}
            </span>
          </div>
          {!valid && (
            <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>
              Enter a product name and a price between $1 and {formatCurrency(MAX_PRICE)}.
            </p>
          )}
        </div>

        {/* Pipeline explainer */}
        <ol className="lg:col-span-2 flex flex-col gap-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 p-3 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)" }}>
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--paypal-blue)" }} />
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{text}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {open && valid && (
        <PayPalPaceModal
          productName={name.trim()}
          productPrice={Math.round(amount * 100) / 100}
          merchantName="Agent Lab (sandbox)"
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
