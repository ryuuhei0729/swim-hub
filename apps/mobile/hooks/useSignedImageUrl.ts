import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import {
  getSignedImageUrlWithExpiry,
  type ImageBucket,
  type SignedImageUrlResponse,
} from "@/utils/imageUpload";

interface UseSignedImageUrlResult {
  url: string | null;
  isLoading: boolean;
}

/** 失効よりこのマージンだけ早く再取得する（表示中にURLが切れるのを防ぐ） */
const EXPIRY_MARGIN_MS = 60 * 1000;
/** 再取得スケジュールの下限（サーバー時刻ズレ等による即時再取得ループを防ぐ） */
const MIN_REFRESH_DELAY_MS = 10 * 1000;

/** urlCache の上限。長時間セッションで多数の画像パスを扱ってもメモリが単調増加しないようにする */
const URL_CACHE_MAX_ENTRIES = 200;

/**
 * `bucket:path` → 解決済み署名URL のモジュールキャッシュ。
 * 一覧（GroupMemberListModal 等）で行ごとの再取得・リマウント時の再取得を防ぐ。
 */
const urlCache = new Map<string, SignedImageUrlResponse>();
/** 同一 key の並行リクエストを1本にまとめる (dedupe) */
const inflight = new Map<string, Promise<SignedImageUrlResponse | null>>();

function cacheKey(bucket: ImageBucket, path: string): string {
  return `${bucket}:${path}`;
}

function isFresh(entry: SignedImageUrlResponse): boolean {
  return entry.expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

/**
 * 失効済みエントリを掃除し、上限超過時は最も古い挿入分から追い出す。
 * (Map は挿入順を保持するため、先頭から削除する簡易 LRU)
 */
function pruneUrlCache(): void {
  for (const [key, entry] of urlCache) {
    if (!isFresh(entry)) urlCache.delete(key);
  }
  while (urlCache.size >= URL_CACHE_MAX_ENTRIES) {
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey === undefined) break;
    urlCache.delete(oldestKey);
  }
}

async function resolveSignedImageUrl(
  bucket: ImageBucket,
  path: string,
  accessToken: string,
): Promise<SignedImageUrlResponse | null> {
  const key = cacheKey(bucket, path);
  const cached = urlCache.get(key);
  if (cached && isFresh(cached)) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = getSignedImageUrlWithExpiry(bucket, path, accessToken)
    .then((entry) => {
      if (entry) {
        pruneUrlCache();
        urlCache.set(key, entry);
      }
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/**
 * 画像の署名付き表示URLを取得するフック（Issue #36: private バケット対応）
 *
 * profile-images / practice-images / competition-images は private バケットのため、
 * バケット内相対パスから /api/storage/images/presigned-url 経由で表示用URLを解決する。
 * path が http(s) で始まる場合（移行期の旧データ）はそのまま返す。
 *
 * - API の expiresAt を保持し、失効前に自動で再取得する
 * - モジュールキャッシュ + 並行リクエストの dedupe で一覧での N+1 取得を防ぐ
 * - アクセストークンが無い間は url を null にする（path 変更直後に前の画像が残らない）
 */
export function useSignedImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
): UseSignedImageUrlResult {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setIsLoading(false);
      return;
    }
    if (!accessToken) {
      // トークンが一瞬欠落した場合でも、直前の path の画像を表示し続けない
      setUrl(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const entry = await resolveSignedImageUrl(bucket, path, accessToken).catch(
        (err: unknown) => {
          console.error("署名付き画像URLの取得に失敗:", err);
          return null;
        },
      );
      if (cancelled) return;
      setUrl(entry?.url ?? null);
      setIsLoading(false);
      // expiresAt を尊重し、失効前に再取得する（旧URLのまま切れるのを防ぐ）
      if (entry && Number.isFinite(entry.expiresAt)) {
        const delay = Math.max(entry.expiresAt - EXPIRY_MARGIN_MS - Date.now(), MIN_REFRESH_DELAY_MS);
        refreshTimer = setTimeout(() => {
          void load();
        }, delay);
      }
    };

    const cached = urlCache.get(cacheKey(bucket, path));
    if (cached && isFresh(cached)) {
      // キャッシュ命中: 同期反映してローディングのちらつきを避ける（再取得予約は load 内で行う）
      setUrl(cached.url);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    void load();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [bucket, path, accessToken]);

  return { url, isLoading };
}
