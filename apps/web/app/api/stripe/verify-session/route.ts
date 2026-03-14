import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-auth/server";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe Checkout Session を検証し、user_subscriptions を更新する
 * Webhook が届かない場合（ローカル開発等）のフォールバック
 * 本番でも Webhook の遅延対策として有効
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 認証チェック
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 2. session_id を取得
    const body = await request.json();
    const { sessionId } = body as { sessionId: string };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId は必須です" }, { status: 400 });
    }

    // 3. Stripe から Checkout Session を取得
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // 4. セッションの検証
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return NextResponse.json({ error: "支払いが完了していません" }, { status: 400 });
    }

    // 5. Subscription 情報を取得
    const subscription = session.subscription;
    if (!subscription || typeof subscription === "string") {
      // expand しているので object のはず。string の場合は再取得
      const subId = typeof subscription === "string" ? subscription : null;
      if (!subId) {
        return NextResponse.json({ error: "サブスクリプションが見つかりません" }, { status: 400 });
      }
      const sub = await stripe.subscriptions.retrieve(subId);
      return await updateSubscription(supabase, user.id, sub);
    }

    return await updateSubscription(supabase, user.id, subscription);
  } catch (error) {
    console.error("Stripe Session 検証エラー:", error);
    return NextResponse.json(
      { error: "セッションの検証に失敗しました" },
      { status: 500 },
    );
  }
}

function unixToISO(ts: number | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

async function updateSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subscription: { id: string; status: string; current_period_start: number; current_period_end: number; cancel_at_period_end: boolean; trial_start: number | null; trial_end: number | null },
) {
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
    console.error("Supabase update error:", error);
    return NextResponse.json({ error: "サブスクリプションの更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    plan: "premium",
    status,
  });
}
