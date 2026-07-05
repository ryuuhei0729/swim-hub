/**
 * チーム管理者による動画アサイン API
 * 管理者が一時アップロードした動画をメンバーのパスに移動する
 */
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { copyVideoInR2, deleteVideosFromR2 } from "@/lib/r2-video";
import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { localeFromReferer } from "@/i18n/routing";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { PREMIUM_ERROR_CODE } from "@swim-hub/shared/constants/premium";
import type { PremiumRequiredError } from "@swim-hub/shared/constants/premium";

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const supabase = await createAuthenticatedServerClient();

    // Premium チェック（多層防御: team-assign 経由でも操作者=コーチの Premium を要求）
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

    const body = await request.json() as {
      type: "record" | "practice-log";
      sourceId: string;
      targetUserId: string;
      teamId: string;
      tempVideoPath: string;
      tempThumbnailPath: string;
    };

    const { type, sourceId, targetUserId, teamId, tempVideoPath, tempThumbnailPath } = body;

    if (!type || !sourceId || !targetUserId || !teamId || !tempVideoPath || !tempThumbnailPath) {
      return NextResponse.json(
        { error: "type, sourceId, targetUserId, teamId, tempVideoPath, tempThumbnailPath が必要です" },
        { status: 400 },
      );
    }

    // 管理者権限確認（停止中の admin は弾く: video-authz / RLS の active 必須と整合）
    const { data: adminMembership } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("team_id", teamId)
      .eq("role", "admin")
      .eq("is_active", true)
      .maybeSingle();

    if (!adminMembership) {
      return NextResponse.json({ error: "チームの管理者権限が必要です" }, { status: 403 });
    }

    // 対象ユーザーがチームメンバーか確認（退会済み target は弾く: video-authz / RLS の active 必須と整合）
    const { data: targetMembership } = await supabase
      .from("team_memberships")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "対象ユーザーはチームメンバーではありません" }, { status: 403 });
    }

    // sourceId の所有権確認
    if (type === "record") {
      const { data: record } = await supabase
        .from("records")
        .select("id")
        .eq("id", sourceId)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (!record) {
        return NextResponse.json({ error: "指定された記録が見つからないか、対象ユーザーに属していません" }, { status: 403 });
      }
    } else {
      // practice-log: practice_logs の practice_id が teamId に属する practice か確認
      const { data: practiceLog } = await supabase
        .from("practice_logs")
        .select("id, practice_id")
        .eq("id", sourceId)
        .maybeSingle();

      if (!practiceLog) {
        return NextResponse.json({ error: "指定された練習ログが見つかりません" }, { status: 403 });
      }

      const { data: practice } = await supabase
        .from("practices")
        .select("id")
        .eq("id", practiceLog.practice_id)
        .eq("team_id", teamId)
        .maybeSingle();

      if (!practice) {
        return NextResponse.json({ error: "練習ログが指定されたチームに属していません" }, { status: 403 });
      }
    }

    // 最終パス生成（リクエストの tempVideoPath/tempThumbnailPath を直接使わず、サーバー側でパスを検証・生成）
    const prefix = type === "record" ? "records" : "practice-logs";
    const expectedTempVideoPath = `videos/${user.id}/${prefix}/${sourceId}.mp4`;
    const expectedTempThumbnailPath = `thumbnails/${user.id}/${prefix}/${sourceId}.jpg`;

    // リクエストのパスがサーバー側で期待するパスと一致するか検証
    if (tempVideoPath !== expectedTempVideoPath || tempThumbnailPath !== expectedTempThumbnailPath) {
      return NextResponse.json(
        { error: "不正なファイルパスです" },
        { status: 400 },
      );
    }

    const finalVideoPath = `videos/${targetUserId}/${prefix}/${sourceId}.mp4`;
    const finalThumbnailPath = `thumbnails/${targetUserId}/${prefix}/${sourceId}.jpg`;

    // R2でコピー
    await copyVideoInR2(expectedTempVideoPath, finalVideoPath);
    await copyVideoInR2(expectedTempThumbnailPath, finalThumbnailPath);

    // DB更新（コピー成功後に実行）
    // RLS-bound クライアントで更新するため、RLS 不一致では 0 行更新・エラー無しに
    // なり得る。.select() で影響行数を取得し、0 行なら loud に失敗させる
    // (R2 へのコピーは済んでいるが DB が更新されない無音 false-success を防ぐ)。
    if (type === "record") {
      const { data, error } = await supabase
        .from("records")
        .update({ video_path: finalVideoPath, video_thumbnail_path: finalThumbnailPath })
        .eq("id", sourceId)
        .select("id");

      if (error) {
        console.error("記録DB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
      if (!data || data.length === 0) {
        console.error("記録DB更新が0行: RLS不一致または対象不在", { sourceId });
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    } else {
      const { data, error } = await supabase
        .from("practice_logs")
        .update({ video_path: finalVideoPath, video_thumbnail_path: finalThumbnailPath })
        .eq("id", sourceId)
        .select("id");

      if (error) {
        console.error("練習ログDB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
      if (!data || data.length === 0) {
        console.error("練習ログDB更新が0行: RLS不一致または対象不在", { sourceId });
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    }

    // DB更新成功後にのみ元ファイルを削除
    try {
      await deleteVideosFromR2([expectedTempVideoPath, expectedTempThumbnailPath]);
    } catch (deleteError) {
      // 削除失敗はログのみ（DB更新は成功しているため、temp objectsは残す）
      console.error("一時ファイル削除エラー（DB更新は成功済み）:", deleteError);
    }

    return NextResponse.json({ success: true, finalVideoPath, finalThumbnailPath });
  } catch (error) {
    console.error("動画アサインエラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
