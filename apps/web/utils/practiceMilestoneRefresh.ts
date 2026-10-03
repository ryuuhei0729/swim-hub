// =============================================================================
// 練習ログ保存後の後処理 (キャッシュ無効化 + マイルストーン判定) — 共通関数
// =============================================================================
// usePracticeTabSave (タブモーダル一括保存) と useDashboardHandlers.handlePracticeLogSubmit
// (「練習記録を追加」の単一メニュー簡易フォーム) の両方から呼ばれる。同じ後処理を
// 2箇所に書かないための唯一の定義元。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { GoalAPI } from "@apps/shared/api/goals";
import { practiceKeys } from "@apps/shared/hooks/queries/keys";
import { getQueryClient } from "@/providers/QueryProvider";
import { runMilestoneJudgment } from "./milestoneJudgment";

/**
 * 練習ログ・タイムの保存が終わった後に1回だけ呼ぶ。
 * - hasLogChanges が false (ログの追加/更新が無かった) なら何もしない (invalidate も判定も、
 *   ログに変更が無いのに走らせない)。
 * - 練習一覧・カレンダー等のキャッシュ無効化 → マイルストーン判定 の順に1回ずつ行う。
 *   getQueryClient() は useQueryClient() (React Context 経由) と異なり、
 *   QueryClientProvider を挟まないテストハーネスや React コンポーネントツリー外からも
 *   安全に呼べる (QueryProvider が実際に使うのと同一のシングルトンを返す純粋関数)。
 * - 判定の失敗を握りつぶす処理自体は runMilestoneJudgment に一本化してある
 *   (goals 一覧・ダッシュボードの初回判定と共通)。
 */
export async function refreshMilestonesAfterPracticeSave(
  supabase: SupabaseClient<Database>,
  userId: string,
  hasLogChanges: boolean,
): Promise<void> {
  if (!hasLogChanges) return;

  getQueryClient().invalidateQueries({ queryKey: practiceKeys.lists() });

  const goalAPI = new GoalAPI(supabase);
  await runMilestoneJudgment(goalAPI, userId);
}
