// =============================================================================
// チーム管理者向け: メンバー目標閲覧の React Query フック - Swim Hub共通パッケージ
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { TeamMemberGoalsAPI } from "../../api/teams/memberGoals";
import type { TeamMemberGoal } from "../../types/teamMemberGoals";

// 本人用 goalKeys とは別の名前空間 (本人の目標の invalidate に巻き込まれない)
export const teamMemberGoalKeys = {
  all: ["teamMemberGoals"] as const,
  list: (teamId: string, memberId: string | undefined) =>
    [...teamMemberGoalKeys.all, "list", teamId, memberId] as const,
} as const;

/** RPC の RAISE EXCEPTION の SQLSTATE。権限・対象不正などの恒久エラー */
const RPC_RAISE_EXCEPTION_CODE = "P0001";

/** React Query 既定の retry 回数 (QueryClient 側に retry 指定が無いときの値) */
const REACT_QUERY_DEFAULT_RETRIES = 3;

function isPermanentRpcError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === RPC_RAISE_EXCEPTION_CODE
  );
}

/** QueryClient の `defaultOptions.queries.retry` と同じ形 */
export type RetryOption = boolean | number | ((failureCount: number, error: Error) => boolean);

/**
 * 恒久エラー (P0001) は再試行せず、それ以外は QueryClient の既定 retry に委ねる。
 * クエリ個別の `retry` は既定を丸ごと置き換えてしまうため (mobile の「ネットワーク
 * エラーは再試行しない」が効かなくなる)、既定の形ごとに解決して合成する。
 * network 判定などはグローバル側が唯一の定義元で、ここには写さない。
 */
export function resolveMemberGoalsRetry(
  defaultRetry: RetryOption | undefined,
  failureCount: number,
  error: Error,
): boolean {
  if (isPermanentRpcError(error)) return false;
  if (typeof defaultRetry === "function") return defaultRetry(failureCount, error);
  if (typeof defaultRetry === "number") return failureCount < defaultRetry;
  if (typeof defaultRetry === "boolean") return defaultRetry;
  return failureCount < REACT_QUERY_DEFAULT_RETRIES;
}

export interface UseTeamMemberGoalsQueryOptions {
  /** false の間はフェッチしない。既定は true。memberId 未選択のときは常にフェッチしない */
  enabled?: boolean;
  /** テスト・DI 用。省略時は supabase から生成する */
  api?: TeamMemberGoalsAPI;
}

export function useTeamMemberGoalsQuery(
  supabase: SupabaseClient,
  teamId: string,
  memberId: string | undefined,
  options: UseTeamMemberGoalsQueryOptions = {},
) {
  const { enabled = true, api } = options;
  const queryClient = useQueryClient();
  const memberGoalsApi = useMemo(() => api ?? new TeamMemberGoalsAPI(supabase), [supabase, api]);

  return useQuery<TeamMemberGoal[]>({
    queryKey: teamMemberGoalKeys.list(teamId, memberId),
    queryFn: async () => {
      // enabled で弾いているので通常到達しない。到達したら握り潰さず落とす
      if (!memberId) throw new Error("memberId is required");
      return await memberGoalsApi.list(teamId, memberId);
    },
    enabled: !!memberId && enabled,
    // 認可拒否 (P0001) は何度呼んでも同じ結果なので即エラー。それ以外は QueryClient の既定に従う
    retry: (failureCount, error) =>
      resolveMemberGoalsRetry(queryClient.getDefaultOptions().queries?.retry, failureCount, error),
    // 「メンバーが最後にアプリで更新した時点の状態」を見る画面。タブを開き直したら新しく取る
    staleTime: 60 * 1000,
  });
}
