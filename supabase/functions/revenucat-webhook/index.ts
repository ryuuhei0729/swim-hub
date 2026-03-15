import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Types ---

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id: string;
  entitlement_ids: string[];
  period_type: "TRIAL" | "NORMAL" | "INTRO";
  purchased_at_ms: number;
  expiration_at_ms: number | null;
  store: "APP_STORE" | "PLAY_STORE" | "STRIPE" | "PROMOTIONAL";
  environment: "PRODUCTION" | "SANDBOX";
  original_transaction_id: string;
  transaction_id: string;
}

interface RevenueCatWebhookBody {
  api_version: string;
  event: RevenueCatEvent;
}

// --- Helpers ---

type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function msToISO(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

// --- Auth ---

function verifyAuthorization(req: Request, expectedToken: string): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  // Constant-time comparison
  const expected = `Bearer ${expectedToken}`;
  if (authHeader.length !== expected.length) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(authHeader);
  const b = encoder.encode(expected);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// --- Duplicate Subscription Check ---

async function hasActiveStripeSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("provider, status")
    .eq("id", userId)
    .single();

  if (
    data?.provider === "stripe" &&
    (data.status === "active" || data.status === "trialing")
  ) {
    return true;
  }
  return false;
}

// --- Event Mapping ---

function mapEventToUpdate(event: RevenueCatEvent): Record<string, unknown> | null {
  const base = {
    provider: "revenucat",
    provider_subscription_id: event.original_transaction_id,
    premium_expires_at: msToISO(event.expiration_at_ms),
    current_period_start: msToISO(event.purchased_at_ms),
    updated_at: new Date().toISOString(),
  };

  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
      return {
        ...base,
        plan: "premium",
        status: event.period_type === "TRIAL" ? "trialing" : "active",
        trial_start: event.period_type === "TRIAL" ? msToISO(event.purchased_at_ms) : null,
        trial_end: event.period_type === "TRIAL" ? msToISO(event.expiration_at_ms) : null,
        cancel_at_period_end: false,
      };

    case "CANCELLATION":
      return {
        ...base,
        plan: "premium",
        status: "canceled",
        cancel_at_period_end: true,
      };

    case "EXPIRATION":
      return {
        ...base,
        plan: "free",
        status: "expired",
        cancel_at_period_end: false,
      };

    case "BILLING_ISSUE":
      return {
        ...base,
        plan: "premium",
        status: "past_due",
      };

    default:
      return null;
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Environment variables
    const webhookAuth = Deno.env.get("REVENUCAT_WEBHOOK_AUTH");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!webhookAuth || !supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing required environment variables");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // Verify authorization
    if (!verifyAuthorization(req, webhookAuth)) {
      console.error("Invalid webhook authorization");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Parse body
    const body: RevenueCatWebhookBody = await req.json();
    const event = body.event;

    if (!event || !event.type) {
      return jsonResponse({ error: "Invalid webhook payload" }, 400);
    }

    console.log(`RevenueCat event: ${event.type} | user: ${event.app_user_id} | product: ${event.product_id} | env: ${event.environment}`);

    // Skip sandbox events in production (optional: remove if you want to process sandbox)
    // if (event.environment === "SANDBOX") {
    //   return jsonResponse({ received: true, message: "Sandbox event skipped" });
    // }

    // Resolve user ID
    const userId = event.app_user_id;
    if (!userId || userId.startsWith("$RCAnonymousID:")) {
      console.error("No valid user ID. app_user_id:", userId);
      return jsonResponse(
        { error: "app_user_id is anonymous. Ensure Purchases.logIn(supabaseUserId) is called." },
        400,
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Duplicate subscription check for initial purchase
    if (event.type === "INITIAL_PURCHASE") {
      const hasStripe = await hasActiveStripeSubscription(supabase, userId);
      if (hasStripe) {
        console.error("User already has active Stripe subscription:", userId);
        return jsonResponse(
          { error: "User already has an active subscription via Stripe" },
          409,
        );
      }
    }

    // Map event to DB update
    const update = mapEventToUpdate(event);
    if (!update) {
      console.log("Unhandled event type:", event.type);
      return jsonResponse({ received: true, message: "Event not handled" });
    }

    // Update user_subscriptions
    const { error } = await supabase
      .from("user_subscriptions")
      .update(update)
      .eq("id", userId);

    if (error) {
      console.error(`Supabase update error (${event.type}):`, error);
      return jsonResponse({ error: "Failed to update subscription" }, 500);
    }

    console.log(`Successfully processed ${event.type} for user ${userId}`);
    return jsonResponse({ received: true });
  } catch (err) {
    console.error("Unexpected error in revenucat-webhook:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
