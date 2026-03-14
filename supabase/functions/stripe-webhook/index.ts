import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Stripe Signature Verification (crypto.subtle for Deno) ---

function parseSignatureHeader(header: string): { timestamp: string; signatures: string[] } {
  const parts = header.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key.trim() === "t") {
      timestamp = value.trim();
    } else if (key.trim() === "v1") {
      signatures.push(value.trim());
    }
  }

  return { timestamp, signatures };
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  // Reject if timestamp is older than 5 minutes
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (timestampAge > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSignature = uint8ArrayToHex(new Uint8Array(signatureBuffer));

  // Constant-time comparison via matching against all provided v1 signatures
  return signatures.some((sig) => {
    if (sig.length !== expectedSignature.length) return false;
    const a = hexToUint8Array(sig);
    const b = hexToUint8Array(expectedSignature);
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  });
}

// --- Helpers ---

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function unixToISO(ts: number | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

async function resolveUserId(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  // First, check subscription metadata
  const subUserId = subscription.metadata?.supabase_user_id;
  if (subUserId) return subUserId;

  // Fallback: fetch customer and check its metadata
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer as Stripe.Customer).metadata?.supabase_user_id ?? null;
  } catch (err) {
    console.error("Failed to retrieve Stripe customer:", err);
    return null;
  }
}

// --- Event Handlers ---

type SupabaseClient = ReturnType<typeof createClient>;

async function handleSubscriptionCreated(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<Response> {
  const userId = await resolveUserId(stripe, subscription);
  if (!userId) {
    console.error("No supabase_user_id found for subscription:", subscription.id);
    return jsonResponse({ error: "User ID not found in subscription or customer metadata" }, 400);
  }

  const status = subscription.status === "trialing" ? "trialing" : "active";

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan: "premium",
      status,
      provider: "stripe",
      provider_subscription_id: subscription.id,
      premium_expires_at: unixToISO(subscription.current_period_end),
      current_period_start: unixToISO(subscription.current_period_start),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_start: unixToISO(subscription.trial_start),
      trial_end: unixToISO(subscription.trial_end),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Supabase update error (subscription.created):", error);
    return jsonResponse({ error: "Failed to update subscription" }, 500);
  }

  return jsonResponse({ received: true });
}

async function handleSubscriptionUpdated(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<Response> {
  const userId = await resolveUserId(stripe, subscription);
  if (!userId) {
    console.error("No supabase_user_id found for subscription:", subscription.id);
    return jsonResponse({ error: "User ID not found in subscription or customer metadata" }, 400);
  }

  // Determine plan: if status is 'canceled' and period has ended, revert to free
  let plan = "premium";
  let status = subscription.status as string;

  if (subscription.status === "canceled") {
    // Subscription fully canceled — revert to free
    plan = "free";
    status = "expired";
  } else if (subscription.status === "trialing") {
    status = "trialing";
  } else if (subscription.status === "active") {
    status = "active";
  } else if (subscription.status === "past_due") {
    status = "past_due";
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan,
      status,
      provider: "stripe",
      provider_subscription_id: subscription.id,
      premium_expires_at: unixToISO(subscription.current_period_end),
      current_period_start: unixToISO(subscription.current_period_start),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_start: unixToISO(subscription.trial_start),
      trial_end: unixToISO(subscription.trial_end),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Supabase update error (subscription.updated):", error);
    return jsonResponse({ error: "Failed to update subscription" }, 500);
  }

  return jsonResponse({ received: true });
}

async function handleSubscriptionDeleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<Response> {
  const userId = await resolveUserId(stripe, subscription);
  if (!userId) {
    console.error("No supabase_user_id found for subscription:", subscription.id);
    return jsonResponse({ error: "User ID not found in subscription or customer metadata" }, 400);
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan: "free",
      status: "expired",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Supabase update error (subscription.deleted):", error);
    return jsonResponse({ error: "Failed to update subscription" }, 500);
  }

  return jsonResponse({ received: true });
}

async function handleInvoicePaymentSucceeded(
  supabase: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<Response> {
  // invoice.subscription can be a string ID or expanded object
  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  if (!subscriptionId) {
    // Not a subscription invoice (e.g., one-off), skip
    return jsonResponse({ received: true, message: "Non-subscription invoice, skipped" });
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error("Failed to retrieve subscription for invoice:", err);
    return jsonResponse({ error: "Failed to retrieve subscription" }, 500);
  }

  const userId = await resolveUserId(stripe, subscription);
  if (!userId) {
    console.error("No supabase_user_id found for invoice subscription:", subscriptionId);
    return jsonResponse({ error: "User ID not found" }, 400);
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "active",
      current_period_start: unixToISO(subscription.current_period_start),
      premium_expires_at: unixToISO(subscription.current_period_end),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Supabase update error (invoice.payment_succeeded):", error);
    return jsonResponse({ error: "Failed to update subscription" }, 500);
  }

  return jsonResponse({ received: true });
}

async function handleInvoicePaymentFailed(
  supabase: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<Response> {
  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  if (!subscriptionId) {
    return jsonResponse({ received: true, message: "Non-subscription invoice, skipped" });
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error("Failed to retrieve subscription for invoice:", err);
    return jsonResponse({ error: "Failed to retrieve subscription" }, 500);
  }

  const userId = await resolveUserId(stripe, subscription);
  if (!userId) {
    console.error("No supabase_user_id found for invoice subscription:", subscriptionId);
    return jsonResponse({ error: "User ID not found" }, 400);
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Supabase update error (invoice.payment_failed):", error);
    return jsonResponse({ error: "Failed to update subscription" }, 500);
  }

  return jsonResponse({ received: true });
}

// --- Main Handler ---

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only accept POST
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Environment variables
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!webhookSecret || !stripeSecretKey || !supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing required environment variables");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // Read raw body for signature verification
    const body = await req.text();

    // Verify Stripe signature
    const signatureHeader = req.headers.get("stripe-signature");
    if (!signatureHeader) {
      return jsonResponse({ error: "Missing stripe-signature header" }, 401);
    }

    const isValid = await verifyStripeSignature(body, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid Stripe webhook signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    // Parse event
    const event: Stripe.Event = JSON.parse(body);

    // Initialize clients
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Route events
    switch (event.type) {
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        return await handleSubscriptionCreated(supabase, stripe, subscription);
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        return await handleSubscriptionUpdated(supabase, stripe, subscription);
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        return await handleSubscriptionDeleted(supabase, stripe, subscription);
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        return await handleInvoicePaymentSucceeded(supabase, stripe, invoice);
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        return await handleInvoicePaymentFailed(supabase, stripe, invoice);
      }

      default:
        console.log("Unhandled event type:", event.type);
        return jsonResponse({ received: true, message: "Event not handled" });
    }
  } catch (err) {
    console.error("Unexpected error in stripe-webhook:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
