// src/app/store-standard/layout.tsx
// Same storefront identity as /store (this is the "without PayPal Pace" baseline).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apex Electronics · Pro Hardware for Builders",
  description: "Laptops, displays, keyboards & mice and studio audio for engineers.",
};

export default function StandardStoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
