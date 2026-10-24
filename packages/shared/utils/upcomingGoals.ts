// =============================================================================
// 本人の目標一覧に出す目標の絞り込みと並び順
// =============================================================================
// 大会が終わった目標 (最終日が今日より前) は出さない。複数日開催は終了日で判定する。
// 大会情報なし (competition が null) の目標は削除できるよう残し、末尾に置く。
// 並びは大会日昇順 → created_at 昇順 → id 昇順 (管理者向け sortTeamMemberGoals と同じ)。

import { isCompetitionOver } from "./date";

interface GoalWithCompetitionDates {
  id: string;
  created_at: string;
  competition?: { date: string; end_date?: string | null } | null;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * @param today - 基準日 (YYYY-MM-DD)。日付が変わったときに呼び出し側で再計算させるため必須
 */
export function selectUpcomingGoals<T extends GoalWithCompetitionDates>(
  goals: readonly T[],
  today: string,
): T[] {
  return goals
    .filter((goal) => !isCompetitionOver(goal.competition?.date, goal.competition?.end_date, today))
    .sort((a, b) => {
      const dateA = a.competition?.date;
      const dateB = b.competition?.date;
      if (dateA !== dateB) {
        if (!dateA) return 1;
        if (!dateB) return -1;
        return compareStrings(dateA, dateB);
      }
      const byCreated = Date.parse(a.created_at) - Date.parse(b.created_at);
      if (byCreated !== 0 && !Number.isNaN(byCreated)) return byCreated;
      return compareStrings(a.id, b.id);
    });
}
