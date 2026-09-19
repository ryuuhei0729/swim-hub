// =============================================================================
// 大会ミューテーションによるランキングキャッシュの無効化
//   ([V-P2-46]〜[V-P2-50] — 第2弾 年度別ランキング)
//
// 対象: apps/shared/hooks/queries/records.ts
//
// ## なぜ第2弾で必要になったか
//
// 年度の絞り込みは **`competitions.date`** を見る (RPC の
// `c.date >= make_date(y,4,1) AND c.date <= make_date(y+1,3,31)`)。
// つまり**大会日を年度をまたいで編集すると、紐づく記録が別年度のランキングへ
// 移動する**。第1弾は通算固定だったので大会の編集がランキングの中身を
// 変えることが無く、無効化は不要だった。
//
// 🚨 無効化を忘れたときの症状は「ランキングが最大5分古い」だけで、
//    **例外もエラー表示も出ない**。第1弾で `useInvalidateTeamRankings` を
//    作ったときと同じ**自力では検知できない無言の劣化**なので、
//    テストで塞いでおく必要がある。
//
// ## 🚨 create には足さない (否定形が観点の本体)
//
// 作成直後の大会には記録が1件も紐づいていないので、どの年度のランキングも
// 変わらない。足すと「大会を作るたびに全ランキングを再取得する」無駄が出る。
//
// ## 観測方法
//
// `invalidateQueries` の呼び出しを spy するのではなく、**QueryClient に実際に
// 積んだクエリの `isInvalidated` を見る**。spy だと「呼ばれたが述語が違って
// 1件も落ちていない」状態を緑で通してしまう
// (`isTeamRankingQueryKey` の述語がランキングキーに当たっているかまで見る)。
// =============================================================================

import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { createMockSupabaseClient, createMockCompetition } from "../../../__mocks__/supabase";
import type { RecordAPI } from "../../../api/records";
import {
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
  useDeleteCompetitionMutation,
} from "../../../hooks/queries/records";
import { recordKeys, teamKeys } from "../../../hooks/queries/keys";
import { renderQueryHook } from "../../utils/test-utils";

vi.mock("../../../api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    createCompetition: vi.fn(),
    updateCompetition: vi.fn(),
    deleteCompetition: vi.fn(),
  })),
}));

const TEAM_ID = "team-kingfisher";

/**
 * ランキング系のクエリキー。**`isTeamRankingQueryKey` の4分岐すべて**を積む。
 *
 * ⚠️ `relayRankings` / `hasAnyRelayRecord` を省くと、個人種目だけ落として
 *    リレーが古いまま残る非対称なキャッシュ状態を検出できない
 *    (`keys.ts` に「`queryKey.includes` は要素の厳密比較なので
 *     `"relayRankings"` は `"rankings"` にマッチしない」と明記されている)。
 */
const RANKING_KEYS: readonly (readonly unknown[])[] = [
  teamKeys.rankings(TEAM_ID, undefined),
  teamKeys.hasAnyRecord(TEAM_ID),
  teamKeys.relayRankings(TEAM_ID, undefined),
  teamKeys.hasAnyRelayRecord(TEAM_ID),
];

/**
 * ランキングではないキー。**無効化のスコープが広がっていないこと**を見る。
 * `teamKeys.members` は `teams > detail > ...` の入れ子で prefix が共通なので、
 * 述語ではなく prefix で invalidate する実装に変わると巻き込まれて落ちる。
 */
const UNRELATED_KEYS: readonly (readonly unknown[])[] = [
  teamKeys.members(TEAM_ID),
  teamKeys.practices(TEAM_ID),
  recordKeys.competitions(),
];

function seedQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  for (const key of [...RANKING_KEYS, ...UNRELATED_KEYS]) {
    queryClient.setQueryData(key, ["seeded"]);
  }
  return queryClient;
}

