import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import type { TeamGroup } from "@swim-hub/shared/types";
import { ALWAYS_REVALIDATE, getCachedQueryStatus } from "@/hooks/cachedQuery";
import { invalidateTeamGroups, teamDetailKeys } from "@/hooks/teamDetailQueries";

export type TeamGroupWithCount = TeamGroup & { member_count: number };

const NO_GROUPS: TeamGroupWithCount[] = [];

/**
 * グループ一覧取得 + カテゴリ導出
 *
 * 一覧は React Query のキャッシュに載せる。タブを開き直したときは前回の一覧をすぐ表示し、
 * 裏で取り直す。作成・更新・削除のあとの再読み込み (loadGroups) でも一覧を消さずに
 * 差し替えるので、操作のたびに画面全体がスピナーに戻らない。
 */
export const useTeamGroups = (teamId: string, supabase: SupabaseClient) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: teamDetailKeys.groupsWithCount(teamId),
    queryFn: async () => {
      try {
        return await new TeamGroupsAPI(supabase).listWithMemberCount(teamId);
      } catch (err) {
        console.error("グループ情報の取得に失敗:", err);
        throw err;
      }
    },
    staleTime: ALWAYS_REVALIDATE,
  });

  const groups = query.data ?? NO_GROUPS;
  const status = getCachedQueryStatus(query);

  // グループ関連のキャッシュ (メンバー絞り込み用・グループごとのメンバー一覧) もまとめて取り直す
  const loadGroups = useCallback(
    () => invalidateTeamGroups(queryClient, teamId),
    [queryClient, teamId],
  );

  const categories = useMemo(() => {
    const cats = [...new Set(groups.map((g) => g.category).filter(Boolean))] as string[];
    cats.sort();
    return cats;
  }, [groups]);

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
    // 手元に一覧が無いときだけ読み込み中・エラーにする (取り直し中や取り直しの失敗では一覧を残す)
    loading: status.isLoading,
    error: status.isFailed ? t("teams.mobile.groupFetchFailed") : null,
    loadGroups,
  };
};
