/**
 * 記録の動画削除 API
 * オーナー OR チーム管理者が削除可能
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { deleteVideosFromR2 } from "@/lib/r2-video";
import { authorizeRecordVideoMutation } from "@/lib/video-authz";
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

    // オーナー OR チーム active admin (代理) チェック
    // upload-url / confirm と同じ authorizeRecordVideoMutation を再利用する
    const authz = await authorizeRecordVideoMutation(supabase, recordId, user.id);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    // 削除対象の R2 キーを確認するため、更新前の記録を取得
    const { data: record, error } = await supabase
      .from("records")
      .select("video_path, video_thumbnail_path")
      .eq("id", recordId)
      .single();

    if (error || !record) {
      return NextResponse.json({ error: "記録が見つかりません" }, { status: 404 });
    }

    // DB更新を先に行う (R2削除より前)。authorizeRecordVideoMutation の認可判定と
    // records の代理 UPDATE RLS は同型である (video-authz.ts docstring 参照)。
    // それでも .select() で影響行数を確認し、DB更新が効かない限り R2 のファイルには
    // 一切触れない多層防御は維持する。records の本人枝 (records.user_id = auth.uid())
    // は team_memberships を参照しないため、退会済みメンバーでも自分の記録は自己
    // UPDATE できる。0 行になり得るのは、admin による代理削除で対象記録の owner が
    // 当該 team の active member でない場合 (RLS の代理 UPDATE 条件が要求。
    // 20260129000000_optimize_rls_policies.sql 参照) である。
    // authorizeRecordVideoMutation 側の active member チェックと通常は一致するが、
    // 将来の migration で再び崩れるケース (drift) など、認可判定だけでは検出できない
    // 0 行更新が起こり得るため、DB更新を先に行い .select() で確認する多層防御を維持する。
    // これにより「R2だけ消えてDBは消えたファイルを指したまま」という不可逆な不整合を防ぐ。
    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update({ video_path: null, video_thumbnail_path: null })
      .eq("id", recordId)
      .select("id");

    if (updateError) {
      console.error("記録DB更新エラー:", updateError);
      return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      console.error("記録DB更新が0行: 認可通過後にRLSでブロックされた可能性", { id: recordId });
      return NextResponse.json({ error: "更新に失敗しました。権限を確認してから再試行してください" }, { status: 409 });
    }

    // R2から削除 (DB更新成功後のみ。ここで失敗しても壊れた参照は残らず、
    // 参照のない R2 オブジェクトが残るだけに留まる)
    const keysToDelete: string[] = [];
    if (record.video_path) keysToDelete.push(record.video_path);
    if (record.video_thumbnail_path) keysToDelete.push(record.video_thumbnail_path);

    if (keysToDelete.length > 0) {
      await deleteVideosFromR2(keysToDelete);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("動画削除エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
