/**
 * 動画アップロードユーティリティ
 * Web API (R2) 経由で動画・サムネイルをアップロード・取得・削除
 */
import * as VideoThumbnails from "expo-video-thumbnails";
import { env } from "@/lib/env";
import i18n from "@/i18n";

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
    throw new Error(data.message ?? data.error ?? i18n.t("common.upload.videoUploadUrlFailed"));
  }

  return (await res.json()) as UploadUrlResponse;
}

/** contentType から一時ファイルの拡張子を導出する */
function extensionFromContentType(contentType: string): string {
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("x-matroska")) return "mkv";
  if (contentType.includes("webm")) return "webm";
  return "mp4";
}

/**
 * 動画ファイルをR2へ直接PUT (fetch + file URI)
 * React Native の fetch は iOS の ph:// / Android の content:// を直接扱えないため、
 * これらの URI は expo-file-system で一時ファイル (file://) にコピーしてから PUT する。
 */
export async function uploadVideoToR2(
  presignedUrl: string,
  fileUri: string,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  // ph:// (iOS フォトライブラリ) / content:// (Android) を file:// にコピー
  let uri = fileUri;
  let tempUri: string | null = null;
  if (fileUri.startsWith("ph://") || fileUri.startsWith("content://")) {
    // expo-file-system/legacy を動的 import（テスト環境での NativeModule 問題を回避）
    const FileSystemLegacy = await import("expo-file-system/legacy");
    const cache = FileSystemLegacy.cacheDirectory ?? "";
    tempUri = `${cache}video-${Date.now()}.${extensionFromContentType(contentType)}`;
    await FileSystemLegacy.copyAsync({ from: fileUri, to: tempUri });
    uri = tempUri;
  }

  let fileResponse: Response;
  try {
    fileResponse = await fetch(uri);
  } catch (err) {
    throw new Error(`${i18n.t("common.upload.videoReadFailed", { uri })} — ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!fileResponse.ok) {
    throw new Error(i18n.t("common.upload.videoReadHttpFailed", { status: fileResponse.status, uri }));
  }

  const blob = await fileResponse.blob();

  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!res.ok) {
    // レスポンスボディ (R2/S3 互換ストレージの生エラー詳細) はユーザーに表示しない。
    // console.error でのみ残し、開発者が調査できるようにする（情報露出対策）。
    const errorBody = await (typeof res.text === "function" ? res.text().catch(() => "") : Promise.resolve(""));
    console.error("動画アップロードHTTPエラー:", res.status, (errorBody as string).slice(0, 200));
    throw new Error(i18n.t("common.upload.videoUploadHttpFailed", { status: res.status }));
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
    throw new Error(i18n.t("common.upload.thumbnailUploadHttpFailed", { status: res.status }));
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
    throw new Error(data.error ?? i18n.t("common.upload.videoDbUpdateFailed"));
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
    throw new Error(data.error ?? i18n.t("common.upload.videoSignedUrlFailed"));
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
    throw new Error(data.error ?? i18n.t("common.upload.videoDeleteFailedSimple"));
  }
}

/**
 * チーム管理者による動画アサイン（team-assign）
 * confirm 済みの一時動画（操作者ユーザー配下）を対象メンバーのパスへ再割当する。
 * Web の `/api/storage/videos/team-assign` フローと一致。
 *
 * tempVideoPath / tempThumbnailPath は requestUploadUrl / confirmUpload が返す
 * videoPath / thumbnailPath をそのまま渡す（サーバー側が操作者 user.id で生成・検証する）。
 */
export async function assignTeamVideo(params: {
  type: VideoType;
  sourceId: string;
  targetUserId: string;
  teamId: string;
  tempVideoPath: string;
  tempThumbnailPath: string;
  accessToken: string;
}): Promise<{ finalVideoPath: string; finalThumbnailPath: string }> {
  const { type, sourceId, targetUserId, teamId, tempVideoPath, tempThumbnailPath, accessToken } =
    params;

  const res = await fetch(`${WEB_API_URL}/api/storage/videos/team-assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      type,
      sourceId,
      targetUserId,
      teamId,
      tempVideoPath,
      tempThumbnailPath,
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(data.message ?? data.error ?? i18n.t("common.upload.videoDbUpdateFailed"));
  }

  return (await res.json()) as { finalVideoPath: string; finalThumbnailPath: string };
}

/** サムネイル未生成のため team-assign に進めなかったことを表すエラー。 */
export class MissingThumbnailError extends Error {
  constructor(message = "thumbnail was not generated") {
    super(message);
    this.name = "MissingThumbnailError";
  }
}

/**
 * チームメンバーへの代理動画アップロード全フロー
 * upload-url → R2 PUT → confirm（操作者配下に一時保存）→ team-assign（対象メンバーへ再割当）。
 * Web の RecordClient（team-assign）フローと一致。
 *
 * team-assign API はサムネイル必須（tempThumbnailPath の必須チェック + サーバー側で
 * `thumbnails/.../{sourceId}.jpg` のコピーを行う）。一方 uploadVideo はサムネイル生成に
 * 失敗すると thumbnailPath を空文字で返す。空文字を team-assign に渡すと 400 になるため、
 * サムネイル未生成の場合は team-assign を呼ばず MissingThumbnailError を投げる
 * （動画自体は操作者配下に confirm 済みだが対象メンバーには割り当てない）。
 * 呼び出し側はこのエラーを捕捉し、ユーザーに「サムネ未生成で添付不可」を通知する。
 */
export async function uploadVideoForTeamMember(params: {
  type: VideoType;
  /** 一時保存先の sourceId（= 作成済み record の id） */
  id: string;
  targetUserId: string;
  teamId: string;
  videoUri: string;
  accessToken: string;
  mimeType?: string;
  onProgress?: (progress: number) => void;
}): Promise<{ finalVideoPath: string; finalThumbnailPath: string }> {
  const { type, id, targetUserId, teamId, videoUri, accessToken, mimeType, onProgress } = params;

  // upload-url → R2 PUT → confirm（操作者配下へ一時保存）
  const { videoPath, thumbnailPath } = await uploadVideo({
    type,
    id,
    videoUri,
    accessToken,
    mimeType,
    onProgress: (p) => onProgress?.(p * 0.8),
  });

  // サムネイル未生成（uploadVideo が空文字を返す）の場合は team-assign を呼ばない。
  // 空の tempThumbnailPath は team-assign の必須チェック / パス検証で 400 になるため。
  if (thumbnailPath === "") {
    throw new MissingThumbnailError();
  }

  // team-assign（対象メンバーへ再割当）
  const result = await assignTeamVideo({
    type,
    sourceId: id,
    targetUserId,
    teamId,
    tempVideoPath: videoPath,
    tempThumbnailPath: thumbnailPath,
    accessToken,
  });
  onProgress?.(100);

  return result;
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
