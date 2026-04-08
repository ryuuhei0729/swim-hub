/**
 * 動画アップロード用署名付きPUT URL発行 API
 * クライアントがR2へ直接PUT する前に呼び出す
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { generateVideoPutUrl, isVideoR2Enabled } from "@/lib/r2-video";
import { NextRequest, NextResponse } from "next/server";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { PREMIUM_ERROR_CODE, PREMIUM_MESSAGES } from "@swim-hub/shared/constants/premium";
import type { PremiumRequiredError } from "@swim-hub/shared/constants/premium";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Premium チェック
    const { data: subscriptionData } = await supabase
      .from("user_subscriptions")
      .select("plan, status, cancel_at_period_end, premium_expires_at, trial_end")
      .eq("id", user.id)
      .single();

    const subscription = subscriptionData
      ? {
          plan: subscriptionData.plan as "free" | "premium",
          status: subscriptionData.status as import("@swim-hub/shared/types/auth").SubscriptionStatus | null,
          cancelAtPeriodEnd: subscriptionData.cancel_at_period_end ?? false,
          premiumExpiresAt: subscriptionData.premium_expires_at ?? null,
          trialEnd: subscriptionData.trial_end ?? null,
        }
      : null;

    if (!checkIsPremium(subscription)) {
      const errorResponse: PremiumRequiredError = {
        error: PREMIUM_ERROR_CODE,
        message: PREMIUM_MESSAGES.video_upload,
        feature: "video_upload",
      };
      return NextResponse.json(errorResponse, { status: 403 });
    }

    const body = await request.json() as { type: "record" | "practice-log"; id: string; contentType: string };
    const { type, id, contentType } = body;

    if (!type || !id || !contentType) {
      return NextResponse.json({ error: "type, id, contentType が必要です" }, { status: 400 });
    }

    if (!["record", "practice-log"].includes(type)) {
      return NextResponse.json({ error: "type は record または practice-log である必要があります" }, { status: 400 });
    }

    if (!["video/mp4", "video/quicktime"].includes(contentType)) {
      return NextResponse.json({ error: "対応していないコンテンツタイプです" }, { status: 400 });
    }

    if (!isVideoR2Enabled()) {
      return NextResponse.json({ error: "動画機能は現在利用できません" }, { status: 503 });
    }

    // 所有者確認
    if (type === "record") {
      const { data: record, error } = await supabase
        .from("records")
        .select("id, user_id, video_path, video_thumbnail_path")
        .eq("id", id)
        .single();

      if (error || !record) {
        return NextResponse.json({ error: "記録が見つかりません" }, { status: 404 });
      }
      if (record.user_id !== user.id) {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    } else {
      const { data: log, error } = await supabase
        .from("practice_logs")
        .select("id, user_id, video_path, video_thumbnail_path")
        .eq("id", id)
        .single();

      if (error || !log) {
        return NextResponse.json({ error: "練習ログが見つかりません" }, { status: 404 });
      }
      if (log.user_id !== user.id) {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    // R2 パス生成
    const prefix = type === "record" ? "records" : "practice-logs";
    const videoPath = `videos/${user.id}/${prefix}/${id}.mp4`;
    const thumbnailPath = `thumbnails/${user.id}/${prefix}/${id}.webp`;

    const videoUploadUrl = await generateVideoPutUrl(videoPath, contentType);
    const thumbnailUploadUrl = await generateVideoPutUrl(thumbnailPath, "image/webp");

    return NextResponse.json({
      videoUploadUrl,
      thumbnailUploadUrl,
      videoPath,
      thumbnailPath,
    });
  } catch (error) {
    console.error("動画アップロードURL発行エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
