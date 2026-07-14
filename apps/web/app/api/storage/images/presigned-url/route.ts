/**
 * 画像表示用署名付きGET URL取得 API
 *
 * profile-images / practice-images / competition-images は private バケットのため、
 * このAPIを経由してのみ画像を閲覧できる。認可は image-authz.ts の所有者/チーム共有判定に従う。
 *
 * - R2 が有効な場合: R2 署名URL (aws4fetch, デフォルト1時間)
 * - 未設定の場合 (ローカル開発等): Supabase Storage の署名URL
 *   認可は本APIが担保するため、Supabase 署名URL発行は Admin クライアント (RLSバイパス) で行う。
 *   storage.objects の SELECT RLS は所有者スコープのみ (defense-in-depth) であり、
 *   チーム共有ケースを許可しないため、RLSに頼らずここで判定する。
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { authorizeImageAccess, IMAGE_BUCKETS, type ImageBucket } from "@/lib/image-authz";
import { isR2Enabled, generateImageGetUrl } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";

const IMAGE_URL_TTL_SECONDS = 60 * 60; // 1時間

function isImageBucket(value: string): value is ImageBucket {
  return (IMAGE_BUCKETS as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");

    if (!bucket || !path) {
      return NextResponse.json({ error: "bucket, path が必要です" }, { status: 400 });
    }
    if (!isImageBucket(bucket)) {
      return NextResponse.json({ error: "不正な bucket です" }, { status: 400 });
    }

    // パストラバーサル攻撃を防ぐための検証（動画API と同様）
    if (path.startsWith("/") || path.includes("\\")) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    const normalizedPath = nodePath.posix.normalize(path);
    if (normalizedPath.includes("..")) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const authz = await authorizeImageAccess(supabase, bucket, normalizedPath, user.id);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const expiresAt = Date.now() + IMAGE_URL_TTL_SECONDS * 1000;

    if (isR2Enabled()) {
      const url = await generateImageGetUrl(`${bucket}/${normalizedPath}`, IMAGE_URL_TTL_SECONDS);
      return NextResponse.json({ url, expiresAt });
    }

    // フォールバック: Supabase Storage
    // Admin クライアントで RLS をバイパスする（認可はこのAPI自体が上で判定済み）
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(normalizedPath, IMAGE_URL_TTL_SECONDS);

    if (error || !data) {
      console.error("署名付きURL生成エラー:", error);
      return NextResponse.json({ error: "画像URLの取得に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl, expiresAt });
  } catch (error) {
    console.error("画像署名付きURL取得エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
