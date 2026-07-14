/**
 * 画像URL取得ヘルパー（署名付きURL方式）
 *
 * profile-images / practice-images / competition-images は private バケットのため、
 * 公開URLを直接組み立てず、/api/storage/images/presigned-url 経由で
 * 署名付きURL（R2優先、Supabase Storageフォールバック）を取得する。
 */

export type ImageBucket = "profile-images" | "practice-images" | "competition-images";

interface SignedImageUrlResponse {
  url: string;
  expiresAt: number;
}

// 署名付きURLのキャッシュ（key = "{bucket}/{path}"）。
// expiresAt（エポックms、APIが返すTTL）まで再取得しない。
// 失効直前のURLで画像ロードが失敗しないよう、マージン分早めに失効扱いにする。
const EXPIRY_MARGIN_MS = 60 * 1000;
const signedUrlCache = new Map<string, SignedImageUrlResponse>();
// 同一 path の同時リクエストを1本のfetchに集約するための in-flight Promise
const inflightRequests = new Map<string, Promise<string | null>>();

async function fetchSignedImageUrl(bucket: ImageBucket, path: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ bucket, path });
    const res = await fetch(`/api/storage/images/presigned-url?${params.toString()}`);
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as SignedImageUrlResponse;
    signedUrlCache.set(`${bucket}/${path}`, data);
    return data.url;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

/**
 * 画像の署名付きURLを取得する
 *
 * 取得結果は失効時刻までモジュールレベルでキャッシュし、
 * 同一パスへの同時リクエストは1本に集約する（一覧表示でのN+1リクエスト防止）。
 *
 * @param bucket バケットID
 * @param path バケット内相対パス。移行期の互換のため、既にフルURL（旧データ）の場合はそのまま返す
 * @returns 署名付きURL、取得に失敗した場合はnull
 */
export async function getSignedImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;

  // 移行期の後方互換: 署名URL化前の旧データはフルURLのまま保存されている場合がある
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const key = `${bucket}/${path}`;

  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return cached.url;
  }

  const inflight = inflightRequests.get(key);
  if (inflight) {
    return inflight;
  }

  const request = fetchSignedImageUrl(bucket, path).finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, request);
  return request;
}

export interface ResolvedGalleryImage {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileName?: string;
}

/**
 * 画像パスの配列から、署名付きURLを解決したギャラリー用画像配列を作る。
 * 取得に失敗したパスは結果から除外する（壊れた画像を表示しないことを優先）。
 * 並列取得（Promise.all）により、パスの本数分だけ直列に待つウォーターフォールを避ける。
 */
export async function resolveGalleryImages(
  bucket: ImageBucket,
  paths: string[],
): Promise<ResolvedGalleryImage[]> {
  const resolved = await Promise.all(
    paths.map(async (path, index): Promise<ResolvedGalleryImage | null> => {
      const url = await getSignedImageUrl(bucket, path);
      if (!url) return null;
      return {
        id: path,
        thumbnailUrl: url,
        originalUrl: url,
        fileName: path.split("/").pop() || `image-${index + 1}`,
      };
    }),
  );
  return resolved.filter((image): image is ResolvedGalleryImage => image !== null);
}
