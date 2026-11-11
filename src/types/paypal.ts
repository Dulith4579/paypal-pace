// ============================================================
// PayPal Pace – PayPal API Types
// ============================================================

/** Cached OAuth2 access token */
export interface PayPalToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Timestamp (ms) when the token was acquired */
  acquired_at: number;
}

/** PayPal Order creation request */
export interface CreateOrderRequest {
  intent: "CAPTURE" | "AUTHORIZE";
  purchase_units: PurchaseUnit[];
  application_context?: ApplicationContext;
  payment_source?: {
    card?: { number: string; expiry: string; security_code: string; name: string };
  };
}

export interface PurchaseUnit {
  reference_id?: string;
  description?: string;
  amount: {
    currency_code: string;
    value: string;
    breakdown?: {
      item_total?: MoneyValue;
      shipping?: MoneyValue;
      tax_total?: MoneyValue;
    };
  };
  items?: OrderItem[];
  custom_id?: string;
  payments?: { captures?: { id: string; status: string }[] };
}

export interface MoneyValue {
  currency_code: string;
  value: string;
}

export interface OrderItem {
  name: string;
  quantity: string;
  unit_amount: MoneyValue;
  description?: string;
  category?: "DIGITAL_GOODS" | "PHYSICAL_GOODS" | "DONATION";
}

export interface ApplicationContext {
  brand_name?: string;
  locale?: string;
  landing_page?: "LOGIN" | "BILLING" | "NO_PREFERENCE";
  user_action?: "CONTINUE" | "PAY_NOW";
  return_url?: string;
  cancel_url?: string;
}

/** PayPal Order response */
export interface PayPalOrder {
  id: string;
  status:
    | "CREATED"
    | "SAVED"
    | "APPROVED"
    | "VOIDED"
    | "COMPLETED"
    | "PAYER_ACTION_REQUIRED";
  links: PayPalLink[];
  purchase_units?: PurchaseUnit[];
  create_time?: string;
  update_time?: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method: string;
}

/** PayPal Webhook event envelope */
export interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: PayPalWebhookResource;
}

export interface PayPalWebhookResource {
  id: string;
  amount?: MoneyValue;
  status?: string;
  custom_id?: string;
  supplementary_data?: Record<string, unknown>;
  [key: string]: unknown;
}

/** PayPal Subscription / Billing Plan types */
export interface PayPalBillingPlan {
  id: string;
  product_id: string;
  name: string;
  description?: string;
  status: "ACTIVE" | "INACTIVE" | "CREATED";
  billing_cycles: BillingCycle[];
}

export interface BillingCycle {
  frequency: {
    interval_unit: "DAY" | "WEEK" | "MONTH" | "YEAR";
    interval_count: number;
  };
  tenure_type: "REGULAR" | "TRIAL";
  sequence: number;
  total_cycles: number;
  pricing_scheme: {
    fixed_price: MoneyValue;
  };
}

export interface PayPalSubscription {
  id: string;
  plan_id: string;
  status: "APPROVAL_PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
  status_update_time?: string;
  start_time: string;
  subscriber?: {
    name?: { given_name: string; surname: string };
    email_address?: string;
  };
}

/** Transaction search response */
export interface TransactionSearchResponse {
  transaction_details: TransactionDetail[];
  total_items: number;
  total_pages: number;
}

export interface TransactionDetail {
  transaction_info: {
    transaction_id: string;
    transaction_event_code: string;
    transaction_initiation_date: string;
    transaction_amount: MoneyValue;
    transaction_status: string;
  };
  payer_info?: {
    email_address?: string;
    payer_name?: { given_name?: string; surname?: string };
  };
  cart_info?: {
    item_details?: Array<{
      item_name?: string;
      item_quantity?: string;
      item_unit_price?: MoneyValue;
    }>;
  };
}
