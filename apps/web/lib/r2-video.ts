/**
 * Cloudflare R2 動画専用クライアント
 * - プライベートバケット使用
 * - アップロード: 署名付きPUT URL (クライアント直接PUT、1GB対応)
 * - 再生: 署名付きGET URL (24時間有効)
 * - サムネイル: Workers バインディング経由でアップロード
 *
 * aws4fetch を使用 (Web Standard API のみ依存、Cloudflare Workers 完全互換)
 */
import { AwsClient } from "aws4fetch";

const getAwsClient = () =>
  new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });

const getEndpoint = () =>
  `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function getBucketName(): string {
  return process.env.R2_VIDEO_BUCKET_NAME ?? "swim-hub-videos-prod";
}

// Workers バインディング経由でバケット取得
async function getVideoR2Bucket() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  const bucket = ctx.env.R2_VIDEO_BUCKET;
  if (!bucket) throw new Error("R2_VIDEO_BUCKETバインディングが設定されていません");
  return bucket;
}

/** 再生・ダウンロード用署名付きGET URL (24時間) */
export async function generateVideoGetUrl(key: string): Promise<string> {
  const aws = getAwsClient();
  const bucket = getBucketName();
  const url = new URL(`${getEndpoint()}/${bucket}/${encodeURIComponent(key)}`);
  url.searchParams.set("X-Amz-Expires", "86400");

  const signed = await aws.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });

  return signed.url;
}

/** クライアント直接PUT用署名付きURL (1時間) - 1GB対応 */
export async function generateVideoPutUrl(key: string, contentType: string): Promise<string> {
  const aws = getAwsClient();
  const bucket = getBucketName();
  const url = new URL(`${getEndpoint()}/${bucket}/${encodeURIComponent(key)}`);
  url.searchParams.set("X-Amz-Expires", "3600");

  const signed = await aws.sign(url.toString(), {
    method: "PUT",
    headers: { "content-type": contentType },
    aws: { signQuery: true },
  });

  return signed.url;
}

/** サムネイル (WebP, 小容量) をアップロード
 * Workers 環境: バインディング経由
 * ローカル dev / フォールバック: S3 互換 API 経由 (aws4fetch)
 */
export async function uploadThumbnailToR2(
  file: Buffer | Uint8Array,
  key: string,
): Promise<void> {
  // Workers バインディングが使えるか試みる
  try {
    const bucket = await getVideoR2Bucket();
    await bucket.put(key, file, { httpMetadata: { contentType: "image/jpeg" } });
    return;
  } catch (err) {
    // Workers コンテキスト不在 (ローカル dev 等) は S3 互換 API にフォールバック
    console.warn(
      "R2 Workers binding failed, falling back to S3 API:",
      err instanceof Error ? err.message : err,
    );
  }

  const aws = getAwsClient();
  const bucket = getBucketName();
  // Buffer / Uint8Array は tsconfig の BodyInit と一致しないため ArrayBuffer に変換
  const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const res = await aws.fetch(`${getEndpoint()}/${bucket}/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: arrayBuffer as BodyInit,
    headers: { "content-type": "image/jpeg" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Thumbnail upload failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

/** 動画・サムネイルの削除 (Workers バインディング経由) */
export async function deleteVideosFromR2(keys: string[]): Promise<void> {
  const bucket = await getVideoR2Bucket();
  await Promise.all(keys.map((k) => bucket.delete(k)));
}

/** R2 内でのコピー (チーム管理者アサイン用, aws4fetch 経由) */
export async function copyVideoInR2(sourceKey: string, destKey: string): Promise<void> {
  const aws = getAwsClient();
  const bucket = getBucketName();
  const res = await aws.fetch(`${getEndpoint()}/${bucket}/${encodeURIComponent(destKey)}`, {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${bucket}/${encodeURIComponent(sourceKey)}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`R2 copy failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

export function isVideoR2Enabled(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}
