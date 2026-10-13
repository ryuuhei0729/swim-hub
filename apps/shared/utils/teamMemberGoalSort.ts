// =============================================================================
// チーム管理者向けメンバー目標の並び順
// =============================================================================
// 今後の大会 (大会日昇順。今日を含む) → 過去の大会 (大会日降順) → 大会 NULL。
// 同日・同グループ内は created_at 昇順 → id 昇順。

import type { TeamMemberGoal } from "../types/teamMemberGoals";
import { isCompetitionDateInPast } from "./date";

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareCreatedThenId(a: TeamMemberGoal, b: TeamMemberGoal): number {
  const byCreated = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (byCreated !== 0 && !Number.isNaN(byCreated)) return byCreated;
  return compareStrings(a.id, b.id);
}

/** 0 = 今後 (今日を含む), 1 = 過去, 2 = 大会情報なし */
function groupOf(goal: TeamMemberGoal): 0 | 1 | 2 {
  if (!goal.competition_date) return 2;
  return isCompetitionDateInPast(goal.competition_date) ? 1 : 0;
}

export function sortTeamMemberGoals(goals: readonly TeamMemberGoal[]): TeamMemberGoal[] {
  return [...goals].sort((a, b) => {
    const groupA = groupOf(a);
    const groupB = groupOf(b);
    if (groupA !== groupB) return groupA - groupB;

    // groupOf が 2 以外を返す = competition_date は非 null
    if (a.competition_date && b.competition_date && a.competition_date !== b.competition_date) {
      const byDate = compareStrings(a.competition_date, b.competition_date);
      return groupA === 1 ? -byDate : byDate;
    }
    return compareCreatedThenId(a, b);
  });
}
