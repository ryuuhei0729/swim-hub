import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import { createQueryClient } from "@apps/shared/lib/react-query";
import { runMilestoneJudgment } from "@/utils/milestoneJudgment";
import { getStyles } from "@/lib/data-loaders/common";
import type { Style } from "@apps/shared/types";
import GoalsClient from "../_client/GoalsClient";

/**
 * 目標一覧を prefetch するクエリキー。クライアントの useGoalsQuery が使うキー
 * (goalKeys.list()) と同一でなければならない (SSR/CSR でキーがずれると
 * ハイドレートしたデータが使われず二重取得になる)。テストで一致を検証するため export している。
 */
export const GOALS_LIST_QUERY_KEY = goalKeys.list();

/**
 * 目標管理ページのデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function GoalDataLoader({ initialGoalId }: { initialGoalId?: string }) {
  const queryClient = createQueryClient();

  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  if (!user) {
    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <GoalsClient styles={[]} />
      </HydrationBoundary>
    );
  }

  // 代理入力 (チーム管理者による練習・大会記録の代理保存) は保存時点では判定しない
  // (遅延評価)。本人がこのページを開いたこのセッションで判定を1回走らせてから
  // 一覧を取得することで、代理保存分も一覧・振り返りモーダルに反映された状態で
  // 表示する。一覧取得と並列にすると判定前の一覧を返しうるため、あえて直列にする
  // (初回表示が遅くなるが、正しい状態を見せることを優先する)。
  await runMilestoneJudgment(new GoalAPI(supabase), user.id);

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証なしクライアントを使用 - 全ユーザー共通）
    getStyles().catch((error) => {
      console.error("[GoalDataLoader] Styles取得エラー:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [] as Style[];
    }),
    // 目標一覧 + 大会一覧を React Query キャッシュに prefetch (useGoalsQuery と同じキー・同じ形)。
    // 大会一覧は個人大会 + 所属チームの大会 (RecordAPI.getCompetitions() は個人大会限定のため、
    // チーム大会を対象にした目標のタイトルが解決できず「大会情報なし」に誤って落ちる)。
    // 失敗は成功として dehydrate されない (retry:false で1回だけ試し、クライアントが取り直す)
    queryClient.prefetchQuery({
      queryKey: GOALS_LIST_QUERY_KEY,
      retry: false,
      queryFn: async () => {
        try {
          const goalAPI = new GoalAPI(supabase);
          const [goals, competitions] = await Promise.all([
            goalAPI.getGoals(),
            goalAPI.getSelectableCompetitions(),
          ]);
          return { goals, competitions };
        } catch (error) {
          console.error("[GoalDataLoader] Goals prefetch エラー:", error);
          throw error;
        }
      },
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GoalsClient styles={stylesResult} initialGoalId={initialGoalId} />
    </HydrationBoundary>
  );
}
