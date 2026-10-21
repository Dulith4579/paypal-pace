// ============================================================
// PayPal Pace – Orders API Route
// ============================================================
// POST /api/paypal/orders       – Create a new sandbox order
// PATCH /api/paypal/orders      – Capture an approved order
// GET /api/paypal/orders?id=xxx – Get order details
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createOrder, captureOrder, getOrderDetails } from "@/lib/paypal-client";
import type { CreateOrderRequest } from "@/types/paypal";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, description, currency = "USD" } = body as {
      amount: number;
      description?: string;
      currency?: string;
    };

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount" },
        { status: 400 }
      );
    }

    const orderRequest: CreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `pace-${Date.now()}`,
          description: description || "PayPal Pace Checkout",
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "PayPal Pace",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${BASE_URL}/api/paypal/orders?action=return`,
        cancel_url: `${BASE_URL}/api/paypal/orders?action=cancel`,
      },
    };

    const order = await createOrder(orderRequest);

    return NextResponse.json({
      success: true,
      order_id: order.id,
      status: order.status,
      links: order.links,
      approve_url: order.links?.find((l) => l.rel === "approve")?.href,
    });
  } catch (error) {
    console.error("[PayPal Orders – Create]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create order",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id } = body as { order_id: string };

    if (!order_id) {
      return NextResponse.json(
        { success: false, error: "Missing order_id" },
        { status: 400 }
      );
    }

    const capturedOrder = await captureOrder(order_id);

    return NextResponse.json({
      success: true,
      order_id: capturedOrder.id,
      status: capturedOrder.status,
    });
  } catch (error) {
    console.error("[PayPal Orders – Capture]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to capture order",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("id");
    const action = searchParams.get("action");

    // Handle return/cancel redirects from PayPal
    if (action === "return") {
      return NextResponse.redirect(`${BASE_URL}/?payment=success`);
    }
    if (action === "cancel") {
      return NextResponse.redirect(`${BASE_URL}/?payment=cancelled`);
    }

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Missing order id parameter" },
        { status: 400 }
      );
    }

    const order = await getOrderDetails(orderId);

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("[PayPal Orders – Get]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get order details",
      },
      { status: 500 }
    );
  }
}
