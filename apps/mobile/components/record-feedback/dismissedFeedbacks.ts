// =============================================================================
// ダッシュボードの FB 受信ポップアップで「閉じる」を押した FB の記録 (アプリのプロセス内メモリ)
// =============================================================================
// 仕様 (docs/specs/record-feedback.md):
//   「閉じる」では既読にしない。同じセッション (= アプリのプロセスが生きている間) は
//   閉じたときに出ていた FB では再表示しない。キーは `feedback_id:updated_at` なので、
//   本文が編集された FB (updated_at が進む) はもう一度出る。
// =============================================================================

import type { UnreadRecordFeedback } from "@swim-hub/shared/types";

const dismissedKeys = new Set<string>();

export function feedbackDismissKey(feedback: Pick<UnreadRecordFeedback, "id" | "updated_at">): string {
  return `${feedback.id}:${feedback.updated_at}`;
}

/** 閉じた FB を記録する */
export function dismissFeedbacks(feedbacks: Pick<UnreadRecordFeedback, "id" | "updated_at">[]): void {
  for (const feedback of feedbacks) dismissedKeys.add(feedbackDismissKey(feedback));
}

/** まだ閉じていない FB だけを返す (並び順は保つ) */
export function filterUndismissedFeedbacks<T extends Pick<UnreadRecordFeedback, "id" | "updated_at">>(
  feedbacks: T[],
): T[] {
  return feedbacks.filter((feedback) => !dismissedKeys.has(feedbackDismissKey(feedback)));
}

/** テスト用: 記録を消す */
export function resetDismissedFeedbacksForTest(): void {
  dismissedKeys.clear();
}
