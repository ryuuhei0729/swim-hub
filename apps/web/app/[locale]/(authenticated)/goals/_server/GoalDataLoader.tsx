import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { GoalAPI } from "@apps/shared/api/goals";
import { runMilestoneJudgment } from "@/utils/milestoneJudgment";
import { getStyles } from "@/lib/data-loaders/common";
import type { Goal, Style, Competition } from "@apps/shared/types";
import GoalsClient from "../_client/GoalsClient";

/**
 * 目標管理ページのデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function GoalDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  if (!user) {
    return <GoalsClient initialGoals={[]} initialCompetitions={[]} styles={[]} />;
  }

  // 代理入力 (チーム管理者による練習・大会記録の代理保存) は保存時点では判定しない
  // (遅延評価)。本人がこのページを開いたこのセッションで判定を1回走らせてから
  // 一覧を取得することで、代理保存分も一覧・振り返りモーダルに反映された状態で
  // 表示する。一覧取得と並列にすると判定前の一覧を返しうるため、あえて直列にする
  // (初回表示が遅くなるが、正しい状態を見せることを優先する)。
  await runMilestoneJudgment(new GoalAPI(supabase), user.id);

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, goalsResult, competitionsResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証なしクライアントを使用 - 全ユーザー共通）
    getStyles().catch((error) => {
      console.error("[GoalDataLoader] Styles取得エラー:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [] as Style[];
    }),
    // 大会目標取得（認証必要）
    (async () => {
      try {
        const goalAPI = new GoalAPI(supabase);
        return await goalAPI.getGoals();
      } catch (error) {
        console.error("大会目標取得エラー:", error);
        return [] as Goal[];
      }
    })(),
    // 大会一覧取得（competition情報表示用）。個人大会 + 所属チームの大会
    // (RecordAPI.getCompetitions() は個人大会限定のため、チーム大会を対象にした
    // 目標のタイトルが解決できず「大会情報なし」に誤って落ちる)
    (async () => {
      try {
        const goalAPI = new GoalAPI(supabase);
        return await goalAPI.getSelectableCompetitions();
      } catch (error) {
        console.error("大会一覧取得エラー:", error);
        return [] as Competition[];
      }
    })(),
  ]);

  return (
    <GoalsClient
      initialGoals={goalsResult}
      initialCompetitions={competitionsResult}
      styles={stylesResult}
    />
  );
}
