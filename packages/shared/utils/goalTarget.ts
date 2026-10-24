// =============================================================================
// 入力画面の「目標: xx.xx」バッジ: 表示対象の判定 (唯一の定義元)
// =============================================================================
// 本人画面 (Goal[]) と代理入力 (TeamGoalTarget[]) の両方、web / mobile の8箇所が
// すべてここを通す。画面側で status や「引き継ぎ」の判定を再実装しないこと。
// SQL (get_team_competition_goal_targets) は status で絞らず、ここが定義元。

import type { Goal } from "../types/goals";

/** 表示する status。cancelled は出さない */
export function isGoalTargetVisibleStatus(status: Goal["status"]): boolean {
  return status === "active" || status === "achieved";
}

/**
 * 検索対象の1件。`Goal` と `TeamGoalTarget` の両方が代入できる。
 * `competition_id` は必須: どちらの型も持つので、列を絞った型を渡すと型エラーになる
 * (大会の照合が黙って省かれ、他大会の同種目の目標が出るのを防ぐ)。
 */
export interface GoalTargetSource {
  user_id: string;
  style_id: number;
  target_time: number;
  status: Goal["status"];
  competition_id: string | null;
}

export interface FindGoalTargetTimeQuery {
  userId: string;
  /** 画面の大会 id。未保存 (null / undefined) なら目標は存在しえないので null を返す */
  competitionId: string | null | undefined;
  styleId: number;
  /** 画面が既に計算済みの「引き継ぎあり」。true なら出さない (目標の達成判定は is_relaying=false の記録で数える) */
  isRelaying?: boolean;
}

/**
 * その行に出す目標タイム。出さないときは null。
 * user・大会・種目が一致し、表示対象 status で、引き継ぎありでないものだけ。
 */
export function findGoalTargetTime(
  targets: readonly GoalTargetSource[],
  query: FindGoalTargetTimeQuery,
): number | null {
  if (query.isRelaying === true) return null;
  if (!query.competitionId) return null;

  const found = targets.find(
    (target) =>
      target.user_id === query.userId &&
      target.style_id === query.styleId &&
      target.competition_id === query.competitionId &&
      isGoalTargetVisibleStatus(target.status),
  );
  return found ? found.target_time : null;
}
