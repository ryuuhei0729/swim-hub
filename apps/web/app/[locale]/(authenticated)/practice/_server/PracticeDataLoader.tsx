// =============================================================================
// 練習記録データローダー（すべてのデータを並行取得）
// =============================================================================

import React from "react";
import { format } from "date-fns";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { PracticeAPI } from "@apps/shared/api/practices";
import { getStyles, getUserTags } from "@/lib/data-loaders/common";
import { createQueryClient } from "@apps/shared/lib/react-query";
import { practiceKeys } from "@apps/shared/hooks/queries/keys";
import PracticeClient from "../_client/PracticeClient";
import type { Style, PracticeTag } from "@apps/shared/types";

/**
 * この練習一覧ページにおける日付範囲(直近1年)の計算。ここで得た startDate/endDate を
 * 下記の prefetchQuery の queryKey と <PracticeClient> の startDate/endDate props の
 * 両方にそのまま渡すことで、SSR/CSR で同一の queryKey を使わせる。
 *
 * 背景: 本関数は date-fns の `format(new Date(), ...)` でサーバー実行環境のローカル TZ を
 * 使う一方、shared 側の usePracticesQuery の内部デフォルト計算は `toISOString()`(UTC)を
 * 使っている。サーバーTZ ≠ UTC の環境ではこの2つの既定値がズレて別の queryKey になり、
 * HydrationBoundary のキャッシュがヒットせず二重フェッチが起きる。この練習ページでは
 * props 経由で同一のリテラル値を明示的に渡すことでそのズレを回避している(shared フック側の
 * UTC 既定計算自体は変更していないため、startDate/endDate を渡さない他の呼び出し箇所には
 * この対策は及ばない)。
 *
 * QA テスト用に named export にしている(prefetch key と props の一致検証に使う想定)。
 */
export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const endDate = format(new Date(), "yyyy-MM-dd");
  const startDate = format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  return { startDate, endDate };
}

/**
 * すべての練習記録ページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function PracticeDataLoader() {
  const queryClient = createQueryClient();

  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  const { startDate, endDate } = getDefaultDateRange();

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, tagsResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証なしクライアントを使用 - 全ユーザー共通）
    getStyles().catch((error) => {
      console.error("[PracticeDataLoader] Styles取得エラー:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [] as Style[];
    }),
    // Tags取得（ユーザー固有、認証必要）
    user
      ? getUserTags(supabase, user.id).catch((error) => {
          console.error("Tags取得エラー:", error);
          return [] as PracticeTag[];
        })
      : Promise.resolve([] as PracticeTag[]),
    // 練習記録をReact Queryキャッシュにprefetch。
    // startDate/endDate は getDefaultDateRange() 参照(CSR の queryKey と一致させる)。
    // pageSize=1000: 一覧はクライアント側で絞り込み/並べ替えするため全件取得する
    // (既定の20だと mutation 後の再取得で一覧が20件に縮んでしまう)
    user
      ? queryClient.prefetchQuery({
          queryKey: practiceKeys.list({ startDate, endDate, page: 1, pageSize: 1000 }),
          retry: false,
          queryFn: async () => {
            try {
              const practiceAPI = new PracticeAPI(supabase);
              return await practiceAPI.getPractices(startDate, endDate, 1000, 0);
            } catch (error) {
              console.error("[PracticeDataLoader] Practices prefetch エラー:", error);
              throw error;
            }
          },
        })
      : Promise.resolve(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PracticeClient
        styles={stylesResult}
        tags={tagsResult}
        startDate={startDate}
        endDate={endDate}
      />
    </HydrationBoundary>
  );
}
