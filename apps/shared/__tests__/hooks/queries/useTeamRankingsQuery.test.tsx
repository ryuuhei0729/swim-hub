// =============================================================================
// useTeamRankingsQuery / useTeamHasAnyRecordQuery (QA Sprint Contract Phase B)
// =============================================================================
//
// 対象: apps/shared/hooks/queries/teams.ts + keys.ts (teamKeys.rankings / hasAnyRecord)
//
// Sprint Contract 検証観点:
//   [V-34] queryKey に filters が含まれ、絞り込みを変えると別のキャッシュになる
//          (キーに filters が入っていないと、条件を変えても前の結果が出続ける)
//   [V-35] filters が undefined (styles マスター待ち) の間はフェッチしない
//   [V-36] enabled=false の間はフェッチしない
//   [V-37] hasAnyRecord の queryKey は filters に依存しない (条件を変えても再取得しない)
//   [V-38] API のエラーはフックを通してもそのまま error に載る (空配列に化けない)

import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { createMockSupabaseClient } from "../../../__mocks__/supabase";
import {
  invalidateTeamRankings,
  isTeamRankingQueryKey,
  practiceKeys,
  recordKeys,
  teamKeys,
} from "../../../hooks/queries/keys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { useInvalidateTeamRankings } from "../../../hooks/queries/useInvalidateTeamRankings";
import {
  useTeamHasAnyRecordQuery,
  useTeamRankingsQuery,
} from "../../../hooks/queries/teams";
import type { TeamRankingFilters, TeamRankingRecord } from "../../../types";
import { renderQueryHook } from "../../utils/test-utils";

const TEAM_ID = "team-kingfisher";

function filters(overrides: Partial<TeamRankingFilters> = {}): TeamRankingFilters {
  return {
    styleId: 3,
    poolType: 1,
    gender: "male",
    scope: "teamCompetitions",
    aggregation: "personalBest",
    period: { kind: "allTime" },
    ...overrides,
  };
}

function record(overrides: Partial<TeamRankingRecord> = {}): TeamRankingRecord {
  return {
    recordId: "rec-kingfisher-7",
    userId: "usr-kingfisher-7",
    displayName: "セブン",
    time: 27.31,
    styleId: 3,
    style: "Fr",
    distance: 100,
    poolType: 1,
    gender: 0,
    competitionId: "cmp-kingfisher-7",
    competitionTitle: "第7回記録会",
    competitionDate: "2026-05-03",
    recordCreatedAt: "2026-05-04T09:15:00+09:00",
    ...overrides,
  };
}

/** TeamRankingsAPI 互換のフェイク (options.api の DI 経路を使う) */
function makeFakeApi(rows: TeamRankingRecord[] = [], hasAny = true) {
  return {
    getRankings: vi.fn().mockResolvedValue(rows),
    hasAnyRecord: vi.fn().mockResolvedValue(hasAny),
  };
}

type FakeApi = ReturnType<typeof makeFakeApi>;
const asApi = (api: FakeApi) => api as unknown as never;

describe("teamKeys.rankings / teamKeys.hasAnyRecord", () => {
  it("[V-34] filters が違えば queryKey も違う", () => {
    const keyLongCourse = teamKeys.rankings(TEAM_ID, filters({ poolType: 1 }));
    const keyShortCourse = teamKeys.rankings(TEAM_ID, filters({ poolType: 0 }));

    expect(keyLongCourse).not.toEqual(keyShortCourse);
  });

  it("[V-34] filters が同値なら queryKey も同値 (無駄な再取得を起こさない)", () => {
    expect(teamKeys.rankings(TEAM_ID, filters())).toEqual(teamKeys.rankings(TEAM_ID, filters()));
  });

  it("[V-34] チームが違えば queryKey も違う (チーム間でキャッシュを共有しない)", () => {
    expect(teamKeys.rankings("team-alpha", filters())).not.toEqual(
      teamKeys.rankings("team-bravo", filters()),
    );
  });

  it.each([
    ["styleId", { styleId: 22 }],
    ["gender", { gender: "female" as const }],
    ["scope", { scope: "allCompetitions" as const }],
    ["aggregation", { aggregation: "allRaces" as const }],
    ["period", { period: { kind: "fiscalYear" as const, year: 2024 } }],
  ])("[V-34] %s を変えると queryKey が変わる", (_label, patch) => {
    expect(teamKeys.rankings(TEAM_ID, filters(patch))).not.toEqual(
      teamKeys.rankings(TEAM_ID, filters()),
    );
  });

  it("[V-37] hasAnyRecord のキーは filters に依存しない", () => {
    // 絞り込みを変えても「チームに記録があるか」は変わらないので、キーも変わらない
    expect(teamKeys.hasAnyRecord(TEAM_ID)).toEqual(teamKeys.hasAnyRecord(TEAM_ID));
    expect(teamKeys.hasAnyRecord(TEAM_ID)).not.toEqual(teamKeys.rankings(TEAM_ID, filters()));
  });
});

