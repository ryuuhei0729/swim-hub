/**
 * 動画アップロードユーティリティ
 * Web API (R2) 経由で動画・サムネイルをアップロード・取得・削除
 */
import * as VideoThumbnails from "expo-video-thumbnails";
import { env } from "@/lib/env";

const WEB_API_URL = env.webApiUrl;

export type VideoType = "record" | "practice-log";

interface UploadUrlResponse {
  videoUploadUrl: string;
  thumbnailUploadUrl: string;
  videoPath: string;
  thumbnailPath: string;
}

interface PresignedUrlResponse {
  url: string;
  thumbnailUrl: string | null;
  expiresAt: string;
}

/**
 * 動画のサムネイルを生成（0秒目のフレーム）
 */
export async function generateThumbnail(
  videoUri: string,
): Promise<{ uri: string; width: number; height: number }> {
  const result = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0 });
  return result;
}

/**
 * 署名付きアップロードURLを取得
 */
export async function requestUploadUrl(
  type: VideoType,
  id: string,
  contentType: string,
  accessToken: string,
): Promise<UploadUrlResponse> {
  const res = await fetch(`${WEB_API_URL}/api/storage/videos/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ type, id, contentType }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(data.message ?? data.error ?? "アップロードURLの取得に失敗しました");
  }

  return (await res.json()) as UploadUrlResponse;
}

/**
 * 動画ファイルをR2へ直接PUT (fetch + file URI)
 */
export async function uploadVideoToR2(
  presignedUrl: string,
  fileUri: string,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();

  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`動画アップロード失敗: HTTP ${res.status}`);
  }

  onProgress?.(90);
}

/**
 * サムネイルをR2へPUT
 */
export async function uploadThumbnailToR2(
  presignedUrl: string,
  thumbnailUri: string,
): Promise<void> {
  const fileResponse = await fetch(thumbnailUri);
  const blob = await fileResponse.blob();

  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`サムネイルアップロード失敗: HTTP ${res.status}`);
  }
}

/**
 * アップロード確定（DB更新）
 */
export async function confirmUpload(
  type: VideoType,
  id: string,
  videoPath: string,
  thumbnailPath: string,
  accessToken: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("type", type);
  formData.append("id", id);
  formData.append("videoPath", videoPath);
  formData.append("thumbnailPath", thumbnailPath);

  const res = await fetch(`${WEB_API_URL}/api/storage/videos/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "DB更新に失敗しました");
  }
}

/**
 * 再生用署名付きURLを取得
 */
export async function getPresignedUrl(
  videoPath: string,
  thumbnailPath: string | null,
  accessToken: string,
): Promise<PresignedUrlResponse> {
  const params = new URLSearchParams({ path: videoPath });
  if (thumbnailPath) {
    params.set("thumbnailPath", thumbnailPath);
  }

  const res = await fetch(
    `${WEB_API_URL}/api/storage/videos/presigned-url?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "署名付きURLの取得に失敗しました");
  }

  return (await res.json()) as PresignedUrlResponse;
}

/**
 * 動画を削除
 */
export async function deleteVideo(
  type: VideoType,
  id: string,
  accessToken: string,
): Promise<void> {
  const endpoint =
    type === "record"
      ? `${WEB_API_URL}/api/storage/videos/record?recordId=${id}`
      : `${WEB_API_URL}/api/storage/videos/practice-log?practiceLogId=${id}`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "動画の削除に失敗しました");
  }
}

/**
 * 動画アップロードの全フロー
 * 選択済み動画URI → サムネイル生成 → URL取得 → R2アップロード → DB確定
 */
export async function uploadVideo(params: {
  type: VideoType;
  id: string;
  videoUri: string;
  accessToken: string;
  onProgress?: (progress: number) => void;
}): Promise<{ videoPath: string; thumbnailPath: string }> {
  const { type, id, videoUri, accessToken, onProgress } = params;

  onProgress?.(5);

  // サムネイル生成
  const thumbnail = await generateThumbnail(videoUri);
  onProgress?.(15);

  // 署名付きURL取得
  const { videoUploadUrl, thumbnailUploadUrl, videoPath, thumbnailPath } =
    await requestUploadUrl(type, id, "video/mp4", accessToken);
  onProgress?.(20);

  // 動画とサムネイルを並列アップロード
  await Promise.all([
    uploadVideoToR2(videoUploadUrl, videoUri, "video/mp4", (p) => onProgress?.(20 + p * 0.65)),
    uploadThumbnailToR2(thumbnailUploadUrl, thumbnail.uri),
  ]);
  onProgress?.(90);

  // DB確定
  await confirmUpload(type, id, videoPath, thumbnailPath, accessToken);
  onProgress?.(100);

  return { videoPath, thumbnailPath };
}
