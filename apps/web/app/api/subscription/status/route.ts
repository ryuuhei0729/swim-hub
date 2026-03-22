import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-auth/server";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";

/**
 * 今日の日付を JST (Asia/Tokyo) で YYYY-MM-DD 形式で返す
 */
function getTodayJST(): string {
  const now = new Date();
  // JST = UTC + 9時間
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstDate = new Date(now.getTime() + jstOffset);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET() {
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

    // 2. user_subscriptions から取得
    const { data: subscription, error: subError } = (await supabase
      .from("user_subscriptions")
      .select("plan, status, cancel_at_period_end, premium_expires_at, trial_end")
      .eq("id", user.id)
      .single()) as {
      data: {
        plan: string;
        status: string | null;
        cancel_at_period_end: boolean | null;
        premium_expires_at: string | null;
        trial_end: string | null;
      } | null;
      error: { code?: string; message?: string } | null;
    };

    if (subError && subError.code !== "PGRST116") {
      // PGRST116 = "no rows found" は正常（未登録ユーザー）
      console.error("サブスクリプション取得エラー:", subError);
      return NextResponse.json(
        { error: "サブスクリプション情報の取得に失敗しました" },
        { status: 500 },
      );
    }

    const plan = (subscription?.plan as "free" | "premium") ?? "free";
    const status = subscription?.status ?? null;
    const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;
    const premiumExpiresAt = subscription?.premium_expires_at ?? null;
    const trialEnd = subscription?.trial_end ?? null;

    // 3. app_daily_usage から今日の全アプリ合計 daily_tokens_used を取得
    const todayJST = getTodayJST();

    const { data: usageData, error: usageError } = (await supabase
      .from("app_daily_usage")
      .select("daily_tokens_used")
      .eq("user_id", user.id)
      .eq("usage_date", todayJST)) as {
      data: { daily_tokens_used: number }[] | null;
      error: { message?: string } | null;
    };

    if (usageError) {
      console.error("使用量取得エラー:", usageError);
      return NextResponse.json({ error: "使用量情報の取得に失敗しました" }, { status: 500 });
    }

    const tokensUsedToday = (usageData ?? []).reduce(
      (sum, row) => sum + (row.daily_tokens_used ?? 0),
      0,
    );

    // 4. レスポンス
    return NextResponse.json(
      {
        plan,
        status,
        cancelAtPeriodEnd,
        premiumExpiresAt,
        trialEnd,
        tokensUsedToday,
        tokensRemaining: plan === "premium" ? null : FREE_PLAN_LIMITS.DAILY_TOKEN_LIMIT - tokensUsedToday,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (error) {
    console.error("サブスクリプションステータスエラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
