/**
 * 動画再生・ダウンロード用署名付きGET URL取得 API
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { generateVideoGetUrl } from "@/lib/r2-video";
import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const videoPath = searchParams.get("path");
    const thumbnailPath = searchParams.get("thumbnailPath");

    if (!videoPath) {
      return NextResponse.json({ error: "path が必要です" }, { status: 400 });
    }

    // パストラバーサル攻撃を防ぐための検証
    if (videoPath.startsWith("/") || videoPath.includes("\\")) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const normalizedPath = nodePath.posix.normalize(videoPath);
    if (normalizedPath.includes("..")) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // path は "videos/{user_id}/..." の形式を想定
    const segments = normalizedPath.split("/");
    if (segments.length < 3 || segments[1] !== user.id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const videoUrl = await generateVideoGetUrl(videoPath);
    const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 1000).toISOString();

    let thumbnailUrl: string | null = null;
    if (thumbnailPath) {
      // サムネイルパスの検証
      if (!thumbnailPath.startsWith("/") && !thumbnailPath.includes("\\")) {
        const normalizedThumbPath = nodePath.posix.normalize(thumbnailPath);
        if (!normalizedThumbPath.includes("..")) {
          const thumbSegments = normalizedThumbPath.split("/");
          if (thumbSegments.length >= 3 && thumbSegments[1] === user.id) {
            thumbnailUrl = await generateVideoGetUrl(thumbnailPath);
          }
        }
      }
    }

    return NextResponse.json({ url: videoUrl, thumbnailUrl, expiresAt });
  } catch (error) {
    console.error("署名付きURL取得エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
