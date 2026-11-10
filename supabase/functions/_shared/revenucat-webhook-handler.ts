import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Types ---

interface RevenueCatEvent {
  // イベントごとに一意。RevenueCat の再送は同じ id を使う
  id: string;
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
  // app_id は store が PROMOTIONAL のとき省かれる。金額と通貨は RevenueCat のドキュメントで
  // "Sometimes" (キー自体が無いこともある)。金額の null は不明、負数は返金
  app_id?: string;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  // CANCELLATION の理由 (UNSUBSCRIBE / BILLING_ERROR / CUSTOMER_SUPPORT など)
  cancel_reason?: string | null;
}

interface RevenueCatWebhookBody {
  api_version: string;
  event: RevenueCatEvent;
}

// --- Helpers ---

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function notifySlack(appName: string, message: string): Promise<void> {
  const url = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[${appName}] ${message}` }),
    });
  } catch {
    // Slack 通知失敗はサイレントに無視
  }
}

function msToISO(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

// RevenueCat の CANCELLATION は、自動更新の停止・支払いの失敗・返金のどれでも届く。
// - 返金: cancel_reason が CUSTOMER_SUPPORT か、金額が負 (どちらか片方でも返金とみなす)
// - 支払いの失敗: cancel_reason が BILLING_ERROR。BILLING_ISSUE と同じ支払いの失敗を表すので同じ状態を書く
//   (どちらが後に届いても past_due になるように)
// - それ以外 (UNSUBSCRIBE / PRICE_INCREASE / DEVELOPER_INITIATED / UNKNOWN / 理由なし): 自動更新の停止。
//   アクセスを外すのは EXPIRATION が届いたとき
type CancellationKind = "refund" | "billing_error" | "unsubscribe";

function cancellationKind(event: RevenueCatEvent): CancellationKind {
  if (event.cancel_reason === "CUSTOMER_SUPPORT" || (event.price_in_purchased_currency ?? 0) < 0) {
    return "refund";
  }
  if (event.cancel_reason === "BILLING_ERROR") return "billing_error";
  return "unsubscribe";
}

const CANCELLATION_LABELS: Record<CancellationKind, string> = {
  refund: "返金",
  billing_error: "支払い問題",
  unsubscribe: "解約予約",
};

// --- Billing Notification (運営者向けメール) ---

const EVENT_LABELS: Record<string, string> = {
  INITIAL_PURCHASE: "新規購入",
  RENEWAL: "更新",
  PRODUCT_CHANGE: "プラン変更",
  UNCANCELLATION: "解約取り消し",
  CANCELLATION: "解約予約",
  EXPIRATION: "失効",
  BILLING_ISSUE: "支払い問題",
};

const STORE_LABELS: Record<string, string> = {
  APP_STORE: "iOS",
  PLAY_STORE: "Android",
};

// RESEND_API_KEY と BILLING_NOTIFY_EMAIL が両方設定された環境でだけ送る。
// 送信失敗で webhook を 500 にすると RevenueCat が再送し、処理済みとして弾かれるだけなので握りつぶす。
async function notifyBillingEmail(appName: string, event: RevenueCatEvent): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("BILLING_NOTIFY_EMAIL");
  if (!apiKey || !to) return;

  const eventLabel =
    event.type === "CANCELLATION"
      ? CANCELLATION_LABELS[cancellationKind(event)]
      : (EVENT_LABELS[event.type] ?? event.type);
  const storeLabel = STORE_LABELS[event.store] ?? event.store ?? "不明";
  const sandboxPrefix = event.environment === "SANDBOX" ? "[SANDBOX] " : "";
  const price =
    event.price_in_purchased_currency != null
      ? `${event.price_in_purchased_currency} ${event.currency ?? ""}`.trim()
      : "-";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SwimHub <noreply@swim-hub.app>",
        to,
        // appName はデプロイ元の固定値で、複数アプリのイベントが同じ関数に届くとアプリを区別できない。
        // アプリは product_id と RevenueCat の app_id で見分ける
        subject: `${sandboxPrefix}【課金】[${storeLabel}] ${eventLabel} ${event.product_id}`,
        text: [
          `イベント: ${eventLabel} (${event.type})`,
          `ストア: ${storeLabel} (${event.store ?? "-"})`,
          `環境: ${event.environment}`,
          `ユーザーID: ${event.app_user_id}`,
          `商品: ${event.product_id}`,
          `RevenueCat app_id: ${event.app_id ?? "-"}`,
          `期間種別: ${event.period_type}`,
          ...(event.type === "CANCELLATION" ? [`解約理由: ${event.cancel_reason ?? "-"}`] : []),
          `金額: ${price}`,
          `有効期限 (UTC): ${msToISO(event.expiration_at_ms) ?? "-"}`,
          `transaction_id: ${event.transaction_id}`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[${appName}] Billing notify email failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[${appName}] Billing notify email error:`, err);
  }
}

// --- Auth ---

function verifyAuthorization(req: Request, expectedToken: string): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

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

// --- Idempotency ---

type IdempotencyResult = "ok" | "duplicate" | "error";

