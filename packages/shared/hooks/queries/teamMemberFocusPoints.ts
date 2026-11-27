// =============================================================================
// チーム管理者向け: メンバーのフォーカスポイント閲覧の React Query フック
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { TeamMemberFocusPointsAPI } from "../../api/teams/memberFocusPoints";
import type { TeamMemberFocusPoint } from "../../types/focusPoint";
import { resolveMemberGoalsRetry } from "./teamMemberGoals";

// 本人用 focusPointKeys とは別の名前空間 (本人のフォーカスポイントの invalidate に巻き込まれない)
export const teamMemberFocusPointKeys = {
  all: ["teamMemberFocusPoints"] as const,
  list: (teamId: string, memberId: string | undefined) =>
    [...teamMemberFocusPointKeys.all, "list", teamId, memberId] as const,
} as const;

export interface UseTeamMemberFocusPointsQueryOptions {
  /** テスト・DI 用。省略時は supabase から生成する */
  api?: TeamMemberFocusPointsAPI;
}

/**
 * 選んだメンバーのフォーカスポイント (読み取り専用)。memberId 未選択のときはフェッチしない。
 * 再試行の扱いはメンバー目標と同じ (権限・対象不正の P0001 は再試行しない)
 */
export function useTeamMemberFocusPointsQuery(
  supabase: SupabaseClient,
  teamId: string,
  memberId: string | undefined,
  options: UseTeamMemberFocusPointsQueryOptions = {},
) {
  const { api } = options;
  const queryClient = useQueryClient();
  const memberApi = useMemo(() => api ?? new TeamMemberFocusPointsAPI(supabase), [supabase, api]);

  return useQuery<TeamMemberFocusPoint[]>({
    queryKey: teamMemberFocusPointKeys.list(teamId, memberId),
    queryFn: async () => {
      // enabled で弾いているので通常到達しない。到達したら握り潰さず落とす
      if (!memberId) throw new Error("memberId is required");
      return await memberApi.list(teamId, memberId);
    },
    enabled: !!memberId,
    retry: (failureCount, error) =>
      resolveMemberGoalsRetry(queryClient.getDefaultOptions().queries?.retry, failureCount, error),
    // メンバー目標と同じく、タブを開き直したら新しく取る
    staleTime: 60 * 1000,
  });
}
