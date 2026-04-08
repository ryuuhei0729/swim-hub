import { NextRequest, NextResponse } from "next/server";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { verifyAuth } from "@/lib/api-helpers";

function getTodayJST(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstDate = new Date(now.getTime() + jstOffset);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { auth, supabase } = authResult.result;

    const { data: subscription, error: subError } = (await supabase
      .from("user_subscriptions")
      .select("plan, status, cancel_at_period_end, premium_expires_at, trial_end")
      .eq("id", auth.uid)
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
      console.error("サブスクリプション取得エラー:", subError);
      return NextResponse.json(
        { error: "サブスクリプション情報の取得に失敗しました" },
        { status: 500 },
      );
    }

    // 行が存在しない場合は free で作成
    let sub = subscription;
    if (!sub && subError?.code === "PGRST116") {
      const { data: newRow } = await supabase
        .from("user_subscriptions")
        .insert({ id: auth.uid })
        .select("plan, status, cancel_at_period_end, premium_expires_at, trial_end")
        .single();
      if (newRow) {
        sub = newRow as typeof subscription;
      }
    }

    const plan = (sub?.plan as "free" | "premium") ?? "free";
    const status = sub?.status ?? null;
    const cancelAtPeriodEnd = sub?.cancel_at_period_end ?? false;
    const premiumExpiresAt = sub?.premium_expires_at ?? null;
    const trialEnd = sub?.trial_end ?? null;

    const todayJST = getTodayJST();

    const { data: usageData, error: usageError } = (await supabase
      .from("app_daily_usage")
      .select("daily_tokens_used")
      .eq("user_id", auth.uid)
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
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("サブスクリプションステータスエラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
