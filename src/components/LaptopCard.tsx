// src/components/LaptopCard.tsx
"use client";
import { Laptop, Star } from "lucide-react";
import { formatCurrency } from "@/lib/math-engine";
import { useState } from "react";

interface LaptopCardProps {
  name: string;
  shortDesc: string;
  price: number;
  rating: number;
  reviews: number;
}

export default function LaptopCard({ name, shortDesc, price, rating, reviews }: LaptopCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="p-4 rounded-xl transition-all hover:shadow-xl cursor-pointer backdrop-blur-md"
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        transform: hovered ? "scale(1.02)" : "scale(1)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="w-full h-32 rounded-lg mb-3 flex items-center justify-center bg-gray-100/10">
        <Laptop className="w-12 h-12 text-gray-400" />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {name}
      </p>
      <p className="text-xs text-muted" style={{ color: "var(--text-secondary)" }}>
        {shortDesc}
      </p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-bold" style={{ color: "var(--paypal-navy)" }}>
          {formatCurrency(price)}
        </span>
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className="w-4 h-4"
              style={{
                color: i < Math.floor(rating) ? "#FFC439" : "#D1D5DB",
                fill: i < Math.floor(rating) ? "#FFC439" : "none",
              }}
            />
          ))}
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            ({reviews.toLocaleString()})
          </span>
        </div>
      </div>
    </div>
  );
}
