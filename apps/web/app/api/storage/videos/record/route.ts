/**
 * 記録の動画削除 API
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
    const recordId = searchParams.get("recordId");

    if (!recordId) {
      return NextResponse.json({ error: "recordId が必要です" }, { status: 400 });
    }

    // 記録を取得
    const { data: record, error } = await supabase
      .from("records")
      .select("id, user_id, team_id, video_path, video_thumbnail_path")
      .eq("id", recordId)
      .single();

    if (error || !record) {
      return NextResponse.json({ error: "記録が見つかりません" }, { status: 404 });
    }

    // オーナー OR チーム管理者チェック
    const isOwner = record.user_id === user.id;
    let isTeamAdmin = false;

    if (!isOwner && record.team_id) {
      const { data: membership } = await supabase
        .from("team_memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("team_id", record.team_id)
        .eq("role", "admin")
        .maybeSingle();

      isTeamAdmin = !!membership;
    }

    if (!isOwner && !isTeamAdmin) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // R2から削除
    const keysToDelete: string[] = [];
    if (record.video_path) keysToDelete.push(record.video_path);
    if (record.video_thumbnail_path) keysToDelete.push(record.video_thumbnail_path);

    if (keysToDelete.length > 0) {
      await deleteVideosFromR2(keysToDelete);
    }

    // DB更新
    const { error: updateError } = await supabase
      .from("records")
      .update({ video_path: null, video_thumbnail_path: null })
      .eq("id", recordId);

    if (updateError) {
      console.error("記録DB更新エラー:", updateError);
      return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("動画削除エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
