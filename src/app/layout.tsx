import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F5F7FA] text-[#1A1A2E]">
        {children}
      </body>
    </html>
  );
}
