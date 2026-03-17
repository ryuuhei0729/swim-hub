/**
 * 動画アップロード確定 API
 * クライアントがR2への直接PUTを完了した後、サムネイルアップロード + DB更新を行う
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { uploadThumbnailToR2 } from "@/lib/r2-video";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const formData = await request.formData();
    const type = formData.get("type") as "record" | "practice-log" | null;
    const id = formData.get("id") as string | null;
    const videoPath = formData.get("videoPath") as string | null;
    const thumbnailPath = formData.get("thumbnailPath") as string | null;
    const thumbnailBlob = formData.get("thumbnailBlob") as File | null;

    if (!type || !id || !videoPath || !thumbnailPath) {
      return NextResponse.json({ error: "type, id, videoPath, thumbnailPath が必要です" }, { status: 400 });
    }

    // 所有者確認
    if (type === "record") {
      const { data: record, error } = await supabase
        .from("records")
        .select("id, user_id")
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
        .select("id, user_id")
        .eq("id", id)
        .single();

      if (error || !log) {
        return NextResponse.json({ error: "練習ログが見つかりません" }, { status: 404 });
      }
      if (log.user_id !== user.id) {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    // サムネイルをR2にアップロード（Workers バインディング経由）
    if (thumbnailBlob) {
      const buffer = Buffer.from(await thumbnailBlob.arrayBuffer());
      await uploadThumbnailToR2(buffer, thumbnailPath);
    }

    // DB更新
    if (type === "record") {
      const { error } = await supabase
        .from("records")
        .update({ video_path: videoPath, video_thumbnail_path: thumbnailPath })
        .eq("id", id);

      if (error) {
        console.error("記録DB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("practice_logs")
        .update({ video_path: videoPath, video_thumbnail_path: thumbnailPath })
        .eq("id", id);

      if (error) {
        console.error("練習ログDB更新エラー:", error);
        return NextResponse.json({ error: "DB更新に失敗しました" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("動画アップロード確定エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
