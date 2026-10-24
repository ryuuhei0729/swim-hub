// =============================================================================
// MyPageScreen.refreshDrift.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点: [V-04] 6画面すべてで「画面と子孫が依存する全クエリ」に
// 漏れがないこと。DashboardScreen.refreshDrift.test.tsx と同一の
// 「観測ベース・非ハードコード」手法で MyPageScreen を検証する。
// MyPageScreen は子孫コンポーネント (ProfileDisplay/ProfileEditModal/BestTimesTable)
// が独自のクエリを持たないため、画面自身の refreshAll (profile + bestTimes) が
// そのまま全 active query を尽くしていることの回帰確認としても機能する
// (= このテストは現行実装に対して green であることが期待される)。

import { QueryClient } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";
import { createWrapper, harness, USER_ID } from "./myPageScreenHarness";
import { MyPageScreen } from "../MyPageScreen";

let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;


async function waitForQuiescence(queryClient: QueryClient) {
  await waitFor(
    () => {
      const stillPending = queryClient
        .getQueryCache()
        .getAll()
        .some((q) => q.getObserversCount() > 0 && q.state.fetchStatus === "fetching");
      expect(stillPending).toBe(false);
    },
    { timeout: 5000 },
  );
}

function activeQueries(queryClient: QueryClient): Query[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.getObserversCount() > 0 && q.state.dataUpdateCount > 0);
}

describe("MyPageScreen — pull-to-refresh のクエリ網羅性 (ドリフト検出)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    harness.refreshAll = null;

    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        users: { data: { id: USER_ID, name: "テストユーザー" } },
      },
    });
    harness.supabase = supabaseMock.client;
    harness.getMyTeams.mockResolvedValue([]);
    harness.getBestTimes.mockResolvedValue([]);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "[ドリフト検出] refreshAll (profile + bestTimes) 発火前から観測される全 active query が、" +
      "queryKey をハードコードせずに再取得されたことを確認する",
    async () => {
      render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });
      await waitForQuiescence(queryClient);

      const before = activeQueries(queryClient);
      expect(before.length).toBeGreaterThan(0);
      const beforeCounts = new Map(before.map((q) => [q.queryHash, q.state.dataUpdateCount]));

      expect(harness.refreshAll).not.toBeNull();
      await act(async () => {
        await harness.refreshAll!();
      });
      await waitForQuiescence(queryClient);

      for (const query of before) {
        const prevCount = beforeCounts.get(query.queryHash)!;
        expect(
          query.state.dataUpdateCount,
          `queryKey=${JSON.stringify(query.queryKey)} が refreshAll で再取得されていない ` +
            `(dataUpdateCount: ${prevCount} → ${query.state.dataUpdateCount})`,
        ).toBeGreaterThan(prevCount);
      }
    },
  );
});