/** そのキーが invalidate されたか (React Query が立てる isInvalidated を見る) */
function isInvalidated(queryClient: QueryClient, key: readonly unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

function describeKey(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

describe("[V-P2-46] 大会ミューテーションとランキングキャッシュ", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockApi: {
    createCompetition: ReturnType<typeof vi.fn>;
    updateCompetition: ReturnType<typeof vi.fn>;
    deleteCompetition: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
    mockApi = {
      createCompetition: vi.fn(),
      updateCompetition: vi.fn(),
      deleteCompetition: vi.fn(),
    };
  });

  // ---------------------------------------------------------------------------
  // [V-P2-46] update は無効化する
  // ---------------------------------------------------------------------------
  it("🚨 大会日を年度をまたいで更新するとランキングのクエリが無効化される", async () => {
    const queryClient = seedQueryClient();
    // 2026-03-31 (FY2025) → 2026-04-01 (FY2026) = **年度をまたぐ編集**
    mockApi.updateCompetition.mockResolvedValue(
      createMockCompetition({ id: "comp-1", date: "2026-04-01" }),
    );

    const { result } = renderQueryHook(
      () => useUpdateCompetitionMutation(mockSupabase, mockApi as unknown as RecordAPI),
      { queryClient },
    );

    // 前提: どのキーもまだ無効化されていない
    for (const key of RANKING_KEYS) {
      expect(isInvalidated(queryClient, key), `前提が崩れている: ${describeKey(key)}`).toBe(false);
    }

    await act(async () => {
      await result.current.mutateAsync({ id: "comp-1", updates: { date: "2026-04-01" } });
    });

    for (const key of RANKING_KEYS) {
      expect(isInvalidated(queryClient, key), `無効化されていない: ${describeKey(key)}`).toBe(true);
    }
  });

  it("🚨 リレーのランキングも同じ操作で無効化される (個人だけ落とす非対称を作らない)", async () => {
    const queryClient = seedQueryClient();
    mockApi.updateCompetition.mockResolvedValue(createMockCompetition({ id: "comp-1" }));

    const { result } = renderQueryHook(
      () => useUpdateCompetitionMutation(mockSupabase, mockApi as unknown as RecordAPI),
      { queryClient },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: "comp-1", updates: { title: "改称" } });
    });

    // `"relayRankings"` は `"rankings"` の部分文字列に見えるが、
    // `queryKey.includes` は要素の厳密比較なので別途列挙が必要な箇所
    expect(isInvalidated(queryClient, teamKeys.relayRankings(TEAM_ID, undefined))).toBe(true);
    expect(isInvalidated(queryClient, teamKeys.hasAnyRelayRecord(TEAM_ID))).toBe(true);
  });

  it("🚨 無効化のスコープが広がっていない (メンバー・練習・大会一覧は巻き込まない)", async () => {
    const queryClient = seedQueryClient();
    mockApi.updateCompetition.mockResolvedValue(createMockCompetition({ id: "comp-1" }));

    const { result } = renderQueryHook(
      () => useUpdateCompetitionMutation(mockSupabase, mockApi as unknown as RecordAPI),
      { queryClient },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: "comp-1", updates: { title: "改称" } });
    });

    // `teams > detail > <id> > members` は prefix がランキングと共通なので、
    // 述語ではなく prefix で invalidate する実装に変わるとここが落ちる
    for (const key of [teamKeys.members(TEAM_ID), teamKeys.practices(TEAM_ID)]) {
      expect(isInvalidated(queryClient, key), `巻き込まれた: ${describeKey(key)}`).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // [V-P2-47] 🚨 create は無効化しない (否定形が観点の本体)
  // ---------------------------------------------------------------------------
  it("🚨 大会の作成ではランキングを無効化しない (記録が1件も紐づいていない)", async () => {
    const queryClient = seedQueryClient();
    mockApi.createCompetition.mockResolvedValue(createMockCompetition({ id: "comp-new" }));

    const { result } = renderQueryHook(
      () => useCreateCompetitionMutation(mockSupabase, mockApi as unknown as RecordAPI),
      { queryClient },
    );

    await act(async () => {
      await result.current.mutateAsync({
        title: "新規大会",
        date: "2026-06-01",
        place: "会場",
        pool_type: 1,
        note: null,
      });
    });

    for (const key of RANKING_KEYS) {
      expect(
        isInvalidated(queryClient, key),
        `create でランキングが無効化された: ${describeKey(key)}`,
      ).toBe(false);
    }
  });

  it("create でも大会一覧そのものは更新される (何も無効化しない実装ではない)", async () => {
    // 上の否定形が「create は何もしない」実装でも緑になるので対で置く
    const queryClient = seedQueryClient();
    mockApi.createCompetition.mockResolvedValue(createMockCompetition({ id: "comp-new" }));

    const { result } = renderQueryHook(
      () => useCreateCompetitionMutation(mockSupabase, mockApi as unknown as RecordAPI),
      { queryClient },
    );

    await act(async () => {
      await result.current.mutateAsync({
        title: "新規大会",
        date: "2026-06-01",
        place: "会場",
        pool_type: 1,
        note: null,
      });
    });

    expect(isInvalidated(queryClient, recordKeys.competitions())).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // [V-P2-48] delete の既存の無効化が残っている (退行検出)
  // ---------------------------------------------------------------------------
  it("大会の削除でもランキングが無効化される (第1弾からの挙動が残っている)", async () => {
    const queryClient = seedQueryClient();
    mockApi.deleteCompetition.mockResolvedValue(undefined);

    const { result } = renderQueryHook(
      () => useDeleteCompetitionMutation(mockSupabase, mockApi as unknown as RecordAPI),
      { queryClient },
    );

    await act(async () => {
      await result.current.mutateAsync("comp-1");
    });

    for (const key of RANKING_KEYS) {
      expect(isInvalidated(queryClient, key), `無効化されていない: ${describeKey(key)}`).toBe(true);
    }
  });
});
