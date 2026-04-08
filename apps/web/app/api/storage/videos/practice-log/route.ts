/**
 * 練習ログの動画削除 API
 * オーナー OR チーム管理者が削除可能
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { deleteVideosFromR2 } from "@/lib/r2-video";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { searchParams } = new URL(request.url);
    const practiceLogId = searchParams.get("practiceLogId");

    if (!practiceLogId) {
      return NextResponse.json({ error: "practiceLogId が必要です" }, { status: 400 });
    }

    // 練習ログを取得（practice_id 経由で team_id を取得）
    const { data: log, error } = await supabase
      .from("practice_logs")
      .select("id, user_id, video_path, video_thumbnail_path, practice_id")
      .eq("id", practiceLogId)
      .single();

    if (error || !log) {
      return NextResponse.json({ error: "練習ログが見つかりません" }, { status: 404 });
    }

    // オーナーチェック
    const isOwner = log.user_id === user.id;
    let isTeamAdmin = false;

    if (!isOwner) {
      // practice → team_id を取得してチーム管理者チェック
      const { data: practice } = await supabase
        .from("practices")
        .select("team_id")
        .eq("id", log.practice_id)
        .maybeSingle();

      if (practice?.team_id) {
        const { data: membership } = await supabase
          .from("team_memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("team_id", practice.team_id)
          .eq("role", "admin")
          .maybeSingle();

        isTeamAdmin = !!membership;
      }
    }

    if (!isOwner && !isTeamAdmin) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // R2から削除
    const keysToDelete: string[] = [];
    if (log.video_path) keysToDelete.push(log.video_path);
    if (log.video_thumbnail_path) keysToDelete.push(log.video_thumbnail_path);

    if (keysToDelete.length > 0) {
      await deleteVideosFromR2(keysToDelete);
    }

    // DB更新
    const { error: updateError } = await supabase
      .from("practice_logs")
      .update({ video_path: null, video_thumbnail_path: null })
      .eq("id", practiceLogId);

    if (updateError) {
      console.error("練習ログDB更新エラー:", updateError);
      return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("動画削除エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
