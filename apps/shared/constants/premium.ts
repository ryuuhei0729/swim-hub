// =============================================================================
// Premium プラン定数定義
// Free / Premium プランの機能制限値を一元管理する
// =============================================================================

export const FREE_PLAN_LIMITS = {
  /** 1 Record あたりの split_times 最大数 */
  SPLIT_TIMES_PER_RECORD: 3,

  /** 1 PracticeLog あたりの practice_times 最大数 */
  PRACTICE_TIMES_PER_LOG: 18,

  /** 1日あたりのAIトークン使用上限 */
  DAILY_TOKEN_LIMIT: 1,

  /** 画像アップロード可否 */
  IMAGE_UPLOAD_ENABLED: false,

  /** 動画アップロード可否 */
  VIDEO_UPLOAD_ENABLED: false,
} as const;

export const PREMIUM_PLAN_LIMITS = {
  SPLIT_TIMES_PER_RECORD: Infinity,
  PRACTICE_TIMES_PER_LOG: Infinity,
  IMAGE_UPLOAD_ENABLED: true,
  VIDEO_UPLOAD_ENABLED: true,
} as const;

/** Premium 制限エラーコード */
export const PREMIUM_ERROR_CODE = "PREMIUM_REQUIRED" as const;

/** Premium 制限のフィーチャー名 */
export type PremiumFeature = "image_upload" | "video_upload" | "split_time_limit" | "practice_time_limit";

/** Premium 制限エラーレスポンスの型 */
export interface PremiumRequiredError {
  error: typeof PREMIUM_ERROR_CODE;
  message: string;
  feature: PremiumFeature;
  limit?: number;
  current?: number;
}

/** Free ユーザー向けの制限メッセージ */
export const PREMIUM_MESSAGES: Record<PremiumFeature, string> = {
  image_upload: "画像の添付は Premium 会員限定です",
  video_upload: "動画の添付は Premium 会員限定です",
  split_time_limit: `Freeプランでは${FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD}個まで登録できます。Premiumにアップグレードすると無制限に`,
  practice_time_limit: `Freeプランでは${FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG}個まで登録できます。Premiumにアップグレードすると無制限に`,
};
