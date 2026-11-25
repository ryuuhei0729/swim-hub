// =============================================================================
// チームデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { TeamCoreAPI } from "@apps/shared/api/teams/core";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { createQueryClient } from "@apps/shared/lib/react-query";
import TeamsClient from "../_client/TeamsClient";

/**
 * チーム一覧を prefetch するクエリキー。クライアントの useTeamsQuery が使うキー
 * (teamKeys.list()) と同一でなければならない (SSR/CSR でキーがずれると
 * ハイドレートしたデータが使われず二重取得になる)。テストで一致を検証するため export している。
 */
export const TEAMS_LIST_QUERY_KEY = teamKeys.list();

/**
 * すべてのチームページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function TeamsDataLoader() {
  const queryClient = createQueryClient();

  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  // チーム一覧を React Query キャッシュに取得（認証必要）。
  // 取得できないと「所属チームなし」と誤表示してしまうので、従来どおり失敗はエラー画面
  // (error.tsx) に任せる。そのため prefetchQuery (失敗を握りつぶす) ではなく fetchQuery を使う。
  if (user) {
    await queryClient
      .fetchQuery({
        queryKey: TEAMS_LIST_QUERY_KEY,
        retry: false,
        queryFn: () => new TeamCoreAPI(supabase).getMyTeams(),
      })
      .catch((error: unknown) => {
        console.error("チーム情報取得エラー:", error);
        throw new Error(
          `Failed to fetch teams: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TeamsClient />
    </HydrationBoundary>
  );
}
