// =============================================================================
// 入力画面の「目標: xx.xx」バッジ用の目標タイム (RPC get_team_competition_goal_targets の行)
// =============================================================================

import type { Goal } from "./goals";

/**
 * 代理入力用: 指定大会内のチームメンバーの目標。
 * status は絞られていない (cancelled も含む)。表示対象は `isGoalTargetVisibleStatus` が決める。
 */
export interface TeamGoalTarget {
  /** RPC は返さない。API 層 (`TeamGoalTargetsAPI.listForCompetition`) が引数の大会 id を付与する */
  competition_id: string;
  user_id: string;
  style_id: number;
  target_time: number;
  status: Goal["status"];
}
