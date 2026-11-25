// =============================================================================
// ダッシュボードデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from "react";
import { format } from "date-fns";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { DashboardAPI } from "@apps/shared/api/dashboard";
import { createQueryClient } from "@apps/shared/lib/react-query";
import { getStyles, getUserTags, getUserTeams } from "@/lib/data-loaders/common";
import { toZonedTime } from "date-fns-tz";
import { calendarKeys, fetchCalendarMonth } from "@/hooks/queries/calendarKeys";
import DashboardClient from "../_client/DashboardClient";
import type { Style, PracticeTag, TeamMembership, Team } from "@apps/shared/types";

interface TeamMembershipWithTeam extends TeamMembership {
  team?: Team;
}

/**
 * カレンダーの最初の表示月 ("yyyy-MM") を日本時間で計算する。
 * ここで得た月を prefetch の queryKey と <DashboardClient initialCalendarMonth> の両方に
 * そのまま渡すことで、SSR/CSR で同一の queryKey を使わせる (クライアントで new Date() から
 * 計算し直すと、月末のタイムゾーン差で別の月=別のキーになり、ハイドレートしたデータが使われない)。
 *
 * テスト用に named export にしている (prefetch key と props の一致検証に使う)。
 */
export function getInitialCalendarMonth(currentDate: Date = new Date()): string {
  const TIMEZONE = "Asia/Tokyo";
  return format(toZonedTime(currentDate, TIMEZONE), "yyyy-MM");
}

/**
 * すべてのダッシュボードデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function DashboardDataLoader({
  currentDate = new Date(),
}: {
  currentDate?: Date;
}) {
  const queryClient = createQueryClient();

  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  const initialCalendarMonth = getInitialCalendarMonth(currentDate);

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, tagsResult, teamsResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証なしクライアントを使用 - 全ユーザー共通）
    getStyles().catch((error) => {
      console.error("[DashboardDataLoader] Styles取得エラー:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // エラー時は空配列を返す（アプリケーションを継続させるため）
      return [] as Style[];
    }),
    // Tags取得（ユーザー固有、認証必要）
    user
      ? getUserTags(supabase, user.id).catch((error) => {
          console.error("Tags取得エラー:", error);
          return [] as PracticeTag[];
        })
      : Promise.resolve([] as PracticeTag[]),
    // チーム情報取得（認証必要）
    user
      ? getUserTeams(supabase, user.id)
          .catch((error) => {
            console.error("チーム情報取得エラー:", error);
            return [] as TeamMembershipWithTeam[];
          })
          .then((teams) => teams as TeamMembershipWithTeam[])
      : Promise.resolve([] as TeamMembershipWithTeam[]),
    // カレンダー (表示月のエントリー + 月間サマリー) を React Query キャッシュに prefetch。
    // キーは getInitialCalendarMonth() の月 (CSR の queryKey と一致させる)。
    // 失敗は成功として dehydrate されない (retry:false で1回だけ試し、クライアントが取り直す)
    user
      ? queryClient.prefetchQuery({
          queryKey: calendarKeys.month(initialCalendarMonth),
          retry: false,
          queryFn: async () => {
            try {
              return await fetchCalendarMonth(new DashboardAPI(supabase), initialCalendarMonth);
            } catch (error) {
              console.error("[DashboardDataLoader] Calendar prefetch エラー:", error);
              throw error;
            }
          },
        })
      : Promise.resolve(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient
        initialCalendarMonth={initialCalendarMonth}
        // 描画ごとの ID。ページ遷移のキャッシュでこの描画が使い回されたときに、
        // カレンダーを取り直すかの判定に使う (CalendarProvider の serverRenderId を参照)
        serverRenderId={crypto.randomUUID()}
        teams={teamsResult}
        styles={stylesResult}
        tags={tagsResult}
      />
    </HydrationBoundary>
  );
}
