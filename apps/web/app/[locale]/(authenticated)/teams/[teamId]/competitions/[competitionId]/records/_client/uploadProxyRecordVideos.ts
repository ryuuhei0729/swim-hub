// =============================================================================
// 大会記録の代理入力 - 保存した記録への動画の添付
// =============================================================================
//
// 記録の保存が成功した後に、フォームで選んだ動画を各メンバーの記録へ添付する
// (upload-url → PUT → confirm → team-assign)。失敗は行ごとに集めて返し、
// 黙って捨てない。対象は「保存が成功した全 record (insert + update)」。

import type { StyleEntry } from "./buildStyleEntries";

export type VideoUploadErrorKey =
  | "errorVideoUploadUrlFailed"
  | "errorVideoUploadFailed"
  | "errorVideoThumbnailFailed"
  | "errorVideoConfirmFailed"
  | "errorVideoAssignFailed"
  | "errorVideoGenericFailed"
  | "errorVideoNoThumbnail";

export interface VideoUploadError {
  key: VideoUploadErrorKey;
  name: string;
  status?: number;
}

export async function uploadProxyRecordVideos(params: {
  entries: readonly StyleEntry[];
  /** フォーム行 id → 保存後の records.id (saveStyleRecords の戻り値) */
  savedRecordIdByRowId: ReadonlyMap<string, string>;
  teamId: string;
}): Promise<VideoUploadError[]> {
  const { entries, savedRecordIdByRowId, teamId } = params;
  const errors: VideoUploadError[] = [];

  for (const entry of entries) {
    for (const mr of entry.memberRecords) {
      if (!mr.videoFile || !mr.id) continue;
      // mr.id (フォーム行 id) を records.id にそのまま使わない — 既存記録由来の行では
      // 一致するが、エントリー由来・新規行では一致しないため、保存後の実 id に解決する。
      // 見つからない場合 (タイム未入力でそもそも保存対象にならなかった行) は mr.id のまま
      // 試み、既存の挙動 (404 → errorVideoUploadUrlFailed) を変えない。
      const recordId = savedRecordIdByRowId.get(mr.id) ?? mr.id;
      const name = mr.memberName;
      try {
        const uploadUrlRes = await fetch("/api/storage/videos/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "record", id: recordId, contentType: "video/mp4" }),
        });
        if (!uploadUrlRes.ok) {
          errors.push({ key: "errorVideoUploadUrlFailed", name, status: uploadUrlRes.status });
          continue;
        }
        const {
          videoUploadUrl,
          thumbnailUploadUrl,
          videoPath,
          thumbnailPath,
        } = (await uploadUrlRes.json()) as {
          videoUploadUrl: string;
          thumbnailUploadUrl: string;
          videoPath: string;
          thumbnailPath: string;
        };

        const putRes = await fetch(videoUploadUrl, { method: "PUT", body: mr.videoFile });
        if (!putRes.ok) {
          errors.push({ key: "errorVideoUploadFailed", name, status: putRes.status });
          continue;
        }

        if (mr.videoThumbnailBlob) {
          const thumbRes = await fetch(thumbnailUploadUrl, {
            method: "PUT",
            body: mr.videoThumbnailBlob,
          });
          if (!thumbRes.ok) {
            errors.push({ key: "errorVideoThumbnailFailed", name, status: thumbRes.status });
            continue;
          }
        }

        const confirmFormData = new FormData();
        confirmFormData.append("type", "record");
        confirmFormData.append("id", recordId);
        confirmFormData.append("videoPath", videoPath);
        confirmFormData.append("thumbnailPath", thumbnailPath);
        if (mr.videoThumbnailBlob) {
          confirmFormData.append(
            "thumbnailBlob",
            new File([mr.videoThumbnailBlob], "thumbnail.jpg", { type: "image/jpeg" }),
          );
        }
        const confirmRes = await fetch("/api/storage/videos/confirm", {
          method: "POST",
          body: confirmFormData,
        });
        if (!confirmRes.ok) {
          errors.push({ key: "errorVideoConfirmFailed", name, status: confirmRes.status });
          continue;
        }

        // team-assign はサムネイル必須 (サーバー側で thumbnails/.../{sourceId}.jpg を
        // コピーする)。サムネイル未生成のまま呼ぶと失敗するため、呼ばずに知らせる。
        if (!mr.videoThumbnailBlob) {
          errors.push({ key: "errorVideoNoThumbnail", name });
          continue;
        }

        const assignRes = await fetch("/api/storage/videos/team-assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "record",
            sourceId: recordId,
            targetUserId: mr.memberUserId,
            teamId,
            tempVideoPath: videoPath,
            tempThumbnailPath: thumbnailPath,
          }),
        });
        if (!assignRes.ok) {
          errors.push({ key: "errorVideoAssignFailed", name, status: assignRes.status });
        }
      } catch (videoErr) {
        console.error("動画アップロードエラー:", videoErr);
        errors.push({ key: "errorVideoGenericFailed", name });
      }
    }
  }

  return errors;
}
