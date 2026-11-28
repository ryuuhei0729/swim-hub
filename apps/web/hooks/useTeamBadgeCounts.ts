"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts";
import { useTeamsQuery, usePendingMembersCountsByTeamQuery } from "@apps/shared/hooks/queries/teams";
import { useUnansweredAttendancesQuery } from "@apps/shared/hooks/queries/notifications";
import { isApprovedMembership } from "@/utils/teamView";

export interface TeamBadgeCount {
  /** 自分の出欠未回答 (今日以降・受付中) */
  unanswered: number;
  /** 承認待ちメンバー (自分が管理者のチームのみ) */
  pendingMembers: number;
}

const EMPTY: TeamBadgeCount = { unanswered: 0, pendingMembers: 0 };

/** バッジに出す件数の文字列。100 以上は "99+" に丸める (mobile の formatBadgeCount と同じ) */
export function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * チーム関連のバッジ件数 (mobile の hooks/useTeamBadgeCounts と同じ数え方。swimhub-tasks #73)。
 * サイドバーの「チーム」(合計) と、チーム画面のチーム切替・タブ (チームごと) に同じ値を出す。
 *
 * - 出欠の未回答: 承認済みのチームの、今日以降で締切でない練習・大会のうち自分が答えていないもの
 *   (ダッシュボードのお知らせと同じ useUnansweredAttendancesQuery)
 * - 承認待ち: 自分が管理者のチームの承認待ちメンバー数 (表示中のビューに関係なく数える)
 */
export function useTeamBadgeCounts(): {
  total: number;
  byTeam: Record<string, TeamBadgeCount>;
  countOf: (teamId: string) => TeamBadgeCount;
} {
  const { supabase, user } = useAuth();
  const { teams = [] } = useTeamsQuery(supabase, { enableRealtime: false });

  const approvedTeams = useMemo(() => teams.filter(isApprovedMembership), [teams]);
  const teamsForNotifications = useMemo(
    () =>
      approvedTeams.map((m) => ({
        team_id: m.team_id,
        team: m.teams ? { name: m.teams.name } : undefined,
      })),
    [approvedTeams],
  );
  const adminTeamIds = useMemo(
    () => approvedTeams.filter((m) => m.role === "admin").map((m) => m.team_id),
    [approvedTeams],
  );

  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(
    supabase,
    user?.id,
    teamsForNotifications,
  );
  const pendingByTeam = usePendingMembersCountsByTeamQuery(supabase, adminTeamIds);

  return useMemo(() => {
    const byTeam: Record<string, TeamBadgeCount> = {};
    const entry = (teamId: string) => (byTeam[teamId] ??= { unanswered: 0, pendingMembers: 0 });
    for (const a of unansweredAttendances) entry(a.teamId).unanswered += 1;
    for (const [teamId, count] of Object.entries(pendingByTeam)) {
      if (count > 0) entry(teamId).pendingMembers = count;
    }
    const total = Object.values(byTeam).reduce(
      (sum, c) => sum + c.unanswered + c.pendingMembers,
      0,
    );
    return { total, byTeam, countOf: (teamId: string) => byTeam[teamId] ?? EMPTY };
  }, [unansweredAttendances, pendingByTeam]);
}
