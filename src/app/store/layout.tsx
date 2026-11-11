// src/app/store/layout.tsx
// The demo merchant store has its own identity (tab title), separate from
// the PayPal Pace dashboard.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apex Electronics · Pro Hardware for Builders",
  description: "Laptops, displays, custom keyboards and studio audio for engineers.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
