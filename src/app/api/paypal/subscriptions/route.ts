// ============================================================
// PayPal Pace – Subscriptions API Route
// ============================================================
// GET    /api/paypal/subscriptions            – List all subscriptions
// POST   /api/paypal/subscriptions            – Cancel a subscription
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { mockSubscriptions } from "@/lib/mock-data";

// In-memory state for demo purposes
const subscriptionState = [...mockSubscriptions];

export async function GET() {
  try {
    const dormant = subscriptionState.filter((s) => s.status === "dormant");
    const active = subscriptionState.filter((s) => s.status === "active");
    const cancelled = subscriptionState.filter((s) => s.status === "cancelled");

    const potentialSavings = dormant.reduce(
      (sum, s) => sum + s.monthly_cost,
      0
    );

    return NextResponse.json({
      success: true,
      subscriptions: subscriptionState,
      summary: {
        total: subscriptionState.length,
        active: active.length,
        dormant: dormant.length,
        cancelled: cancelled.length,
        potential_monthly_savings: Math.round(potentialSavings * 100) / 100,
      },
    });
  } catch (error) {
    console.error("[Subscriptions]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch subscriptions",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sub_id, action } = body as { sub_id: string; action: "cancel" };

    if (!sub_id || action !== "cancel") {
      return NextResponse.json(
        { success: false, error: "Invalid request. Provide sub_id and action='cancel'" },
        { status: 400 }
      );
    }

    const subIndex = subscriptionState.findIndex((s) => s.sub_id === sub_id);
    if (subIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Subscription not found" },
        { status: 404 }
      );
    }

    // Update in-memory state
    subscriptionState[subIndex] = {
      ...subscriptionState[subIndex],
      status: "cancelled",
    };

    const monthlySaved = subscriptionState[subIndex].monthly_cost;

    return NextResponse.json({
      success: true,
      message: `Cancelled ${subscriptionState[subIndex].service_name}`,
      monthly_saved: monthlySaved,
      subscription: subscriptionState[subIndex],
    });
  } catch (error) {
    console.error("[Subscriptions Cancel]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to cancel subscription",
      },
      { status: 500 }
    );
  }
}
