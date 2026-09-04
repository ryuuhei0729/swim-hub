/**
 * 画像アップロードユーティリティ
 * 練習記録・大会記録の画像をSupabase Storageにアップロード
 */

import { randomUUID } from "expo-crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import i18n from "@/i18n";
import { env } from "@/lib/env";

export type ImageBucket = "profile-images" | "practice-images" | "competition-images";

/**
 * UUIDを生成（暗号学的に安全なexpo-cryptoを使用）
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * コンテンツタイプを取得
 */
function getContentType(fileExtension: string): string {
  const ext = fileExtension.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

/**
 * 保存する image_paths を「生パス (source of truth)」から算出する。
 *
 * savedImagePaths から削除対象 (deletedImageIds) を除外し、新規アップロード分
 * (newImagePaths) を末尾に追加する。表示専用の resolveGalleryImages 結果は
 * 署名URL取得に失敗したパスを除外するため、保存の計算には使わないこと
 * （失敗パスが image_paths から静かに消えるデータ損失を防ぐ）。
 */
export function mergeImagePaths(
  savedImagePaths: string[],
  deletedImageIds: string[],
  newImagePaths: string[],
): string[] {
  const currentPaths = savedImagePaths.filter((path) => !deletedImageIds.includes(path));
  return [...currentPaths, ...newImagePaths];
}

/**
 * 単一の画像を削除
 */
export async function deleteImage(
  supabase: SupabaseClient,
  path: string,
  bucket: ImageBucket,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    // Supabase Storage の生エラー (バケット名等を含みうる) はユーザーに表示しない（情報露出対策）
    console.error("画像削除エラー:", error);
    throw new Error(i18n.t("common.upload.imageDeleteFailedSimple"));
  }
}

/**
 * 複数の画像を削除
 */
export async function deleteImages(
  supabase: SupabaseClient,
  paths: string[],
  bucket: ImageBucket,
): Promise<void> {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(bucket).remove(paths);

  if (error) {
    // Supabase Storage の生エラー (バケット名等を含みうる) はユーザーに表示しない（情報露出対策）
    console.error("画像削除エラー:", error);
    throw new Error(i18n.t("common.upload.imageDeleteFailedSimple"));
  }
}

/**
 * 画像表示用の署名付きURLレスポンス
 */
export interface SignedImageUrlResponse {
  url: string;
  expiresAt: number;
}

/**
 * Web API (/api/storage/images/presigned-url) 経由で画像の署名付きURLを失効時刻付きで取得する
 *
 * profile-images / practice-images / competition-images は private バケットのため、
 * 公開URLを直接組み立てず、このAPI経由でのみ表示用URLを取得できる。
 *
 * @param bucket バケットID
 * @param path バケット内相対パス。移行期の互換のため、既にフルURL（旧データ）の場合は
 *             失効しない (expiresAt=Infinity) レスポンスとしてそのまま返す
 * @param accessToken Supabase access token
 * @returns 署名付きURLと expiresAt (epoch ms)、取得に失敗した場合はnull
 */
