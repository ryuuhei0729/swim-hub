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
 * iOS の ph:// URI は React Native の fetch が扱えないため、
 * expo-file-system で一時ファイルにコピーしてから PUT する。
 */
export async function uploadVideoToR2(
  presignedUrl: string,
  fileUri: string,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  // iOS ph:// URI を file:// にコピー（React Native fetch が ph:// を扱えないため）
  let uri = fileUri;
  let tempUri: string | null = null;
  if (fileUri.startsWith("ph://")) {
    // expo-file-system/legacy を動的 import（テスト環境での NativeModule 問題を回避）
    const FileSystemLegacy = await import("expo-file-system/legacy");
    const cache = FileSystemLegacy.cacheDirectory ?? "";
    tempUri = `${cache}video-${Date.now()}.mov`;
    await FileSystemLegacy.copyAsync({ from: fileUri, to: tempUri });
    uri = tempUri;
  }

  let fileResponse: Response;
  try {
    fileResponse = await fetch(uri);
  } catch (err) {
    throw new Error(`動画ファイル読み込み失敗: ${uri} — ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!fileResponse.ok) {
    throw new Error(`動画ファイル読み込み失敗: HTTP ${fileResponse.status} (${uri})`);
  }

  const blob = await fileResponse.blob();

  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!res.ok) {
    const errorBody = await (typeof res.text === "function" ? res.text().catch(() => "") : Promise.resolve(""));
    const detail = (errorBody as string).slice(0, 200);
    throw new Error(`動画アップロード失敗: HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
  }

  onProgress?.(90);

  // 一時ファイルを削除
  if (tempUri) {
    const FileSystemLegacy = await import("expo-file-system/legacy");
    FileSystemLegacy.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
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
  mimeType?: string;
  onProgress?: (progress: number) => void;
}): Promise<{ videoPath: string; thumbnailPath: string }> {
  const { type, id, videoUri, accessToken, mimeType, onProgress } = params;
  const contentType = mimeType ?? "video/mp4";

  onProgress?.(5);

  // サムネイル生成（iOS ph:// URI など失敗しても続行）
  let thumbnailUri: string | null = null;
  try {
    const thumbnail = await generateThumbnail(videoUri);
    thumbnailUri = thumbnail.uri;
  } catch {
    // サムネイル生成失敗はアップロードを止めない
  }
  onProgress?.(15);

  // 署名付きURL取得
  const { videoUploadUrl, thumbnailUploadUrl, videoPath, thumbnailPath } =
    await requestUploadUrl(type, id, contentType, accessToken);
  onProgress?.(20);

  // 動画とサムネイルを並列アップロード（サムネイルがあれば）
  const uploads: Promise<void>[] = [
    uploadVideoToR2(videoUploadUrl, videoUri, contentType, (p) => onProgress?.(20 + p * 0.65)),
  ];
  if (thumbnailUri) {
    uploads.push(uploadThumbnailToR2(thumbnailUploadUrl, thumbnailUri));
  }
  await Promise.all(uploads);
  onProgress?.(90);

  // DB確定
  // thumbnailUri が null の場合はサムネイル生成失敗 — thumbnailPath を空文字で渡し、
  // DB には null が保存される（confirm API 側で空文字を null として扱う）
  await confirmUpload(type, id, videoPath, thumbnailUri ? thumbnailPath : "", accessToken);
  onProgress?.(100);

  return { videoPath, thumbnailPath: thumbnailUri ? thumbnailPath : "" };
}
