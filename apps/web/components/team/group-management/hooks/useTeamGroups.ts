"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamGroup } from "@swim-hub/shared/types";
import {
  TEAM_VIEW_QUERY_OPTIONS,
  invalidateTeamGroupQueries,
  teamDetailKeys,
} from "@/hooks/queries/teamDetailKeys";

export type TeamGroupWithCount = TeamGroup & { member_count: number };

const EMPTY_GROUPS: TeamGroupWithCount[] = [];

/** グループ一覧 + 人数のクエリ (タブの先読みからも使う) */
export function teamGroupsWithCountQueryOptions(supabase: SupabaseClient, teamId: string) {
  return {
    queryKey: teamDetailKeys.groupsWithCount(teamId),
    queryFn: (): Promise<TeamGroupWithCount[]> =>
      new TeamGroupsAPI(supabase).listWithMemberCount(teamId),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

/**
 * グループ一覧取得 + カテゴリ導出
 */
export const useTeamGroups = (teamId: string, supabase: SupabaseClient) => {
  const t = useTranslations("teamsAdmin.groupManagement.errors");
  const queryClient = useQueryClient();

  // タブを開くたびに再取得するが (staleTime 0)、再取得中は前回のグループ一覧を表示する
  const query = useQuery(teamGroupsWithCountQueryOptions(supabase, teamId));
  const groups = query.data ?? EMPTY_GROUPS;
  // スケルトン / エラーは表示できる一覧が無いときだけ出す
  const loading = query.isPending;
  const fetchError = query.error;
  const error = fetchError && !query.data ? toUserFacingMessage(fetchError, t("fetchFailed")) : null;
  useEffect(() => {
    if (fetchError) console.error("Failed to fetch group information:", fetchError);
  }, [fetchError]);

  // グループの作成・更新・削除・所属変更の後に呼ぶ。グループ人数・メンバー一覧の
  // グループ別表示・グループメンバー一覧モーダルもまとめて最新化する
  const loadGroups = useCallback(async () => {
    await invalidateTeamGroupQueries(queryClient, teamId);
  }, [queryClient, teamId]);

  // カテゴリ一覧を導出
  const categories = useMemo(() => {
    const cats = [...new Set(groups.map((g) => g.category).filter(Boolean))] as string[];
    cats.sort();
    return cats;
  }, [groups]);

  // カテゴリ別グループ
  const groupsByCategory = useMemo(() => {
    const map = new Map<string | null, TeamGroupWithCount[]>();
    for (const group of groups) {
      const key = group.category ?? null;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(group);
    }
    return map;
  }, [groups]);

  return {
    groups,
    categories,
    groupsByCategory,
    loading,
    error,
    loadGroups,
  };
};
