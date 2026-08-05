/**
 * 練習ログの動画削除 API
 * オーナー OR チーム管理者が削除可能
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { deleteVideosFromR2 } from "@/lib/r2-video";
import { authorizePracticeLogVideoMutation } from "@/lib/video-authz";
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

    // オーナー OR チーム active admin (代理) チェック
    // upload-url / confirm と同じ authorizePracticeLogVideoMutation を再利用する
    const authz = await authorizePracticeLogVideoMutation(supabase, practiceLogId, user.id);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    // 削除対象の R2 キーを確認するため、更新前の練習ログを取得
    const { data: log, error } = await supabase
      .from("practice_logs")
      .select("video_path, video_thumbnail_path")
      .eq("id", practiceLogId)
      .single();

    if (error || !log) {
      return NextResponse.json({ error: "練習ログが見つかりません" }, { status: 404 });
    }

    // DB更新を先に行う (R2削除より前)。authorizePracticeLogVideoMutation の
    // 「本人」判定 (practice_logs.user_id) は practice_logs の UPDATE RLS
    // (20260803000002_practice_logs_owner_self_update.sql) の「本人」判定と現在
    // 一致している (video-authz.ts docstring 参照)。それでも .select() で影響行数を
    // 確認し、DB更新が効かない限り R2 のファイルには一切触れない多層防御は維持する。
    // 一致が将来の migration で再び崩れるケース (drift) の他、退会済み
    // (is_active=false) メンバーが自分のログを更新しようとした場合も 0 行になり得る。
    // これは WITH CHECK 違反ではなく、practice_logs の SELECT ポリシー
    // (20260210000000_allow_team_practice_logs_viewing.sql の is_team_member が
    // is_active=true を要求) により UPDATE 対象行としてそもそも可視化されない
    // ためである。このように認可判定だけでは検出できない 0 行更新が起こり得るため、
    // 「R2だけ消えてDBは消えたファイルを指したまま」という不可逆な不整合を防ぐ。
    const { data: updated, error: updateError } = await supabase
      .from("practice_logs")
      .update({ video_path: null, video_thumbnail_path: null })
      .eq("id", practiceLogId)
      .select("id");

    if (updateError) {
      console.error("練習ログDB更新エラー:", updateError);
      return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      console.error("練習ログDB更新が0行: 認可通過後にRLSでブロックされた可能性", {
        id: practiceLogId,
      });
      return NextResponse.json({ error: "更新に失敗しました。権限を確認してから再試行してください" }, { status: 409 });
    }

    // R2から削除 (DB更新成功後のみ。ここで失敗しても壊れた参照は残らず、
    // 参照のない R2 オブジェクトが残るだけに留まる)
    const keysToDelete: string[] = [];
    if (log.video_path) keysToDelete.push(log.video_path);
    if (log.video_thumbnail_path) keysToDelete.push(log.video_thumbnail_path);

    if (keysToDelete.length > 0) {
      await deleteVideosFromR2(keysToDelete);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("動画削除エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
