// =============================================================================
// Premium 判定ユーティリティ - Swim Hub 共通パッケージ
// =============================================================================

import type { SubscriptionInfo } from "../types/auth";
import { FREE_PLAN_LIMITS } from "../constants/premium";

/**
 * ユーザーが Premium かどうかを判定する
 *
 * 判定ロジック:
 *   plan = 'premium'
 *   AND status IN ('active', 'trialing')
 *   AND (premium_expires_at IS NULL OR premium_expires_at > NOW())
 */
export function checkIsPremium(subscription: SubscriptionInfo | null): boolean {
  if (!subscription) return false;

  const { plan, status, premiumExpiresAt } = subscription;

  if (plan !== "premium") return false;
  if (status !== "active" && status !== "trialing") return false;

  if (premiumExpiresAt) {
    const expiresAt = new Date(premiumExpiresAt);
    if (expiresAt <= new Date()) return false;
  }

  return true;
}

/**
 * ユーザーのプランに応じた制限値を取得する
 */
export function getPlanLimits(isPremium: boolean) {
  return {
    splitTimesPerRecord: isPremium ? Infinity : FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD,
    practiceTimesPerLog: isPremium ? Infinity : FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG,
    imageUploadEnabled: isPremium,
  };
}

/**
 * 画像アップロードが許可されているかチェック
 */
export function canUploadImage(isPremium: boolean): boolean {
  return isPremium;
}

/**
 * Split-time の登録件数が制限内かチェック
 */
export function canAddSplitTimes(count: number, isPremium: boolean): boolean {
  if (isPremium) return true;
  return count < FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD;
}

/**
 * PracticeTime の登録件数が制限内かチェック
 */
export function canAddPracticeTimes(count: number, isPremium: boolean): boolean {
  if (isPremium) return true;
  return count < FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG;
}
