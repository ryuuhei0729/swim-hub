/**
 * 画像アップロードユーティリティ
 * 練習記録・大会記録の画像をSupabase Storageにアップロード
 */

import { randomUUID } from "expo-crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { base64ToArrayBuffer } from "./base64";
import { canUploadImage } from "@swim-hub/shared/utils/premium";
import i18n from "@/i18n";
import { env } from "@/lib/env";

export type ImageBucket = "profile-images" | "practice-images" | "competition-images";

export interface UploadImageParams {
  supabase: SupabaseClient;
  userId: string;
  recordId: string;
  base64: string;
  fileExtension: string;
  bucket: ImageBucket;
  /** Premium ユーザーかどうか（防御的チェック用、省略時はチェックしない） */
  isPremium?: boolean;
}

export interface UploadResult {
  path: string;
  publicUrl: string;
}

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
 * 単一の画像をアップロード
 * @returns アップロードされた画像のパスとpublicUrl
 */
export async function uploadImage({
  supabase,
  userId,
  recordId,
  base64,
  fileExtension,
  bucket,
  isPremium,
}: UploadImageParams): Promise<UploadResult> {
  // Premium チェック（防御的: isPremium が明示的に false の場合のみブロック）
  if (isPremium === false && !canUploadImage(false)) {
    throw new Error(i18n.t("forms.premium.imageUpload"));
  }

  // base64をArrayBufferに変換
  const arrayBuffer = base64ToArrayBuffer(base64);

  // ファイル名を生成
  const uuid = generateUUID();
  const fileName = `${uuid}.${fileExtension}`;
  const filePath = `${userId}/${recordId}/${fileName}`;

  // コンテンツタイプを決定
  const contentType = getContentType(fileExtension);

  // Supabase Storageにアップロード
  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });

  if (uploadError) {
    console.error("画像アップロードエラー:", uploadError);
    throw new Error(i18n.t("common.upload.imageUploadFailedDetail", { detail: uploadError.message }));
  }

  // 公開URLを取得
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return {
    path: filePath,
    publicUrl: data.publicUrl,
  };
}

/**
 * 複数の画像をアップロード
 * エラー発生時は成功済みの画像をロールバック
 */
export async function uploadImages(
  supabase: SupabaseClient,
  userId: string,
  recordId: string,
  images: Array<{ base64: string; fileExtension: string }>,
  bucket: ImageBucket,
  isPremium?: boolean,
): Promise<UploadResult[]> {
  // Premium チェック（防御的: isPremium が明示的に false の場合のみブロック）
  if (isPremium === false && !canUploadImage(false)) {
    throw new Error(i18n.t("forms.premium.imageUpload"));
  }

  const results: UploadResult[] = [];

  try {
    for (const image of images) {
      const result = await uploadImage({
        supabase,
        userId,
        recordId,
        base64: image.base64,
        fileExtension: image.fileExtension,
        bucket,
      });
      results.push(result);
    }
    return results;
  } catch (error) {
    // ロールバック: 成功済みの画像をすべて削除
    console.error("画像アップロード中にエラーが発生。ロールバックを開始:", error);

    for (const result of results) {
      try {
        await deleteImage(supabase, result.path, bucket);
      } catch (deleteError) {
        console.error(`画像 ${result.path} の削除に失敗:`, deleteError);
      }
    }

    throw error;
  }
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
    console.error("画像削除エラー:", error);
    throw new Error(i18n.t("common.upload.imageDeleteFailedDetail", { detail: error.message }));
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
    console.error("画像削除エラー:", error);
    throw new Error(i18n.t("common.upload.imageDeleteFailedDetail", { detail: error.message }));
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
 * Web API (/api/storage/images/presigned-url) 経由で画像の署名付きURLを取得する
 *
 * profile-images / practice-images / competition-images は private バケットのため、
 * 公開URLを直接組み立てず、このAPI経由でのみ表示用URLを取得できる。
 *
 * @param bucket バケットID
 * @param path バケット内相対パス。移行期の互換のため、既にフルURL（旧データ）の場合はそのまま返す
 * @param accessToken Supabase access token
 * @returns 署名付きURL、取得に失敗した場合はnull
 */
export async function getSignedImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
  accessToken: string,
): Promise<string | null> {
  if (!path) return null;

  // 移行期の後方互換: 署名URL化前の旧データはフルURLのまま保存されている場合がある
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
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
    const data = (await res.json()) as SignedImageUrlResponse;
    return data.url;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
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
