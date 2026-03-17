/**
 * チーム管理者による動画アサイン API
 * 管理者が一時アップロードした動画をメンバーのパスに移動する
 */
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { copyVideoInR2, deleteVideosFromR2 } from "@/lib/r2-video";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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

    const supabase = await createAuthenticatedServerClient();

    // 管理者権限確認
    const { data: adminMembership } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("team_id", teamId)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminMembership) {
      return NextResponse.json({ error: "チームの管理者権限が必要です" }, { status: 403 });
    }

    // 対象ユーザーがチームメンバーか確認
    const { data: targetMembership } = await supabase
      .from("team_memberships")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "対象ユーザーはチームメンバーではありません" }, { status: 403 });
    }

    // 最終パス生成
    const prefix = type === "record" ? "records" : "practice-logs";
    const finalVideoPath = `videos/${targetUserId}/${prefix}/${sourceId}.mp4`;
    const finalThumbnailPath = `thumbnails/${targetUserId}/${prefix}/${sourceId}.webp`;

    // R2でコピー
    await copyVideoInR2(tempVideoPath, finalVideoPath);
    await copyVideoInR2(tempThumbnailPath, finalThumbnailPath);

    // 元ファイルを削除
    await deleteVideosFromR2([tempVideoPath, tempThumbnailPath]);

    // DB更新
    if (type === "record") {
      const { error } = await supabase
        .from("records")
        .update({ video_path: finalVideoPath, video_thumbnail_path: finalThumbnailPath })
        .eq("id", sourceId);

      if (error) {
        console.error("記録DB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("practice_logs")
        .update({ video_path: finalVideoPath, video_thumbnail_path: finalThumbnailPath })
        .eq("id", sourceId);

      if (error) {
        console.error("練習ログDB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, finalVideoPath, finalThumbnailPath });
  } catch (error) {
    console.error("動画アサインエラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
