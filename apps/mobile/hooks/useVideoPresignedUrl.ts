import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { getPresignedUrl } from "@/utils/videoUpload";

interface UseVideoPresignedUrlResult {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * 動画の署名付き再生URLを取得・キャッシュするフック
 */
export function useVideoPresignedUrl(
  videoPath: string | null | undefined,
  thumbnailPath?: string | null,
): UseVideoPresignedUrlResult {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUrls = useCallback(async () => {
    if (!videoPath || !session?.access_token) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPresignedUrl(
        videoPath,
        thumbnailPath ?? null,
        session.access_token,
      );
      setVideoUrl(result.url);
      setThumbnailUrl(result.thumbnailUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.video.urlFetchFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [videoPath, thumbnailPath, session?.access_token, t]);

  useEffect(() => {
    fetchUrls();
  }, [fetchUrls]);

  // 23時間後に自動再取得（署名付きURLの有効期限 = 24時間）
  useEffect(() => {
    if (!videoUrl) return;

    const timer = setTimeout(
      () => {
        fetchUrls();
      },
      23 * 60 * 60 * 1000,
    );

    return () => clearTimeout(timer);
  }, [videoUrl, fetchUrls]);

  return { videoUrl, thumbnailUrl, isLoading, error, refetch: fetchUrls };
}
