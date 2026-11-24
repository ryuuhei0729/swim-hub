"use client";

// =============================================================================
// チームメンバー (メンバータブ・承認待ち・グループ別表示・ベストタイム表) の取得
// =============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import { TeamMembersAPI } from "@apps/shared/api/teams/members";
import type { TeamGroup, TeamGroupMembership } from "@swim-hub/shared/types";
import {
  fetchApprovedTeamMembers,
  type TeamMember,
} from "@/components/team/member-management/hooks/useMembers";
import {
  fetchMemberBestTimes,
  type BestTime,
} from "@/components/team/shared/hooks/useMemberBestTimes";
import {
  TEAM_HEAVY_VIEW_QUERY_OPTIONS,
  TEAM_VIEW_QUERY_OPTIONS,
  teamDetailKeys,
  teamMemberBestTimesKeys,
} from "./teamDetailKeys";

// -----------------------------------------------------------------------------
// 承認済みメンバー一覧
// -----------------------------------------------------------------------------

export function approvedTeamMembersQueryOptions(supabase: SupabaseClient, teamId: string) {
  return {
    queryKey: teamDetailKeys.approvedMembers(teamId),
    queryFn: () => fetchApprovedTeamMembers(supabase, teamId),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

/** メンバータブの一覧。タブを開くたびに再取得し、再取得中は前回の一覧を表示する */
export function useApprovedTeamMembersQuery(supabase: SupabaseClient, teamId: string) {
  return useQuery(approvedTeamMembersQueryOptions(supabase, teamId));
}

// -----------------------------------------------------------------------------
// 承認待ち件数 (管理者タブのバッジ)
// -----------------------------------------------------------------------------

export function usePendingMemberCountQuery(
  supabase: SupabaseClient,
  teamId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: teamDetailKeys.pendingMemberCount(teamId),
    queryFn: () => new TeamMembersAPI(supabase).countPending(teamId),
    enabled,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });
}

// -----------------------------------------------------------------------------
// グループ別表示 (グループ + 全所属)
// -----------------------------------------------------------------------------

export interface TeamGroupSortData {
  groups: TeamGroup[];
  memberships: TeamGroupMembership[];
}

export async function fetchTeamGroupSortData(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamGroupSortData> {
  const api = new TeamGroupsAPI(supabase);
  const [groups, memberships] = await Promise.all([
    api.list(teamId),
    api.listAllMemberships(teamId),
  ]);
  return { groups, memberships };
}

export function teamGroupSortDataQueryOptions(supabase: SupabaseClient, teamId: string) {
  return {
    queryKey: teamDetailKeys.groupSortData(teamId),
    queryFn: () => fetchTeamGroupSortData(supabase, teamId),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

// -----------------------------------------------------------------------------
// 全メンバーのベストタイム (重い)
// -----------------------------------------------------------------------------

/** membership id → ベストタイム一覧 */
export type TeamMemberBestTimesMap = Record<string, BestTime[]>;

/**
 * メンバー全員のベストタイムを並列で取得する。
 *
 * 以前は 1 人分の失敗を空配列 (=「記録なし」) として扱っていたが、それをキャッシュすると
 * 失敗が「記録なし」として残り続けるため、1 人でも失敗したらクエリ全体を失敗にする
 * (前回の表があればそれを表示し続ける)。
 */
async function fetchTeamMemberBestTimes(
  supabase: SupabaseClient,
  members: ReadonlyArray<Pick<TeamMember, "id" | "user_id">>,
): Promise<TeamMemberBestTimesMap> {
  const results = await Promise.all(
    members.map(async (member) => ({
      memberId: member.id,
      bestTimes: await fetchMemberBestTimes(supabase, member.user_id),
    })),
  );
  const map: TeamMemberBestTimesMap = {};
  for (const { memberId, bestTimes } of results) {
    map[memberId] = bestTimes;
  }
  return map;
}

/**
 * メンバータブのベストタイム表。メンバー一覧が取れてから取得する。
 * キーには「membership id:user_id」の並びを入れ、メンバー構成が変われば別キーになる。
 */
export function useTeamMemberBestTimesQuery(
  supabase: SupabaseClient,
  teamId: string,
  members: ReadonlyArray<Pick<TeamMember, "id" | "user_id">>,
) {
  const memberPairs = useMemo(
    () => members.map((member) => `${member.id}:${member.user_id}`).sort(),
    [members],
  );
  return useQuery({
    queryKey: teamMemberBestTimesKeys.list(teamId, memberPairs),
    queryFn: () => fetchTeamMemberBestTimes(supabase, members),
    enabled: members.length > 0,
    ...TEAM_HEAVY_VIEW_QUERY_OPTIONS,
  });
}
