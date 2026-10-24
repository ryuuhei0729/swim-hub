// =============================================================================
// チーム記録ランキングのキャッシュ無効化フック - Swim Hub共通パッケージ
// =============================================================================

"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { useCallback, useContext } from "react";
import { invalidateTeamRankings } from "./keys";

/**
 * チーム記録ランキングのキャッシュを落とす関数を返す。
 *
 * `records` の行を **React Query を経由せず**書き換える画面から使う。現在の呼び出し元は
 * 2つだけ:
 *   - `apps/web/.../competitions/[competitionId]/records/_client/RecordClient.tsx`
 *     (管理者代理入力。生の `from("records")` delete + insert)
 *   - `apps/web/components/team/TeamCompetitions.tsx`
 *     (チーム大会削除。自前で一覧を再読み込みする)
 * React Query のミューテーション内であれば `useQueryClient()` +
 * `invalidateTeamRankings()` を直接使えばよく、このフックは不要。
 *
 * ⚠️ `useQueryClient()` ではなく `QueryClientContext` を直接読む理由:
 * `useQueryClient()` は Provider が無いと throw する。上記2画面は React Query 導入前から
 * 存在し、単体テストが `QueryClientProvider` 無しで直接レンダリングしている
 * (TeamCompetitions 系・RecordClient 系で計20ファイル・75テスト)。`useQueryClient()` を
 * 足すとランキングと無関係なそれらのテストが全滅するため、キャッシュは「あれば落とす」
 * 任意の依存として扱う。
 *
 * ⚠️ 本番で Provider が外れる心配は無いが、その根拠は「useQuery が先に壊れるから」では**ない**。
 * 上記2画面には `useQuery` / `useMutation` / `useQueryClient` が1つも無いので、
 * no-op になったときの唯一の症状は「ランキングが最大5分古い」= まさにこのフックが直した
 * バグそのもので、**自力では検知できない無言の劣化**になる。
 * 実際の根拠は構造的な包含関係: 2画面はいずれも `useAuth()` を呼ぶため必然的に
 * `AuthProvider` の子孫であり、`AuthProvider` は `QueryProvider` の子孫に置かれている。
 * つまり Provider 無しでこのフックが動くのはテスト環境だけ。
 * それでも将来の配置変更で静かに壊れないよう、下で dev 限定の警告を出す。
 */
export function useInvalidateTeamRankings(): () => void {
  const queryClient = useContext(QueryClientContext);

  return useCallback(() => {
    if (!queryClient) {
      // 本番では出さない (テストの QueryClientProvider 無しレンダリングでも無害)。
      // dev で配置ミスに気付けるようにするための警告。
      // "development" に限定する理由: この警告は dev サーバーで開発者に気づかせるためのもの。
      // vitest 下では NODE_ENV が "test" で、Provider 無しのレンダリングは意図的かつ
      // docstring に記録済みなので、そこで警告すると既存テスト5ケースに偽陽性の
      // stderr ノイズが出て「警告を無視する習慣」を作る。
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "useInvalidateTeamRankings: QueryClient が無いためランキングのキャッシュを落とせません",
        );
      }
      return;
    }
    invalidateTeamRankings(queryClient);
  }, [queryClient]);
}
