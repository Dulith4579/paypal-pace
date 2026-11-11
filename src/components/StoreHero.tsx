// src/components/StoreHero.tsx
"use client";
import { ArrowRight } from "lucide-react";

export default function StoreHero() {
  return (
    <section
      className="relative flex flex-col items-center justify-center text-center py-24 mb-12 overflow-hidden rounded-3xl"
      style={{
        background: "linear-gradient(135deg, #0d47a1 0%, #1976d2 60%, #42a5f5 100%)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
      }}
    >
      {/* Subtle glass overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backdropFilter: "blur(12px)",
          background: "rgba(255,255,255,0.04)",
        }}
      />
      <h1 className="relative text-5xl md:text-6xl font-extrabold text-white mb-4" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
        Elevate Your Workspace
      </h1>
      <p className="relative text-lg md:text-xl text-white/90 mb-8" style={{ maxWidth: "640px" }}>
        Discover premium laptops curated for developers, creators, and power users. Fast performance, stunning displays, and unbeatable financing with PayPal Pace.
      </p>
      <a
        href="#"
        className="relative inline-flex items-center px-6 py-3 bg-white/90 text-blue-800 font-semibold rounded-full hover:bg-white transition-shadow hover:shadow-lg"
        style={{ backdropFilter: "blur(4px)" }}
      >
        Shop Now
        <ArrowRight className="w-4 h-4 ml-2" />
      </a>
    </section>
  );
}
