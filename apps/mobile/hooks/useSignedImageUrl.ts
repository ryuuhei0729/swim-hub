import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { getSignedImageUrl, type ImageBucket } from "@/utils/imageUpload";

interface UseSignedImageUrlResult {
  url: string | null;
  isLoading: boolean;
}

/**
 * 画像の署名付き表示URLを取得するフック（Issue #36: private バケット対応）
 *
 * profile-images / practice-images / competition-images は private バケットのため、
 * バケット内相対パスから /api/storage/images/presigned-url 経由で表示用URLを解決する。
 * path が http(s) で始まる場合（移行期の旧データ）はそのまま返す。
 */
export function useSignedImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
): UseSignedImageUrlResult {
  const { session } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!path) {
      setUrl(null);
      setIsLoading(false);
      return;
    }
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getSignedImageUrl(bucket, path, session.access_token)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((err) => {
        if (!cancelled) setUrl(null);
        console.error("署名付き画像URLの取得に失敗:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, path, session?.access_token]);

  return { url, isLoading };
}
