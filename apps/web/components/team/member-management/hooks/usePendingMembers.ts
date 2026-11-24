"use client";

import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMember } from "./useMembers";
import { useTranslations } from "next-intl";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "@/hooks/queries/teamDetailKeys";

/** 承認待ちメンバーを申請の新しい順で取得する */
async function fetchPendingTeamMembers(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamMember[]> {
  const { data, error: fetchError } = await supabase
    .from("team_memberships")
    .select(
      `
          id,
          user_id,
          role,
          is_active,
          status,
          joined_at,
          created_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path
          )
        `,
    )
    .eq("team_id", teamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (fetchError) throw fetchError;
  return (data ?? []) as unknown as TeamMember[];
}

/**
 * 承認待ちメンバーを管理するカスタムフック
 *
 * 取得は React Query (`teamDetailKeys.pendingMemberList`)。管理者のときだけ取得し、
 * タブを開くたびに再取得する (staleTime 0)。再取得中は前回の一覧を表示する。
 */
export const usePendingMembers = (teamId: string, isAdmin: boolean, supabase: SupabaseClient) => {
  const t = useTranslations("teams");

  const query = useQuery({
    queryKey: teamDetailKeys.pendingMemberList(teamId),
    queryFn: () => fetchPendingTeamMembers(supabase, teamId),
    enabled: isAdmin,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });

  const fetchError = query.error;
  useEffect(() => {
    if (fetchError) console.error("承認待ちメンバー情報の取得に失敗:", fetchError);
  }, [fetchError]);

  const { refetch } = query;
  const loadPendingMembers = useCallback(async () => {
    if (!isAdmin) return;
    await refetch();
  }, [isAdmin, refetch]);

  const refresh = useCallback(() => {
    void loadPendingMembers();
  }, [loadPendingMembers]);

  return {
    pendingMembers: query.data ?? [],
    // 以前と同じく「取得中」は読み込み表示にするが、前回の一覧があればそれを表示し続ける
    loading: isAdmin && !query.data && query.isFetching,
    error: fetchError && !query.data ? t("pendingMembersHook.loadError") : null,
    loadPendingMembers,
    refresh,
  };
};
