// =============================================================================
// ストアの評価ダイアログ (OS 標準の In-App Review)
// =============================================================================
//
// 大会か記録を新しく登録したとき、端末ごとに1回だけ評価を依頼する。
// 表示するかどうかは OS が決め (iOS は 365 日に3回まで)、実際に出たかはアプリから分からない。
// 依頼済みの印はログアウトしても消さない (同じ端末で何度も依頼しないため)。

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";

const STORAGE_KEY = "store-review-requested";

/** 保存完了のトーストと画面遷移を先に見せてから依頼する */
export const STORE_REVIEW_DELAY_MS = 1000;

let inFlight = false;

/**
 * 保存後の判定でマイルストーンの達成候補ができると、MilestoneAchievementPrompter が確認ダイアログを出す。
 * 評価のダイアログと重ならないよう、候補があるかを調べる。保存直後の候補の取り直しが進行中なら、
 * fetchQuery はその取得の結果を待つ (同じキーの取得中は新しく取得しない)。
 */
export async function hasPendingAchievementPrompt(
  queryClient: QueryClient,
  supabase: SupabaseClient,
): Promise<boolean> {
  const pending = await queryClient.fetchQuery({
    queryKey: goalKeys.pendingAchievements(),
    queryFn: () => new GoalAPI(supabase).getPendingAchievementMilestones(),
  });
  return pending.length > 0;
}

/**
 * 登録が成功した直後に呼ぶ。失敗しても登録そのものには影響させないので、例外は投げない。
 * shouldSkip が true を返したら今回は依頼せず、依頼済みの印も残さない (次の登録で依頼する)。
 */
export async function requestStoreReviewOnce(shouldSkip?: () => Promise<boolean>): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    if ((await AsyncStorage.getItem(STORAGE_KEY)) !== null) return;
    await new Promise((resolve) => setTimeout(resolve, STORE_REVIEW_DELAY_MS));
    if (shouldSkip && (await shouldSkip())) return;
    // ネイティブモジュールが無いバイナリ (追加前のビルド) では import 時に例外になるので、
    // 使う直前に読み込む。requestReview() はネイティブが無いとストアの URL を開いてしまうため、
    // isAvailableAsync() が true のときだけ呼ぶ (TestFlight では false)。
    const StoreReview = await import("expo-store-review");
    if (!(await StoreReview.isAvailableAsync())) return;
    await AsyncStorage.setItem(STORAGE_KEY, new Date().toISOString());
    await StoreReview.requestReview();
  } catch {
    // 評価の依頼に失敗しても無視する
  } finally {
    inFlight = false;
  }
}
