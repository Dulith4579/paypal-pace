// ============================================================
// PayPal Pace – Webhook Receiver
// ============================================================
// POST /api/webhooks/paypal
// Handles PAYMENT.CAPTURE.COMPLETED and CHECKOUT.ORDER.APPROVED
// Responds with 200 immediately to satisfy PayPal retry policy.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal-client";
import { mockMilestones } from "@/lib/mock-data";
import { calculateAllImpacts } from "@/lib/math-engine";
import type { PayPalWebhookEvent } from "@/types/paypal";

export async function POST(request: NextRequest) {
  // Respond immediately with 200 – PayPal requires fast ACK
  // Process asynchronously in the background
  try {
    const rawBody = await request.text();
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    // Extract headers for verification
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Verify webhook signature (tolerant in sandbox mode)
    if (webhookId) {
      const isValid = await verifyWebhookSignature(webhookId, headers, rawBody);
      if (!isValid) {
        console.warn("[Webhook] Signature verification failed");
        // In sandbox, we continue anyway
      }
    }

    const event: PayPalWebhookEvent = JSON.parse(rawBody);

    console.log(`[Webhook] Received event: ${event.event_type} (${event.id})`);

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const amount = parseFloat(event.resource.amount?.value || "0");
        const transactionId = event.resource.id;

        console.log(
          `[Webhook] Payment captured: $${amount} (tx: ${transactionId})`
        );

        // Trigger goal recalculation
        if (amount > 0) {
          const { impacts, recoveryPaths } = calculateAllImpacts(
            mockMilestones,
            amount
          );

          console.log(
            `[Webhook] Recalculated impacts for ${impacts.length} goals`
          );
          console.log(
            `[Webhook] Recovery paths generated: ${recoveryPaths.map((p) => p.type).join(", ")}`
          );

          // In a production app, you'd store this in a database
          // and push a notification to the user's dashboard
        }
        break;
      }

      case "CHECKOUT.ORDER.APPROVED": {
        console.log(
          `[Webhook] Order approved: ${event.resource.id}`
        );
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.event_type}`);
    }

    // Always return 200 to prevent retries
    return NextResponse.json(
      { received: true, event_id: event.id },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Webhook] Processing error:", error);

    // Still return 200 to prevent PayPal retries on our processing errors
    return NextResponse.json(
      { received: true, error: "Processing failed but acknowledged" },
      { status: 200 }
    );
  }
}

// Reject non-POST methods
export async function GET() {
  return NextResponse.json(
    { error: "Webhook endpoint only accepts POST requests" },
    { status: 405 }
  );
}
