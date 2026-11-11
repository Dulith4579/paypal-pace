import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PayPal Pace – AI Financial Co-Pilot",
  description:
    "Turn large purchases into structured, guilt-free recovery plans. PayPal Pace is your judgment-free financial companion that protects your savings milestones.",
  keywords: [
    "PayPal",
    "savings",
    "financial planning",
    "AI",
    "budgeting",
    "milestone tracking",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the inline script before React hydrates
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply the saved / OS theme before first paint (no light flash in dark mode) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
        {children}
      </body>
    </html>
  );
}
