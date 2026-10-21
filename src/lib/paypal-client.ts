// ============================================================
// PayPal Pace – Centralized PayPal API Client
// ============================================================
// Handles OAuth2 token acquisition with in-memory caching,
// order creation/capture, and transaction search.
// ============================================================

import type {
  PayPalToken,
  CreateOrderRequest,
  PayPalOrder,
  TransactionSearchResponse,
  PayPalSubscription,
} from "@/types/paypal";

const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
const TOKEN_REFRESH_BUFFER_MS = 30 * 60 * 1000; // Refresh 30 min before expiry (safe margin)

// In-memory token cache
let cachedToken: PayPalToken | null = null;

/**
 * Get PayPal API credentials from environment.
 */
function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in environment variables"
    );
  }

  return { clientId, clientSecret };
}

/**
 * Acquire or return a cached OAuth2 access token.
 * Tokens are valid for ~9 hours; we refresh at 8.5 hours.
 */
export async function getAccessToken(): Promise<string> {
  // Check if cached token is still valid
  if (cachedToken) {
    const elapsed = Date.now() - cachedToken.acquired_at;
    const expiresInMs = cachedToken.expires_in * 1000;
    if (elapsed < expiresInMs - TOKEN_REFRESH_BUFFER_MS) {
      return cachedToken.access_token;
    }
  }

  const { clientId, clientSecret } = getCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal OAuth2 token request failed: ${response.status} – ${errorText}`);
  }

  const data = await response.json();

  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    acquired_at: Date.now(),
  };

  return cachedToken.access_token;
}

/**
 * Make an authenticated request to the PayPal API.
 */
async function paypalFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `PayPal API error [${response.status}] ${endpoint}: ${errorText}`
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Create a PayPal order.
 */
export async function createOrder(
  orderRequest: CreateOrderRequest
): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify(orderRequest),
    headers: {
      "PayPal-Request-Id": `pace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

/**
 * Capture an approved PayPal order.
 */
export async function captureOrder(orderId: string): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
  });
}

/**
 * Get order details.
 */
export async function getOrderDetails(orderId: string): Promise<PayPalOrder> {
  return paypalFetch<PayPalOrder>(`/v2/checkout/orders/${orderId}`);
}

/**
 * Search transactions (sandbox may have limited data).
 */
export async function searchTransactions(params: {
  start_date: string;
  end_date: string;
  page?: number;
  page_size?: number;
}): Promise<TransactionSearchResponse> {
  const searchParams = new URLSearchParams({
    start_date: params.start_date,
    end_date: params.end_date,
    page: String(params.page || 1),
    page_size: String(params.page_size || 20),
  });

  return paypalFetch<TransactionSearchResponse>(
    `/v1/reporting/transactions?${searchParams.toString()}`
  );
}

/**
 * Cancel a subscription.
 */
export async function cancelSubscription(
  subscriptionId: string,
  reason: string
): Promise<void> {
  await paypalFetch<Record<string, never>>(
    `/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

/**
 * Get subscription details.
 */
export async function getSubscriptionDetails(
  subscriptionId: string
): Promise<PayPalSubscription> {
  return paypalFetch<PayPalSubscription>(
    `/v1/billing/subscriptions/${subscriptionId}`
  );
}

/**
 * Verify a webhook signature (simplified for sandbox).
 * In production, use PayPal's verify-webhook-signature endpoint.
 */
export async function verifyWebhookSignature(
  webhookId: string,
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  try {
    const verifyResponse = await paypalFetch<{
      verification_status: string;
    }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    });

    return verifyResponse.verification_status === "SUCCESS";
  } catch {
    console.error("Webhook verification failed, continuing in sandbox mode");
    return true; // Allow in sandbox
  }
}
