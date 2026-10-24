// =============================================================================
// racePace/buckets.ts - time bucket
// =============================================================================
// 距離ごとに適切な bucket 幅が違うため ms 単位の設定表で持つ。
// 後から幅を変えられるよう、参照は必ず getBucketWidthMs 経由にする。
// =============================================================================

/**
 * 距離(m) -> bucket幅(ms)
 *
 * 当初 100m=500ms (0.5秒刻み) で始めたが、実データ32,631件で計測した結果:
 *   0.5秒幅 ->  80モデル / p75-p25 平均幅 0.515pt
 *   1.0秒幅 -> 212モデル / p75-p25 平均幅 0.533pt
 * カバレッジが2.65倍になる一方、ばらつきの増加は 3.5% に留まったため
 * 1.0秒幅を既定にした。さらに広げると (4.0秒幅) モデル数は増えず
 * 解像度だけ落ちるので、ここが最適点。
 *
 * 標本が増えたら狭める方向に戻せる。参照は必ず getBucketWidthMs 経由。
 */
export const TIME_BUCKET_CONFIG: Record<number, number> = {
  50: 500,
  100: 1000,
  200: 2000,
  400: 4000,
  800: 8000,
  1500: 16000,
};

/** 設定に無い距離のフォールバック: 100m あたり 500ms 相当で按分する */
const FALLBACK_MS_PER_100M = 500;

export interface TimeBucket {
  /** bucket の下限 (含む) */
  minTimeMs: number;
  /** bucket の上限 (含む)。ms 整数なので min+width-1 で隙間なく連続する */
  maxTimeMs: number;
  /** 代表値。bucket 間補間の重み付けに使う */
  centerTimeMs: number;
  widthMs: number;
}

export function getBucketWidthMs(
  distance: number,
  config: Record<number, number> = TIME_BUCKET_CONFIG,
): number {
  const configured = config[distance];
  if (configured && configured > 0) return configured;
  return Math.max(50, Math.round((distance / 100) * FALLBACK_MS_PER_100M));
}

export function getTimeBucket(
  timeMs: number,
  distance: number,
  config: Record<number, number> = TIME_BUCKET_CONFIG,
): TimeBucket {
  const widthMs = getBucketWidthMs(distance, config);
  const minTimeMs = Math.floor(timeMs / widthMs) * widthMs;
  return {
    minTimeMs,
    maxTimeMs: minTimeMs + widthMs - 1,
    centerTimeMs: minTimeMs + Math.floor(widthMs / 2),
    widthMs,
  };
}
