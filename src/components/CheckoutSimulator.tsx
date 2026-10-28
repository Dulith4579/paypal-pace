"use client";

import { useState, useCallback } from "react";
import {
  ShoppingCart,
  CreditCard,
  AlertTriangle,
  ChevronRight,
  X,
  Sparkles,
  Clock,
  DollarSign,
  Layers,
  Tag,
} from "lucide-react";
import { simulatorProducts } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/math-engine";
import type { SimulatorProduct, RebalanceResult } from "@/types/financial";

interface CheckoutSimulatorProps {
  onPurchaseSimulated: (result: RebalanceResult) => void;
}

export default function CheckoutSimulator({ onPurchaseSimulated }: CheckoutSimulatorProps) {
  const [selectedProduct, setSelectedProduct] = useState<SimulatorProduct | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handleSimulatePurchase = useCallback(
    async (amount: number, productName: string) => {
      setIsProcessing(true);
      try {
        const response = await fetch("/api/agent/rebalance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchase_amount: amount,
            product_name: productName,
          }),
        });

        const data = await response.json();
        if (data.success) {
          onPurchaseSimulated(data.result);
        }
      } catch (error) {
        console.error("Simulation failed:", error);
      } finally {
        setIsProcessing(false);
        setSelectedProduct(null);
      }
    },
    [onPurchaseSimulated]
  );

  return (
    <div className="animate-fade-in">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FFC439 0%, #F0B72A 100%)" }}
          >
            <ShoppingCart className="w-5 h-5 text-[#1A1A2E]" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Checkout Simulator</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              See how purchases affect your savings goals
            </p>
          </div>
        </div>
        <button
          id="custom-amount-toggle"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowCustom(!showCustom)}
        >
          <DollarSign className="w-4 h-4" />
          Custom Amount
        </button>
      </div>

      {/* Custom Amount Input */}
      {showCustom && (
        <div className="card p-4 mb-4 animate-slide-in-down">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold" style={{ color: "var(--text-muted)" }}>$</span>
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
                onFocus={(e) => (e.target.style.borderColor = "var(--paypal-blue)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-default)")}
                min="1"
                max="10000"
              />
            </div>
            <button
              id="simulate-custom-btn"
              className="btn btn-primary btn-lg"
              disabled={!customAmount || parseFloat(customAmount) <= 0 || isProcessing}
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
                  <Sparkles className="w-4 h-4" />
                  Analyze Impact
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
              border: selectedProduct?.id === product.id ? "2px solid var(--paypal-blue)" : undefined,
            }}
            onClick={() => setSelectedProduct(product)}
          >
            {/* Product Image Placeholder */}
            <div
              className="w-full h-32 rounded-lg mb-3 flex items-center justify-center relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, var(--bg-primary) 0%, #E8ECF1 100%)",
              }}
            >
              <Layers className="w-12 h-12 transition-transform group-hover:scale-110" style={{ color: "var(--paypal-blue)", opacity: 0.3 }} />
              <div className="absolute top-2 right-2">
                <span className="badge badge-info">
                  <Tag className="w-3 h-3" />
                  {product.category}
                </span>
              </div>
            </div>

            {/* Product Info */}
            <h3 className="text-sm font-semibold mb-1 leading-tight">{product.name}</h3>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {product.description}
            </p>

            {/* Price & Action */}
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold" style={{ color: "var(--paypal-navy)" }}>
                {formatCurrency(product.price)}
              </span>
              <button
                className="btn btn-primary btn-sm group-hover:shadow-lg transition-all"
                disabled={isProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSimulatePurchase(product.price, product.name);
                }}
              >
                {isProcessing && selectedProduct?.id === product.id ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    Simulate
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Opportunity Cost Banner */}
      <div
        className="mt-6 p-4 rounded-xl animate-fade-in"
        style={{
          background: "linear-gradient(135deg, rgba(0, 112, 186, 0.06) 0%, rgba(0, 48, 135, 0.03) 100%)",
          border: "1px solid rgba(0, 112, 186, 0.12)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0, 112, 186, 0.1)" }}>
            <AlertTriangle className="w-4 h-4" style={{ color: "var(--paypal-blue)" }} />
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--paypal-navy)" }}>
              Opportunity Cost Insight
            </h4>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Select a product above to see how the purchase impacts your active savings milestones.
              Pace will calculate the exact delay and offer guilt-free recovery paths —
              including <strong>PayPal Pay in 4</strong> to split payments interest-free.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
