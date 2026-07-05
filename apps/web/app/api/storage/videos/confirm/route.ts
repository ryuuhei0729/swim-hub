/**
 * 動画アップロード確定 API
 * クライアントがR2への直接PUTを完了した後、サムネイルアップロード + DB更新を行う
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { uploadThumbnailToR2 } from "@/lib/r2-video";
import {
  authorizeRecordVideoMutation,
  authorizePracticeLogVideoMutation,
} from "@/lib/video-authz";
import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { localeFromReferer } from "@/i18n/routing";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { PREMIUM_ERROR_CODE } from "@swim-hub/shared/constants/premium";
import type { PremiumRequiredError } from "@swim-hub/shared/constants/premium";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Premium チェック（多層防御: presigned URL 発行後〜confirm の経路も弾く）
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
      const t = await getTranslations({
        locale: localeFromReferer(request.headers.get("referer")),
        namespace: "forms.premium",
      });
      const errorResponse: PremiumRequiredError = {
        error: PREMIUM_ERROR_CODE,
        message: t("videoUpload"),
        feature: "video_upload",
      };
      return NextResponse.json(errorResponse, { status: 403 });
    }

    const formData = await request.formData();
    const type = formData.get("type") as "record" | "practice-log" | null;
    const id = formData.get("id") as string | null;
    const videoPath = formData.get("videoPath") as string | null;
    const thumbnailPathRaw = formData.get("thumbnailPath") as string | null;
    // 空文字はサムネイル生成失敗を意味する — null として扱う
    const thumbnailPath = thumbnailPathRaw && thumbnailPathRaw.length > 0 ? thumbnailPathRaw : null;
    const thumbnailBlob = formData.get("thumbnailBlob") as File | null;

    if (!type || !id || !videoPath) {
      return NextResponse.json({ error: "type, id, videoPath が必要です" }, { status: 400 });
    }

    // 所有者確認（本人 OR 当該チームの active admin による代理）
    const authz =
      type === "record"
        ? await authorizeRecordVideoMutation(supabase, id, user.id)
        : await authorizePracticeLogVideoMutation(supabase, id, user.id);

    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    // サムネイルをR2にアップロード（Workers バインディング経由）
    // thumbnailPath が null の場合はサムネイル生成失敗を意味するのでスキップ
    if (thumbnailBlob && thumbnailPath) {
      const buffer = Buffer.from(await thumbnailBlob.arrayBuffer());
      await uploadThumbnailToR2(buffer, thumbnailPath);
    }

    // DB更新
    // RLS-bound クライアントで更新するため、RLS 不一致 (例: practice_logs の代理
    // UPDATE ポリシー未整備) では 0 行更新・エラー無しになり得る。.select() で
    // 影響行数を取得し、0 行なら loud に失敗させる (無音 false-success を防ぐ)。
    if (type === "record") {
      const { data, error } = await supabase
        .from("records")
        .update({ video_path: videoPath, video_thumbnail_path: thumbnailPath })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("記録DB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
      if (!data || data.length === 0) {
        console.error("記録DB更新が0行: RLS不一致または対象不在", { id });
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    } else {
      const { data, error } = await supabase
        .from("practice_logs")
        .update({ video_path: videoPath, video_thumbnail_path: thumbnailPath })
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("練習ログDB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
      if (!data || data.length === 0) {
        console.error("練習ログDB更新が0行: RLS不一致または対象不在", { id });
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("動画アップロード確定エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