export async function getSignedImageUrlWithExpiry(
  bucket: ImageBucket,
  path: string | null | undefined,
  accessToken: string,
): Promise<SignedImageUrlResponse | null> {
  if (!path) return null;

  // 移行期の後方互換: 署名URL化前の旧データはフルURLのまま保存されている場合がある
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return { url: path, expiresAt: Number.POSITIVE_INFINITY };
  }

  try {
    const params = new URLSearchParams({ bucket, path });
    const res = await fetch(
      `${env.webApiUrl}/api/storage/images/presigned-url?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as SignedImageUrlResponse;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

/**
 * 画像の署名付きURLを取得する（URL文字列のみ版）
 */
export async function getSignedImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
  accessToken: string,
): Promise<string | null> {
  const resolved = await getSignedImageUrlWithExpiry(bucket, path, accessToken);
  return resolved?.url ?? null;
}

export interface ResolvedGalleryImage {
  id: string;
  url: string;
}

/**
 * 画像パスの配列から、署名付きURLを解決したギャラリー用画像配列を作る。
 * 取得に失敗したパスは結果から除外する（壊れた画像を表示しないことを優先）。
 * 並列取得（Promise.all）により、パスの本数分だけ直列に待つウォーターフォールを避ける。
 */
export async function resolveGalleryImages(
  bucket: ImageBucket,
  paths: string[] | undefined | null,
  accessToken: string,
): Promise<ResolvedGalleryImage[]> {
  if (!paths || paths.length === 0) return [];

  const resolved = await Promise.all(
    paths.map(async (path): Promise<ResolvedGalleryImage | null> => {
      const url = await getSignedImageUrl(bucket, path, accessToken);
      if (!url) return null;
      return { id: path, url }; // pathをIDとして使用（削除時に必要）
    }),
  );
  return resolved.filter((image): image is ResolvedGalleryImage => image !== null);
}

/**
 * Web API 経由で単一の画像をアップロード
 */
export async function uploadImageViaApi(
  file: { base64: string; fileExtension: string },
  id: string,
  bucket: ImageBucket,
  accessToken: string,
): Promise<{ path: string }> {
  const endpoint =
    bucket === "practice-images"
      ? `${env.webApiUrl}/api/storage/images/practice`
      : `${env.webApiUrl}/api/storage/images/competition`;

  const formData = new FormData();
  const mimeType = getContentType(file.fileExtension);
  formData.append("file", {
    uri: `data:${mimeType};base64,${file.base64}`,
    type: mimeType,
    name: `image.${file.fileExtension}`,
  } as unknown as Blob);

  if (bucket === "practice-images") {
    formData.append("practiceId", id);
  } else {
    formData.append("competitionId", id);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(data.message ?? data.error ?? i18n.t("common.upload.imageUploadFailedSimple"));
  }

  return (await res.json()) as { path: string };
}

/**
 * Web API 経由で単一の画像を削除
 */
export async function deleteImageViaApi(
  path: string,
  bucket: ImageBucket,
  accessToken: string,
): Promise<void> {
  const endpoint =
    bucket === "practice-images"
      ? `${env.webApiUrl}/api/storage/images/practice`
      : `${env.webApiUrl}/api/storage/images/competition`;

  const deleteUrl = `${endpoint}?path=${encodeURIComponent(path)}`;
  const res = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? i18n.t("common.upload.imageDeleteFailedSimple"));
  }
}

/**
 * Web API 経由で複数の画像を削除
 */
export async function deleteImagesViaApi(
  paths: string[],
  bucket: ImageBucket,
  accessToken: string,
): Promise<void> {
  if (paths.length === 0) return;
  await Promise.all(paths.map((path) => deleteImageViaApi(path, bucket, accessToken)));
}

/**
 * Web API 経由で複数の画像をアップロード
 * エラー発生時は成功済みの画像をAPI経由でロールバック
 */
export async function uploadImagesViaApi(
  files: Array<{ base64: string; fileExtension: string }>,
  id: string,
  bucket: ImageBucket,
  accessToken: string,
): Promise<Array<{ path: string }>> {
  const results: Array<{ path: string }> = [];

  try {
    for (const file of files) {
      const result = await uploadImageViaApi(file, id, bucket, accessToken);
      results.push(result);
    }
    return results;
  } catch (error) {
    console.error("画像アップロード中にエラーが発生。ロールバックを開始:", error);

    const endpoint =
      bucket === "practice-images"
        ? `${env.webApiUrl}/api/storage/images/practice`
        : `${env.webApiUrl}/api/storage/images/competition`;

    for (const result of results) {
      try {
        const deleteUrl = `${endpoint}?path=${encodeURIComponent(result.path)}`;
        await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (deleteError) {
        console.error(`画像 ${result.path} の削除に失敗:`, deleteError);
      }
    }

    throw error;
  }
}

/**
 * Web API (/api/storage/profile) 経由でプロフィール画像をアップロード
 *
 * practice-images / competition-images 用の uploadImageViaApi とは異なり、
 * practiceId/competitionId に相当する id パラメータは送らない
 * (プロフィール画像は user.id をサーバー側で認証トークンから解決するため)
 */
export async function uploadProfileImageViaApi(
  file: { base64: string; fileExtension: string },
  accessToken: string,
): Promise<{ path: string }> {
  const endpoint = `${env.webApiUrl}/api/storage/profile`;

  const formData = new FormData();
  const mimeType = getContentType(file.fileExtension);
  formData.append("file", {
    uri: `data:${mimeType};base64,${file.base64}`,
    type: mimeType,
    name: `image.${file.fileExtension}`,
  } as unknown as Blob);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(data.message ?? data.error ?? i18n.t("common.upload.imageUploadFailedSimple"));
  }

  return (await res.json()) as { path: string };
}

/**
 * Web API (/api/storage/profile) 経由でプロフィール画像を削除
 *
 * ユーザーの profile-images フォルダを丸ごと削除するため、他バケットの
 * deleteImageViaApi(path, bucket, accessToken) と異なり path クエリパラメータは送らない
 */
export async function deleteProfileImageViaApi(accessToken: string): Promise<void> {
  const endpoint = `${env.webApiUrl}/api/storage/profile`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? i18n.t("common.upload.imageDeleteFailedSimple"));
  }
}
