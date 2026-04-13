"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { VideoCameraIcon, TrashIcon, CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import VideoPlayer from "./VideoPlayer";
import PremiumBadge from "@/components/ui/PremiumBadge";
import { PREMIUM_MESSAGES } from "@swim-hub/shared/constants/premium";

const VideoEditor = dynamic(() => import("./VideoEditor"), { ssr: false });

interface VideoUploaderProps {
  type: "record" | "practice-log";
  /** レコードID（新規作成時は undefined → 保存後にセットして自動アップロード） */
  id?: string;
  existingVideoPath?: string | null;
  existingThumbnailPath?: string | null;
  isPremium: boolean;
  onUploadComplete?: (videoPath: string, thumbnailPath: string) => void;
  onDelete?: () => void;
}

type UploadState = "idle" | "selecting" | "editing" | "selected" | "uploading" | "done" | "error";

interface UploadUrlResponse {
  videoUploadUrl: string;
  thumbnailUploadUrl: string;
  videoPath: string;
  thumbnailPath: string;
}

export default function VideoUploader({
  type,
  id,
  existingVideoPath,
  existingThumbnailPath,
  isPremium,
  onUploadComplete,
  onDelete,
}: VideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>(
    existingVideoPath ? "done" : "idle",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingThumbnail, setPendingThumbnail] = useState<Blob | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(existingVideoPath ?? null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(
    existingThumbnailPath ?? null,
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadState("editing");
    // input をリセット（同じファイルを再選択可能に）
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const doUpload = useCallback(async (editedFile: File, thumbnail: Blob, targetId: string) => {
    setUploadState("uploading");
    setError(null);
    setUploadProgress(0);

    try {
      const uploadUrlRes = await fetch("/api/storage/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: targetId, contentType: "video/mp4" }),
      });

      if (!uploadUrlRes.ok) {
        const data = await uploadUrlRes.json() as { error?: string; message?: string };
        throw new Error(data.message ?? data.error ?? "アップロードURLの取得に失敗しました");
      }

      const { videoUploadUrl, thumbnailUploadUrl, videoPath: vPath, thumbnailPath: tPath } =
        await uploadUrlRes.json() as UploadUrlResponse;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", videoUploadUrl);
        xhr.setRequestHeader("Content-Type", "video/mp4");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 90));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`動画アップロード失敗: HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("動画アップロード中にネットワークエラーが発生しました"));
        xhr.send(editedFile);
      });

      setUploadProgress(92);

      await fetch(thumbnailUploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: thumbnail,
      });

      setUploadProgress(95);

      const confirmFormData = new FormData();
      confirmFormData.append("type", type);
      confirmFormData.append("id", targetId);
      confirmFormData.append("videoPath", vPath);
      confirmFormData.append("thumbnailPath", tPath);
      confirmFormData.append("thumbnailBlob", new File([thumbnail], "thumbnail.webp", { type: "image/webp" }));

      const confirmRes = await fetch("/api/storage/videos/confirm", {
        method: "POST",
        body: confirmFormData,
      });

      if (!confirmRes.ok) {
        const data = await confirmRes.json() as { error?: string };
        throw new Error(data.error ?? "DB更新に失敗しました");
      }

      setUploadProgress(100);
      setPendingFile(null);
      setPendingThumbnail(null);
      setVideoPath(vPath);
      setThumbnailPath(tPath);
      setUploadState("done");
      onUploadComplete?.(vPath, tPath);
    } catch (err) {
      console.error("動画アップロードエラー:", err);
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
      setUploadState("error");
    }
  }, [type, onUploadComplete]);

  const handleEditorComplete = async (editedFile: File, thumbnail: Blob) => {
    if (id) {
      // ID あり → 即アップロード
      await doUpload(editedFile, thumbnail, id);
    } else {
      // ID なし → 保留
      setPendingFile(editedFile);
      setPendingThumbnail(thumbnail);
      setUploadState("selected");
    }
  };

  // id が後からセットされた場合、保留中の動画を自動アップロード
  useEffect(() => {
    if (id && pendingFile && pendingThumbnail && uploadState === "selected") {
      doUpload(pendingFile, pendingThumbnail, id);
    }
  }, [id, pendingFile, pendingThumbnail, uploadState, doUpload]);

  const handleEditorCancel = () => {
    setSelectedFile(null);
    setUploadState("idle");
  };

  const handleCancelPending = () => {
    setPendingFile(null);
    setPendingThumbnail(null);
    setUploadState("idle");
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("動画を削除しますか？")) return;

    const endpoint =
      type === "record"
        ? `/api/storage/videos/record?recordId=${id}`
        : `/api/storage/videos/practice-log?practiceLogId=${id}`;

    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "削除に失敗しました");
      }
      setVideoPath(null);
      setThumbnailPath(null);
      setUploadState("idle");
      onDelete?.();
    } catch (err) {
      console.error("動画削除エラー:", err);
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  // Premium制限バナー
  if (!isPremium && (uploadState === "idle" || uploadState === "error")) {
    return <PremiumBadge message={PREMIUM_MESSAGES.video_upload} />;
  }

  if (uploadState === "done" && videoPath) {
    return (
      <div className="space-y-2">
        <VideoPlayer videoPath={videoPath} thumbnailPath={thumbnailPath} canDownload />
        <button
          type="button"
          onClick={handleDelete}
          aria-label="動画を削除"
          className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
        >
          <TrashIcon className="h-4 w-4" />
          動画を削除
        </button>
      </div>
    );
  }

  if (uploadState === "editing" && selectedFile) {
    return (
      <VideoEditor
        file={selectedFile}
        onComplete={handleEditorComplete}
        onCancel={handleEditorCancel}
      />
    );
  }

  // 動画選択済み（ID待ち）
  if (uploadState === "selected") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
          動画を選択済み（保存時にアップロードされます）
        </div>
        <button
          type="button"
          onClick={handleCancelPending}
          className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
        >
          <XMarkIcon className="h-4 w-4" />
          取り消し
        </button>
      </div>
    );
  }

  if (uploadState === "uploading") {
    return (
      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
        <p className="text-sm text-gray-600">アップロード中... {uploadProgress}%</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <VideoCameraIcon className="h-5 w-5" />
        動画を追加
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/hevc"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
