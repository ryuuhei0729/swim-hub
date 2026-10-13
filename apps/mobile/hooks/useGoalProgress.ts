import type { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";

/**
 * 達成率クエリの定義。null = 計算不能 (大会の水路が分からない)、計算に失敗したら 0。
 * 一覧は目標ごとに useQueries でこれを並列実行する。goalKeys.all 配下なので、
 * 判定後の invalidate で他の目標系クエリと一緒に取り直される。
 */
export function goalProgressQuery(goalAPI: GoalAPI, goalId: string) {
  return {
    queryKey: [...goalKeys.all, "progress", goalId] as const,
    queryFn: async (): Promise<number | null> => {
      try {
        return await goalAPI.calculateGoalProgress(goalId);
      } catch (error) {
        console.error("Failed to calculate goal progress:", error);
        return 0;
      }
    },
  };
}
