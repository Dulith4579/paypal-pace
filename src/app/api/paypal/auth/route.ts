// ============================================================
// PayPal Pace – PayPal OAuth2 Token Manager Route
// ============================================================
// POST /api/paypal/auth
// Returns a fresh or cached access token for client-side use.
// ============================================================

import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/paypal-client";

export async function POST() {
  try {
    const accessToken = await getAccessToken();

    return NextResponse.json({
      success: true,
      access_token: accessToken,
      // Don't expose the full token lifetime to the client
      message: "Token acquired successfully",
    });
  } catch (error) {
    console.error("[PayPal Auth]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to acquire PayPal token",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Use POST to acquire a token",
    },
    { status: 405 }
  );
}