describe("useTeamRankingsQuery", () => {
  let supabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabaseClient();
  });

  it("filters を渡すと API から行を取得して data に載せる", async () => {
    const rows = [record({ recordId: "rec-alpha" }), record({ recordId: "rec-bravo" })];
    const api = makeFakeApi(rows);

    const { result } = renderQueryHook(() =>
      useTeamRankingsQuery(supabase, TEAM_ID, filters(), { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    expect(api.getRankings).toHaveBeenCalledWith(TEAM_ID, filters());
  });

  it("[V-34] queryKey が teamKeys.rankings(teamId, filters) と一致する", async () => {
    const api = makeFakeApi([record()]);

    const { result, queryClient } = renderQueryHook(() =>
      useTeamRankingsQuery(supabase, TEAM_ID, filters(), { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(teamKeys.rankings(TEAM_ID, filters()))).toEqual([record()]);
  });

  it("[V-35] filters が undefined の間はフェッチしない", async () => {
    const api = makeFakeApi();

    const { result } = renderQueryHook(() =>
      useTeamRankingsQuery(supabase, TEAM_ID, undefined, { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(api.getRankings).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
  });

  it("[V-36] enabled=false の間はフェッチしない", async () => {
    const api = makeFakeApi();

    const { result } = renderQueryHook(() =>
      useTeamRankingsQuery(supabase, TEAM_ID, filters(), { enabled: false, api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(api.getRankings).not.toHaveBeenCalled();
  });

  it("[V-34] 絞り込みを変えると別キーで再取得され、前の条件の結果が残らない", async () => {
    const api = {
      getRankings: vi.fn(async (_teamId: string, f: TeamRankingFilters) =>
        f.poolType === 1
          ? [record({ recordId: "rec-long-course" })]
          : [record({ recordId: "rec-short-course", poolType: 0 })],
      ),
      hasAnyRecord: vi.fn().mockResolvedValue(true),
    };

    const { result, rerender } = renderQueryHook(
      ({ poolType }: { poolType: 0 | 1 }) =>
        useTeamRankingsQuery(supabase, TEAM_ID, filters({ poolType }), { api: asApi(api) }),
      { initialProps: { poolType: 1 as 0 | 1 } },
    );

    await waitFor(() => expect(result.current.data?.[0]?.recordId).toBe("rec-long-course"));

    rerender({ poolType: 0 });

    await waitFor(() => expect(result.current.data?.[0]?.recordId).toBe("rec-short-course"));
    expect(api.getRankings).toHaveBeenCalledTimes(2);
  });

  it("[V-38] API のエラーは error に載り、data は空配列に化けない", async () => {
    const rpcError = { code: "P0001", message: "boom" };
    const api = {
      getRankings: vi.fn().mockRejectedValue(rpcError),
      hasAnyRecord: vi.fn(),
    };

    const { result } = renderQueryHook(() =>
      useTeamRankingsQuery(supabase, TEAM_ID, filters(), { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(rpcError);
    expect(result.current.data).toBeUndefined();
  });

  it("0 件の結果は成功として空配列を返す (エラー扱いにしない)", async () => {
    const api = makeFakeApi([]);

    const { result } = renderQueryHook(() =>
      useTeamRankingsQuery(supabase, TEAM_ID, filters(), { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useTeamHasAnyRecordQuery", () => {
  let supabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabaseClient();
  });

  it("[V-37] enabled=true のとき hasAnyRecord を1回呼ぶ", async () => {
    const api = makeFakeApi([], false);

    const { result } = renderQueryHook(() =>
      useTeamHasAnyRecordQuery(supabase, TEAM_ID, { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
    expect(api.hasAnyRecord).toHaveBeenCalledTimes(1);
    expect(api.hasAnyRecord).toHaveBeenCalledWith(TEAM_ID);
  });

  it("[V-36] enabled=false の間はフェッチしない (通常表示で余分なクエリを投げない)", async () => {
    const api = makeFakeApi();

    const { result } = renderQueryHook(() =>
      useTeamHasAnyRecordQuery(supabase, TEAM_ID, { enabled: false, api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(api.hasAnyRecord).not.toHaveBeenCalled();
  });

  it("[V-37] queryKey が teamKeys.hasAnyRecord(teamId) と一致する", async () => {
    const api = makeFakeApi([], true);

    const { result, queryClient } = renderQueryHook(() =>
      useTeamHasAnyRecordQuery(supabase, TEAM_ID, { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(teamKeys.hasAnyRecord(TEAM_ID))).toBe(true);
  });

  it("[V-38] エラーは error に載る (false に化けない)", async () => {
    const queryError = { code: "42501", message: "boom" };
    const api = {
      getRankings: vi.fn(),
      hasAnyRecord: vi.fn().mockRejectedValue(queryError),
    };

    const { result } = renderQueryHook(() =>
      useTeamHasAnyRecordQuery(supabase, TEAM_ID, { api: asApi(api) }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [V-39] ランキングキャッシュの無効化
//
// ランキングは staleTime 5分。記録を保存/削除した経路 (代理一括入力・大会削除など)
// がこれを呼ばないと、最大5分間「存在しない記録を含む / 新しい記録を欠く」順位表が
// 出続ける。判断軸は「`records` の行が変わるか」であってミューテーションの名前ではない。
//
// 落としすぎ (無関係なチームのキャッシュまで無効化) は無駄な再取得、
// 落とし足りない (ランキングが残る) は誤った順位表なので、**両方向**を押さえる。
// ---------------------------------------------------------------------------
describe("[V-39] isTeamRankingQueryKey", () => {
  it("rankings のキーに一致する (filters の内容に依らない)", () => {
    expect(isTeamRankingQueryKey(teamKeys.rankings(TEAM_ID, filters()))).toBe(true);
    expect(isTeamRankingQueryKey(teamKeys.rankings(TEAM_ID, filters({ poolType: 0 })))).toBe(true);
    expect(isTeamRankingQueryKey(teamKeys.rankings(TEAM_ID, undefined))).toBe(true);
    expect(isTeamRankingQueryKey(teamKeys.rankings("team-other", filters()))).toBe(true);
  });

  it("hasAnyRecord のキーに一致する (空状態文言の判定も一緒に落とす)", () => {
    expect(isTeamRankingQueryKey(teamKeys.hasAnyRecord(TEAM_ID))).toBe(true);
  });

  it("ランキング以外のチームキーには一致しない (落としすぎない)", () => {
    const unrelated = [
      teamKeys.all,
      teamKeys.detail(TEAM_ID),
      teamKeys.practices(TEAM_ID),
      teamKeys.competitions(TEAM_ID),
      teamKeys.announcements(TEAM_ID),
      teamKeys.attendanceByPractice("practice-1"),
      teamKeys.attendanceByCompetition("competition-1"),
    ];
    for (const key of unrelated) {
      expect(isTeamRankingQueryKey(key), `${JSON.stringify(key)} に誤って一致した`).toBe(false);
    }
  });

  it("teams 以外の名前空間には一致しない", () => {
    expect(isTeamRankingQueryKey(recordKeys.all)).toBe(false);
    expect(isTeamRankingQueryKey(practiceKeys.all)).toBe(false);
    expect(isTeamRankingQueryKey(["rankings"])).toBe(false);
    expect(isTeamRankingQueryKey(["hasAnyRecord"])).toBe(false);
    expect(isTeamRankingQueryKey([])).toBe(false);
  });
});

describe("[V-39] invalidateTeamRankings", () => {
  function seed() {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } } });
    client.setQueryData(teamKeys.rankings(TEAM_ID, filters()), [record()]);
    client.setQueryData(teamKeys.rankings(TEAM_ID, filters({ poolType: 0 })), []);
    client.setQueryData(teamKeys.hasAnyRecord(TEAM_ID), true);
    client.setQueryData(teamKeys.practices(TEAM_ID), [{ id: "practice-1" }]);
    client.setQueryData(teamKeys.competitions(TEAM_ID), [{ id: "competition-1" }]);
    return client;
  }
  const isStale = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryCache().find({ queryKey: key })?.isStale() ?? null;

  it("ランキングと hasAnyRecord のキャッシュを stale にする", () => {
    const client = seed();
    // 前提: 投入直後は fresh (staleTime 5分)
    expect(isStale(client, teamKeys.rankings(TEAM_ID, filters()))).toBe(false);

    invalidateTeamRankings(client);

    expect(isStale(client, teamKeys.rankings(TEAM_ID, filters()))).toBe(true);
    expect(isStale(client, teamKeys.rankings(TEAM_ID, filters({ poolType: 0 })))).toBe(true);
    expect(isStale(client, teamKeys.hasAnyRecord(TEAM_ID))).toBe(true);
  });

  it("練習・大会のキャッシュは落とさない (無駄な再取得を増やさない)", () => {
    const client = seed();

    invalidateTeamRankings(client);

    expect(isStale(client, teamKeys.practices(TEAM_ID))).toBe(false);
    expect(isStale(client, teamKeys.competitions(TEAM_ID))).toBe(false);
  });

  it("データ自体は消さない (再取得までは前の順位表を出せる)", () => {
    const client = seed();

    invalidateTeamRankings(client);

    expect(client.getQueryData(teamKeys.rankings(TEAM_ID, filters()))).toEqual([record()]);
  });
});

// ---------------------------------------------------------------------------
// [V-40] useInvalidateTeamRankings
//
// `records` の行を React Query を経由せず書き換える画面 (管理者代理入力の生の
// from("records") delete+insert、自前で再読み込みするチーム大会削除) から
// ランキングのキャッシュを落とすためのフック。
//
// ⚠️ Provider が無いと **no-op** になる設計なので、両方向を pin する:
//   - Provider あり → 確実に無効化する (これが本番経路。落ちないと 5 分間古い順位表)
//   - Provider なし → throw しない (Provider 無しでレンダリングする既存テスト
//     20ファイルを壊さないための意図的な逃げ道)
// no-op 側だけが動いていて本番でも落ちていない、という故障を防ぐため
// 「Provider ありなら必ず落ちる」を厳密に押さえるのが要点。
// ---------------------------------------------------------------------------
describe("[V-40] useInvalidateTeamRankings", () => {
  const seededClient = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
    });
    client.setQueryData(teamKeys.rankings(TEAM_ID, filters()), [record()]);
    client.setQueryData(teamKeys.hasAnyRecord(TEAM_ID), true);
    client.setQueryData(teamKeys.practices(TEAM_ID), [{ id: "practice-1" }]);
    return client;
  };
  const isStale = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryCache().find({ queryKey: key })?.isStale() ?? null;

  it("Provider があるとランキングのキャッシュを落とす (本番経路)", () => {
    const client = seededClient();
    const { result } = renderHook(() => useInvalidateTeamRankings(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(isStale(client, teamKeys.rankings(TEAM_ID, filters()))).toBe(false);

    result.current();

    expect(isStale(client, teamKeys.rankings(TEAM_ID, filters()))).toBe(true);
    expect(isStale(client, teamKeys.hasAnyRecord(TEAM_ID))).toBe(true);
    // 無関係なキャッシュは落とさない
    expect(isStale(client, teamKeys.practices(TEAM_ID))).toBe(false);
  });

  it("Provider が無くても throw しない (既存テストを壊さないための no-op)", () => {
    const { result } = renderHook(() => useInvalidateTeamRankings());

    expect(() => result.current()).not.toThrow();
  });

  it("返る関数の identity が再レンダーで変わらない (useEffect の deps に置ける)", () => {
    const client = seededClient();
    const { result, rerender } = renderHook(() => useInvalidateTeamRankings(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("複数回呼んでも安全 (保存を連続しても壊れない)", () => {
    const client = seededClient();
    const { result } = renderHook(() => useInvalidateTeamRankings(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(() => {
      result.current();
      result.current();
      result.current();
    }).not.toThrow();
    expect(isStale(client, teamKeys.rankings(TEAM_ID, filters()))).toBe(true);
  });
});
