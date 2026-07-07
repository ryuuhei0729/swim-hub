/**
 * Cloudflare R2 クライアント
 * Cloudflare Workers環境ではR2バインディングを使用
 * ローカル開発環境ではS3互換APIを使用（フォールバック）
 */

/// <reference types="@cloudflare/workers-types" />

import { AwsClient } from "aws4fetch";

// CloudflareEnvを拡張してR2_BUCKETバインディングを追加
declare global {
  interface CloudflareEnv {
    R2_BUCKET?: R2Bucket;
    R2_VIDEO_BUCKET?: R2Bucket;
  }
}

/**
 * R2バケットを取得（Cloudflare Workers環境）
 */
async function getR2Bucket(): Promise<R2Bucket> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  const bucket = ctx.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKETバインディングが設定されていません");
  }
  return bucket;
}

const getPublicUrl = (): string => {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error("R2_PUBLIC_URLが設定されていません");
  }
  return publicUrl;
};

/**
 * R2が有効かどうかを確認
 * バインディングが設定されているかどうかはランタイムでしか確認できないため、
 * 公開URLの設定有無で判断
 */
export function isR2Enabled(): boolean {
  return !!process.env.R2_PUBLIC_URL;
}

/**
 * ファイルをR2にアップロード
 * @param file ファイル内容（Buffer または Uint8Array）
 * @param key ファイルのキー（パス）
 * @param contentType MIMEタイプ
 * @returns 公開URL
 */
export async function uploadToR2(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string,
): Promise<string> {
  const bucket = await getR2Bucket();

  await bucket.put(key, file, {
    httpMetadata: {
      contentType,
    },
  });

  return `${getPublicUrl()}/${key}`;
}

/**
 * ファイルをR2から削除
 * @param key ファイルのキー（パス）
 */
export async function deleteFromR2(key: string): Promise<void> {
  const bucket = await getR2Bucket();
  await bucket.delete(key);
}

/**
 * 指定プレフィックス内のファイル一覧を取得
 * @param prefix プレフィックス（フォルダパス）
 * @returns ファイルキーの配列
 */
export async function listR2Objects(prefix: string): Promise<string[]> {
  const bucket = await getR2Bucket();

  const listed = await bucket.list({ prefix });

  return listed.objects.map((obj) => obj.key).filter((key): key is string => key !== undefined);
}

/**
 * 複数ファイルをR2から削除
 * @param keys ファイルキーの配列
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<void> {
  const bucket = await getR2Bucket();
  // R2は一括削除をサポートしていないので個別に削除
  await Promise.all(keys.map((key) => bucket.delete(key)));
}

/**
 * R2の公開URLを取得
 * @param key ファイルのキー（パス）
 * @returns 公開URL
 */
export function getR2PublicUrl(key: string): string {
  return `${getPublicUrl()}/${key}`;
}

// =============================================================================
// 画像表示用 署名付きGET URL (private バケット対応)
// r2-video.ts の generateVideoGetUrl と同じ aws4fetch 方式 (S3互換API直接署名)
// =============================================================================

const getImageAwsClient = () =>
  new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });

const getImageEndpoint = () => `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * 署名付きGET URLの署名先バケット名を取得する。
 *
 * 注意: アップロードは Workers バインディング `R2_BUCKET` に対して行われる一方、
 * 署名付きGETはこの環境変数のバケット名に対して S3 互換 API で署名する。
 * 両者が別バケットを指すと「アップロードは成功するのに署名GETが404」または
 * 意図しないバケットからの配信が起きる。コード上でバインディング実体との
 * 名前一致を実行時に検証することはできないため、デプロイ手順で
 * wrangler の `R2_BUCKET` バインディング先バケットと `R2_BUCKET_NAME` の
 * 値が同一であることを必ず突合すること。
 */
function getImageBucketName(): string {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error(
      "R2_BUCKET_NAME が設定されていません。" +
        "アップロード先の R2_BUCKET バインディングと同一のバケットを指すよう、" +
        "R2_BUCKET_NAME 環境変数にバケット名を設定してください。",
    );
  }
  return bucketName;
}

/**
 * R2/S3キーをURLパス用にエンコードする。
 * encodeURIComponent(key) をキー全体に使うと "/" も "%2F" になり、
 * "{userId}/{fileName}" のようなキー階層が壊れるため、セグメント単位でエンコードする。
 */
function encodeR2Key(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * 画像表示用署名付きGET URLを発行する (デフォルト1時間有効)
 * @param key R2オブジェクトキー (例: "profile-images/{userId}/{fileName}")
 * @param expiresInSeconds 有効期限 (秒)
 */
export async function generateImageGetUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const aws = getImageAwsClient();
  const bucket = getImageBucketName();
  const url = new URL(`${getImageEndpoint()}/${bucket}/${encodeR2Key(key)}`);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));

  const signed = await aws.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });

  return signed.url;
}
