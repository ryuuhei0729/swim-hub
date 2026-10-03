// =============================================================================
// マイルストーン達成判定の実行 (失敗を握りつぶす) — 共通関数
// =============================================================================
// サーバーコンポーネント (goals/_server/GoalDataLoader.tsx) とクライアント
// コンポーネント (dashboard/_client/DashboardClient.tsx、practiceMilestoneRefresh.ts
// 経由の usePracticeTabSave/useDashboardHandlers) の両方から呼ばれるため、
// React Query 等クライアント専用の API には依存しない (フックも "use client" も無い)。

import type { GoalAPI } from "@apps/shared/api/goals";

/**
 * ユーザーの全アクティブなマイルストーンの達成判定を1回実行する。
 * 失敗しても呼び出し元の後続処理 (一覧の取得・画面表示) を止めない。
 */
export async function runMilestoneJudgment(goalAPI: GoalAPI, userId: string): Promise<void> {
  try {
    await goalAPI.updateAllMilestoneStatuses(userId);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("マイルストーンステータス更新エラー:", error);
    }
  }
}
