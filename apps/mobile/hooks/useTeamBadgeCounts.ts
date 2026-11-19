"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery, usePendingMembersCountsByTeamQuery } from "@apps/shared/hooks/queries/teams";
import { useUnansweredAttendancesQuery } from "@apps/shared/hooks/queries/notifications";
import { groupTeamMemberships } from "@/utils/teamMembershipGroups";

export interface TeamBadgeCount {
  /** 自分の出欠未回答 (今日以降・受付中) */
  unanswered: number;
  /** 承認待ちメンバー (自分が管理者のチームのみ) */
  pendingMembers: number;
}

const EMPTY: TeamBadgeCount = { unanswered: 0, pendingMembers: 0 };

/**
 * チーム関連のバッジ件数。下のタブバーの「チーム」バッジ (合計) と、
 * チーム画面の中のタブ・チーム切替シートのバッジ (チームごと) を同じ数え方で出す。
 *
 * 出欠未回答はホームの DashboardNoticesSection と同じ引数 (承認済みチームを一覧の順で) にして
 * queryKey を揃え、同じキャッシュを使う。
 */
export function useTeamBadgeCounts(): {
  total: number;
  byTeam: Record<string, TeamBadgeCount>;
  countOf: (teamId: string) => TeamBadgeCount;
} {
  const { supabase, user } = useAuth();
  const { teams } = useTeamsQuery(supabase, { enableRealtime: false });

  const { approvedTeams } = useMemo(() => groupTeamMemberships(teams), [teams]);
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
    const total = Object.values(byTeam).reduce((sum, c) => sum + c.unanswered + c.pendingMembers, 0);
    return { total, byTeam, countOf: (teamId: string) => byTeam[teamId] ?? EMPTY };
  }, [unansweredAttendances, pendingByTeam]);
}
