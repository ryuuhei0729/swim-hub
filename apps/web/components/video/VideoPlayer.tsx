"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowDownTrayIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";

interface VideoPlayerProps {
  videoPath: string;
  thumbnailPath?: string | null;
  canDownload?: boolean;
  className?: string;
}

interface PresignedUrlResponse {
  url: string;
  thumbnailUrl: string | null;
  expiresAt: string;
}

export default function VideoPlayer({
  videoPath,
  thumbnailPath,
  canDownload = false,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [thumbnailPresignedUrl, setThumbnailPresignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  const fetchPresignedUrls = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ path: videoPath });
      if (thumbnailPath) {
        params.set("thumbnailPath", thumbnailPath);
      }
      const res = await fetch(`/api/storage/videos/presigned-url?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "URL取得に失敗しました");
      }
      const data = await res.json() as PresignedUrlResponse;
      setPresignedUrl(data.url);
      setThumbnailPresignedUrl(data.thumbnailUrl);
      setExpiresAt(new Date(data.expiresAt));
    } catch (err) {
      console.error("署名付きURL取得エラー:", err);
      setError(err instanceof Error ? err.message : "動画の読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [videoPath, thumbnailPath]);

  useEffect(() => {
    void fetchPresignedUrls();
  }, [fetchPresignedUrls]);

  // 23時間後に自動再取得
  useEffect(() => {
    if (!expiresAt) return;
    const msUntilRefresh = expiresAt.getTime() - Date.now() - 60 * 60 * 1000; // 1時間前に再取得
    if (msUntilRefresh <= 0) return;
    const timer = setTimeout(() => {
      void fetchPresignedUrls();
    }, msUntilRefresh);
    return () => clearTimeout(timer);
  }, [expiresAt, fetchPresignedUrls]);

  const handleFullscreen = () => {
    if (videoRef.current) {
      void videoRef.current.requestFullscreen();
    }
  };

  if (isLoading) {
    return (
      <div
        className={`aspect-video rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center ${className}`}
      >
        <div className="text-gray-400 text-sm">動画を読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`aspect-video rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center ${className}`}
      >
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg overflow-hidden bg-black ${className}`}>
      <video
        ref={videoRef}
        src={presignedUrl ?? undefined}
        poster={thumbnailPresignedUrl ?? undefined}
        controls
        className="w-full aspect-video"
        playsInline
      />
      {/* カスタムコントロールボタン */}
      <div className="absolute bottom-2 right-2 flex gap-2">
        <button
          type="button"
          onClick={handleFullscreen}
          aria-label="フルスクリーン"
          className="bg-black/60 text-white rounded p-1 hover:bg-black/80 transition-colors"
        >
          <ArrowsPointingOutIcon className="h-4 w-4" />
        </button>
        {canDownload && presignedUrl && (
          <a
            href={presignedUrl}
            download="video.mp4"
            aria-label="ダウンロード"
            className="bg-black/60 text-white rounded p-1 hover:bg-black/80 transition-colors inline-flex"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
