/**
 * Cloudflare R2 動画専用クライアント
 * - プライベートバケット使用
 * - アップロード: 署名付きPUT URL (クライアント直接PUT、1GB対応)
 * - 再生: 署名付きGET URL (24時間有効)
 * - サムネイル: Workers バインディング経由でアップロード
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const getS3Client = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

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
  const s3 = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: getBucketName(), Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: 60 * 60 * 24 });
}

/** クライアント直接PUT用署名付きURL (1時間) - 1GB対応 */
export async function generateVideoPutUrl(key: string, contentType: string): Promise<string> {
  const s3 = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });
}

/** サムネイル (WebP, 小容量) をアップロード
 * Workers 環境: バインディング経由
 * ローカル dev / フォールバック: S3 API 経由
 */
export async function uploadThumbnailToR2(
  file: Buffer | Uint8Array,
  key: string,
): Promise<void> {
  // Workers バインディングが使えるか試みる
  try {
    const bucket = await getVideoR2Bucket();
    await bucket.put(key, file, { httpMetadata: { contentType: "image/webp" } });
    return;
  } catch {
    // ローカル dev などで Workers コンテキストがない場合は S3 API にフォールバック
  }

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: file,
      ContentType: "image/webp",
    }),
  );
}

/** 動画・サムネイルの削除 (Workers バインディング経由) */
export async function deleteVideosFromR2(keys: string[]): Promise<void> {
  const bucket = await getVideoR2Bucket();
  await Promise.all(keys.map((k) => bucket.delete(k)));
}

/** R2 内でのコピー (チーム管理者アサイン用, S3 API 経由) */
export async function copyVideoInR2(sourceKey: string, destKey: string): Promise<void> {
  const s3 = getS3Client();
  const bucketName = getBucketName();
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${sourceKey}`,
      Key: destKey,
    }),
  );
}

export function isVideoR2Enabled(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}
