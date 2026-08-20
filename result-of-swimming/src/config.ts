// =============================================================================
// config.ts - 出力先とクロールの既定値
// =============================================================================
// import.meta.url を使わないのは、この package を CJS として解決する必要が
// あるため (apps/shared に "type": "module" が無く、ESM から named import
// できない)。CLI は npm scripts 経由で package ルートから実行されるので
// process.cwd() を基準にして問題ない。ROS_DATA_DIR で上書きできる。
// =============================================================================
import path from "node:path";

export const DATA_DIR = process.env.ROS_DATA_DIR ?? path.resolve(process.cwd(), "data");

export const paths = {
  /** 生レスポンスのキャッシュ (= 取得済み集合) */
  cache: path.join(DATA_DIR, "cache"),
  /** 実行ログ */
  journal: path.join(DATA_DIR, "journal.jsonl"),
  /** パース済み RawRace (1行1件) */
  races: path.join(DATA_DIR, "races.jsonl"),
  /** 集計済み RacePaceModel */
  models: path.join(DATA_DIR, "models.json"),
  /** Supabase 投入用 */
  exportSql: path.join(DATA_DIR, "race_pace_models.sql"),
};

/**
 * サイトに配慮した既定値。緩める場合は理由を持って明示的に指定する。
 *
 * 2026-08-20: 1500ms 間隔 (実効 0.43 req/s) で約20分連続稼働したところ
 * IP 単位で 403 ブロックされた。公開クォータ (x-ratelimit-remaining) は
 * 2,980 残っていたので、それとは別の未文書の閾値がある。
 * 実効レートを約1/4に落とし、1回の実行を短く区切る前提に変更した。
 */
export const CRAWL_DEFAULTS = {
  minIntervalMs: 6000,
  maxRetries: 3,
  rateLimitFloor: 300,
  throttleWaitMs: 60_000,
  backoffBaseMs: 2000,
  /** 403 がこの回数連続したら中断する */
  consecutiveBlockLimit: 5,
};

/**
 * 1回の実行で出す結果リクエストの推奨上限。
 * 連続稼働そのものが引き金になったため、少量を回して間を空ける運用にする。
 */
export const RECOMMENDED_RESULT_LIMIT_PER_RUN = 150;
