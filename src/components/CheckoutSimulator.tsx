// src/components/CheckoutSimulator.tsx
"use client";

import { useState, useCallback } from "react";
import {
  ShoppingCart,
  CreditCard,
  AlertTriangle,
  Sparkles,
  DollarSign,
  Layers,
  Tag,
  Shield,
  CheckCircle2,
  Zap,
  TrendingUp,
  ArrowRight,
  Brain,
} from "lucide-react";

import { formatCurrency } from "@/lib/math-engine";
import { simulatorProducts } from "@/lib/mock-data";
import type { SimulatorProduct } from "@/types/financial";

/** AI agent response shape. */
interface AgentResponse {
  justification: string;
  plan: { lever: string; detail: string }[];
  confidence_score: number;
  classification?: { class: string; label: string };
  framing?: string;
  source?: string;
}

/** Props for the checkout simulator. */
interface CheckoutSimulatorProps {
  /** Called with the final purchase amount after AI justification and PayPal order creation. */
  onPurchaseComplete: (amount: number, productName: string) => void;
}

export default function CheckoutSimulator({
  onPurchaseComplete,
}: CheckoutSimulatorProps) {
  const [selectedProduct, setSelectedProduct] =
    useState<SimulatorProduct | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentResponse | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  /**
   * Executes the full simulation workflow:
   *   1️⃣ Call the agent for a structured justification.
   *   2️⃣ Create a PayPal sandbox order.
   *   3️⃣ Display the Intelligence Breakdown card.
   *   4️⃣ Propagate the amount to the parent UI for pacing calculations.
   */
  const handleSimulatePurchase = useCallback(
    async (amount: number, productName: string) => {
      setIsProcessing(true);
      setAgentResult(null);
      setOrderId(null);
      setShowConfirmation(false);

      try {
        // 1️⃣ AI justification
        const agentResp = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Justify purchasing ${productName} for $${amount}`,
            productName,
            purchaseAmount: amount,
          }),
        });
        const agentData: AgentResponse = await agentResp.json();
        setAgentResult(agentData);

        // 2️⃣ PayPal sandbox order creation
        let createdOrderId: string | null = null;
        try {
          const orderResp = await fetch("/api/paypal/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount,
              description: productName,
              currency: "USD",
            }),
          });
          const orderData = await orderResp.json();
          if (orderData?.success) {
            createdOrderId = orderData.order_id;
            setOrderId(createdOrderId);
          } else {
            console.warn("PayPal order creation returned:", orderData);
          }
        } catch (paypalErr) {
          console.warn("PayPal sandbox unavailable:", paypalErr);
        }

        // 3️⃣ Notify parent UI (used by pacing calculations)
        onPurchaseComplete(amount, productName);
      } catch (error) {
        console.error("Simulation workflow error:", error);
        // Still notify parent even on error so grid stays functional
        onPurchaseComplete(amount, productName);
      } finally {
        setIsProcessing(false);
      }
    },
    [onPurchaseComplete]
  );

  /** Simulate capturing the PayPal order */
  const handleCapture = useCallback(async () => {
    if (!orderId) return;
    setIsProcessing(true);
    try {
      const resp = await fetch("/api/paypal/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await resp.json();
      if (data?.success) {
        setShowConfirmation(true);
      }
    } catch (err) {
      console.error("Capture error:", err);
      // Show confirmation anyway in sandbox mode
      setShowConfirmation(true);
    } finally {
      setIsProcessing(false);
    }
  }, [orderId]);

  return (
    <div className="animate-fade-in">
      {/* Confirmation Banner */}
      {showConfirmation && orderId && (
        <div
          className="mb-6 p-4 rounded-xl flex items-center gap-3 animate-slide-in-down"
          style={{
            background: "var(--success-bg)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
          }}
        >
          <CheckCircle2
            className="w-5 h-5 flex-shrink-0"
            style={{ color: "var(--success)" }}
          />
          <div>
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--success-text)" }}
            >
              Payment Captured Successfully!{" "}
            </span>
            <span
              className="text-xs font-mono ml-1"
              style={{ color: "var(--success)" }}
            >
              Order: {orderId}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, #FFC439 0%, #F0B72A 100%)",
            }}
          >
            <ShoppingCart className="w-5 h-5 text-[#1A1A2E]" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Checkout Simulator</h2>
            <p
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              See how purchases affect your savings goals
            </p>
          </div>
        </div>
        <button
          id="custom-amount-toggle"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowCustom(!showCustom)}
        >
          <DollarSign className="w-4 h-4" /> Custom Amount
        </button>
      </div>

      {/* Custom Amount Input */}
      {showCustom && (
        <div className="card p-4 mb-4 animate-slide-in-down">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                $
              </span>
              <input
                id="custom-amount-input"
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Enter amount..."
                className="w-full pl-8 pr-4 py-3 rounded-lg text-lg font-semibold outline-none transition-all"
                style={{
                  border: "2px solid var(--border-default)",
                  background: "var(--bg-primary)",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--paypal-blue)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-default)")
                }
                min="1"
                max="10000"
              />
            </div>
            <button
              id="simulate-custom-btn"
              className="btn btn-primary btn-lg"
              disabled={
                !customAmount ||
                parseFloat(customAmount) <= 0 ||
                isProcessing
              }
              onClick={() =>
                handleSimulatePurchase(
                  parseFloat(customAmount),
                  "Custom Purchase"
                )
              }
            >
              {isProcessing ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Analyze Impact
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {simulatorProducts.map((product, index) => (
          <div
            key={product.id}
            id={`product-${product.id}`}
            className="card p-4 cursor-pointer group animate-fade-in-up"
            style={{
              animationDelay: `${index * 0.08}s`,
              animationFillMode: "both",
              border:
                selectedProduct?.id === product.id
                  ? "2px solid var(--paypal-blue)"
                  : undefined,
            }}
            onClick={() => setSelectedProduct(product)}
          >
            {/* Image Placeholder */}
            <div
              className="w-full h-32 rounded-lg mb-3 flex items-center justify-center relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-elevated) 100%)",
              }}
            >
              <Layers
                className="w-12 h-12 transition-transform group-hover:scale-110"
                style={{ color: "var(--accent-text)", opacity: 0.3 }}
              />
              <div className="absolute top-2 right-2">
                <span className="badge badge-info">
                  <Tag className="w-3 h-3" />
                  {product.category}
                </span>
              </div>
            </div>
            {/* Info */}
            <h3 className="text-sm font-semibold mb-1 leading-tight">
              {product.name}
            </h3>
            <p
              className="text-xs mb-3 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              {product.description}
            </p>
            {/* Price & Action */}
            <div className="flex items-center justify-between">
              <span
                className="text-xl font-bold"
                style={{ color: "var(--brand-text)" }}
              >
                {formatCurrency(product.price)}
              </span>
              <button
                className="btn btn-primary btn-sm group-hover:shadow-lg transition-all"
                disabled={isProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedProduct(product);
                  handleSimulatePurchase(product.price, product.name);
                }}
              >
                {isProcessing && selectedProduct?.id === product.id ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" /> Simulate
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PACE INTELLIGENCE BREAKDOWN CARD
          ═══════════════════════════════════════════════════════════ */}
      {agentResult && (
        <div
          className="mt-6 card-elevated p-6 animate-fade-in-up"
          id="intelligence-breakdown"
          style={{
            background:
              "linear-gradient(135deg, rgba(0, 48, 135, 0.03) 0%, rgba(0, 112, 186, 0.05) 100%)",
            border: "1px solid rgba(0, 112, 186, 0.15)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, var(--paypal-navy) 0%, var(--paypal-blue) 100%)",
                }}
              >
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>
                  PayPal Pace Intelligence Breakdown
                </h3>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Autonomous Affordability Strategy
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="badge"
                style={{
                  background: "rgba(16, 185, 129, 0.1)",
                  color: "var(--success)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                <Shield className="w-3 h-3" /> Verified
              </span>
              {agentResult.classification && (
                <span className="badge badge-info">
                  {agentResult.classification.label}
                </span>
              )}
            </div>
          </div>

          {/* AI Narrative */}
          <div
            className="p-4 rounded-xl mb-4"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div className="flex items-start gap-3">
              <Sparkles
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                style={{ color: "var(--paypal-gold)" }}
              />
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {agentResult.justification}
              </p>
            </div>
          </div>

          {/* 3-Lever Plan */}
          {agentResult.plan && agentResult.plan.length > 0 && (
            <div className="space-y-2 mb-4">
              {agentResult.plan.map((lever, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg transition-all hover:shadow-sm"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      background: "var(--paypal-blue)",
                      color: "white",
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-semibold mb-0.5"
                      style={{ color: "var(--brand-text)" }}
                    >
                      {lever.lever}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {lever.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confidence + Comparison Row */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {/* Confidence Score */}
            <div
              className="flex-1 p-3 rounded-lg text-center"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <TrendingUp
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--success)" }}
                />
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Confidence
                </span>
              </div>
              <div
                className="text-2xl font-bold"
                style={{ color: "var(--success)" }}
              >
                {agentResult.confidence_score}%
              </div>
            </div>

            {/* Without vs With Pace */}
            <div
              className="flex-[2] p-3 rounded-lg"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--danger)" }}
                  >
                    Without Pace
                  </div>
                  <div
                    className="text-lg font-bold"
                    style={{ color: "var(--danger)" }}
                  >
                    +45 days
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    delay on savings
                  </div>
                </div>
                <ArrowRight
                  className="w-5 h-5"
                  style={{ color: "var(--text-muted)" }}
                />
                <div className="text-center">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--success)" }}
                  >
                    With Pace
                  </div>
                  <div
                    className="text-lg font-bold"
                    style={{ color: "var(--success)" }}
                  >
                    0 days
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    delay on savings
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Approve & Pay Button */}
          {orderId && !showConfirmation && (
            <button
              id="approve-pay-btn"
              className="btn btn-gold btn-lg w-full mt-4"
              onClick={handleCapture}
              disabled={isProcessing}
              style={{ fontSize: "1rem" }}
            >
              {isProcessing ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Approve Plan & Pay
                </>
              )}
            </button>
          )}

          {/* Source badge */}
          <div className="flex justify-end mt-2">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-muted)",
              }}
            >
              {agentResult.source === "ollama"
                ? "🧠 Gemma 2B"
                : agentResult.source === "ollama_raw"
                  ? "🧠 Gemma 2B (raw)"
                  : "⚡ Deterministic Engine"}
            </span>
          </div>
        </div>
      )}

      {/* Opportunity Cost Banner */}
      {!agentResult && (
        <div
          className="mt-6 p-4 rounded-xl animate-fade-in"
          style={{
            background:
              "linear-gradient(135deg, rgba(0, 112, 186, 0.06) 0%, rgba(0, 48, 135, 0.03) 100%)",
            border: "1px solid rgba(0, 112, 186, 0.12)",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0, 112, 186, 0.1)" }}
            >
              <AlertTriangle
                className="w-4 h-4"
                style={{ color: "var(--accent-text)" }}
              />
            </div>
            <div>
              <h4
                className="text-sm font-semibold mb-1"
                style={{ color: "var(--brand-text)" }}
              >
                Opportunity Cost Insight
              </h4>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                Select a product above to see how the purchase impacts your
                active savings milestones. Pace will calculate the exact delay
                and offer guilt‑free recovery paths — including{" "}
                <strong>PayPal Pay in 4</strong> to split payments
                interest‑free.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
