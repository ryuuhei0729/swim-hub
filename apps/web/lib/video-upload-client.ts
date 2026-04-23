"use client";

/**
 * クライアントサイドの動画アップロードヘルパー
 *
 * VideoUploader コンポーネント内の doUpload ロジックを抽出したもの。
 * 新規作成時（ID未確定）のケースで PracticeClient.tsx などの親が
 * mutation 成功後に直接アップロードするために使用する。
 */

interface UploadUrlResponse {
  videoUploadUrl: string;
  thumbnailUploadUrl: string;
  videoPath: string;
  thumbnailPath: string;
}

export interface UploadVideoParams {
  type: "record" | "practice-log";
  id: string;
  file: File;
  thumbnail: Blob;
  /** アップロード進捗の通知コールバック（0〜100） */
  onProgress?: (progress: number) => void;
}

export interface UploadVideoResult {
  videoPath: string;
  thumbnailPath: string;
}

/**
 * 動画ファイルと thumbnail Blob を Supabase Storage にアップロードし、
 * DB を更新する（upload-url → PUT → confirm の3ステップ）。
 *
 * @throws アップロード失敗時は Error を throw する
 */
export async function uploadVideoClient({
  type,
  id,
  file,
  thumbnail,
  onProgress,
}: UploadVideoParams): Promise<UploadVideoResult> {
  // Step 1: アップロード URL を取得
  const uploadUrlRes = await fetch("/api/storage/videos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, contentType: "video/mp4" }),
  });

  if (!uploadUrlRes.ok) {
    const data = (await uploadUrlRes.json()) as { error?: string; message?: string };
    throw new Error(data.message ?? data.error ?? "アップロードURLの取得に失敗しました");
  }

  const { videoUploadUrl, thumbnailUploadUrl, videoPath, thumbnailPath } =
    (await uploadUrlRes.json()) as UploadUrlResponse;

  // Step 2: 動画ファイルを XHR で PUT（進捗通知あり）
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", videoUploadUrl);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 90));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`動画アップロード失敗: HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () =>
      reject(new Error("動画アップロード中にネットワークエラーが発生しました"));
    xhr.send(file);
  });

  onProgress?.(92);

  // Step 3: サムネイルを PUT
  const thumbnailPutRes = await fetch(thumbnailUploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: thumbnail,
  });
  if (!thumbnailPutRes.ok) {
    throw new Error(`サムネイルアップロード失敗: HTTP ${thumbnailPutRes.status}`);
  }

  onProgress?.(95);

  // Step 4: DB を更新（confirm）
  const confirmFormData = new FormData();
  confirmFormData.append("type", type);
  confirmFormData.append("id", id);
  confirmFormData.append("videoPath", videoPath);
  confirmFormData.append("thumbnailPath", thumbnailPath);
  confirmFormData.append(
    "thumbnailBlob",
    new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" }),
  );

  const confirmRes = await fetch("/api/storage/videos/confirm", {
    method: "POST",
    body: confirmFormData,
  });

  if (!confirmRes.ok) {
    const data = (await confirmRes.json()) as { error?: string };
    throw new Error(data.error ?? "DB更新に失敗しました");
  }

  onProgress?.(100);

  return { videoPath, thumbnailPath };
}
