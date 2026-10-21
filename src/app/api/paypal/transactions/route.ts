// ============================================================
// PayPal Pace – Transactions API Route
// ============================================================
// GET /api/paypal/transactions – Returns mock + PayPal transactions
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { mockTransactions } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const type = searchParams.get("type"); // "debit" | "credit" | "subscription"
    const goalId = searchParams.get("goal_id");

    let filtered = [...mockTransactions];

    // Filter by type
    if (type === "subscription") {
      filtered = filtered.filter((t) => t.is_subscription);
    } else if (type) {
      filtered = filtered.filter((t) => t.type === type);
    }

    // Filter by goal
    if (goalId) {
      filtered = filtered.filter((t) => t.goal_id === goalId);
    }

    // Sort by date descending
    filtered.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Apply limit
    const result = filtered.slice(0, limit);

    return NextResponse.json({
      success: true,
      transactions: result,
      total: filtered.length,
      returned: result.length,
    });
  } catch (error) {
    console.error("[Transactions]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch transactions",
      },
      { status: 500 }
    );
  }
}