async function tryMarkAsProcessed(
  supabase: SupabaseClient,
  eventId: string,
  appName: string,
): Promise<IdempotencyResult> {
  try {
    const { error } = await supabase
      .from("processed_webhook_events")
      .insert({
        event_id: `rc_${eventId}`,
        processed_at: new Date().toISOString(),
      });

    if (error) {
      // 23505 = unique_violation → 既に処理済み
      if (error.code === "23505") return "duplicate";
      // その他のエラー（テーブル未存在含む）は処理を中断
      console.error(`[${appName}] tryMarkAsProcessed error:`, error);
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error(`[${appName}] tryMarkAsProcessed unexpected error:`, err);
    return "error";
  }
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
    // サンドボックス由来でも Premium 付与ロジックは変えない(App Store 審査員の購入は
    // SANDBOX として届くため)。ただし監査・失効判断のため取引環境は常に記録する。
    provider_environment: event.environment === "SANDBOX" ? "sandbox" : "production",
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

    case "CANCELLATION": {
      const kind = cancellationKind(event);
      if (kind === "billing_error") {
        return { ...base, plan: "premium", status: "past_due" };
      }
      // 返金、または期限が既に過ぎている (EXPIRATION の後に届いた) ときは、その場で無料に戻す
      if (
        kind === "refund" ||
        !event.expiration_at_ms ||
        event.expiration_at_ms <= Date.now()
      ) {
        return { ...base, plan: "free", status: "expired", cancel_at_period_end: false };
      }
      // 自動更新の停止。期間の終わりまで Premium のまま (Stripe の解約予約と同じ表し方)。
      // status を canceled にすると、status IN ('active','trialing') で判定する
      // checkIsPremium と使用量予約 RPC が即座に Premium を外してしまう
      return {
        ...base,
        plan: "premium",
        status: event.period_type === "TRIAL" ? "trialing" : "active",
        cancel_at_period_end: true,
      };
    }

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

// --- Factory ---

export function createRevenueCatWebhookHandler(appName: string) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }

      const webhookAuth = Deno.env.get("REVENUCAT_WEBHOOK_AUTH");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!webhookAuth || !supabaseUrl || !supabaseServiceRoleKey) {
        console.error(`[${appName}] Missing required environment variables`);
        return jsonResponse({ error: "Server configuration error" }, 500);
      }

      if (!verifyAuthorization(req, webhookAuth)) {
        console.error(`[${appName}] Invalid webhook authorization`);
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const body: RevenueCatWebhookBody = await req.json();
      const event = body.event;

      if (!event || !event.type) {
        return jsonResponse({ error: "Invalid webhook payload" }, 400);
      }

      console.log(`[${appName}] RevenueCat event: ${event.type} | user: ${event.app_user_id} | product: ${event.product_id} | env: ${event.environment}`);

      const userId = event.app_user_id;
      if (!userId || userId.startsWith("$RCAnonymousID:")) {
        console.error(`[${appName}] No valid user ID. app_user_id:`, userId);
        return jsonResponse(
          { error: "app_user_id is anonymous. Ensure Purchases.logIn(supabaseUserId) is called." },
          400,
        );
      }

      // event.environment はランタイムで検証されていない未知の値も届き得る。ここを
      // 通さずに mapEventToUpdate() へ渡すと、欠落・未知値がすべて "production" として
      // 記録され、監査・失効判断に使う provider_environment が汚染される。
      if (event.environment !== "PRODUCTION" && event.environment !== "SANDBOX") {
        console.error(`[${appName}] Invalid or missing event.environment:`, event.environment);
        return jsonResponse({ error: "Invalid or missing event.environment" }, 400);
      }

      // 重複判定のキーは event.id (RevenueCat の Webhooks ドキュメントが重複処理に使うよう勧めている)。
      // transaction_id はストアの取引 ID でイベントごとに一意ではなく、キーにすると別のイベントが処理済みとして捨てられうる
      if (typeof event.id !== "string" || event.id === "") {
        console.error(`[${appName}] Invalid or missing event.id:`, event.id);
        return jsonResponse({ error: "Invalid or missing event.id" }, 400);
      }

      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      // Idempotency check: at-most-once processing using event.id
      const idempotencyResult = await tryMarkAsProcessed(supabase, event.id, appName);
      if (idempotencyResult === "duplicate") {
        console.log(`[${appName}] Already processed event: ${event.id}`);
        return jsonResponse({ received: true, message: "Already processed" });
      }
      if (idempotencyResult === "error") {
        console.error(`[${appName}] Idempotency check failed for event: ${event.id}`);
        return jsonResponse({ error: "Idempotency check failed" }, 500);
      }

      if (event.type === "INITIAL_PURCHASE") {
        const hasStripe = await hasActiveStripeSubscription(supabase, userId);
        if (hasStripe) {
          console.error(`[${appName}] User already has active Stripe subscription:`, userId);
          return jsonResponse(
            { error: "User already has an active subscription via Stripe" },
            409,
          );
        }
      }

      const update = mapEventToUpdate(event);
      if (!update) {
        console.log(`[${appName}] Unhandled event type:`, event.type);
        return jsonResponse({ received: true, message: "Event not handled" });
      }

      const { error } = await supabase
        .from("user_subscriptions")
        .update(update)
        .eq("id", userId);

      if (error) {
        console.error(`[${appName}] Supabase update error (${event.type}):`, error);
        return jsonResponse({ error: "Failed to update subscription" }, 500);
      }

      console.log(`[${appName}] Successfully processed ${event.type} for user ${userId}`);
      await notifyBillingEmail(appName, event);
      return jsonResponse({ received: true });
    } catch (err) {
      console.error(`[${appName}] Unexpected error in revenucat-webhook:`, err);
      await notifySlack(appName, `RevenueCat Webhook error: ${err}`);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  };
}
