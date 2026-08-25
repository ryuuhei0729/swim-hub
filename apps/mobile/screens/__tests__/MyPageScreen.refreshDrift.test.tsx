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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

const captured = vi.hoisted(() => ({
  refreshAll: null as null | (() => Promise<unknown>),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    captured.refreshAll = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

// ProfileEditModal はバレル export (@/components/profile) 経由で
// expo-image-picker に依存する AvatarUpload を eager import する。
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

const apiMocks = vi.hoisted(() => ({
  getMyTeams: vi.fn(),
  getBestTimes: vi.fn(),
}));

vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = apiMocks.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = apiMocks.getBestTimes;
  },
}));

const USER_ID = "user-1";
let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: supabaseMock.client, user: { id: USER_ID } }),
}));

import { MyPageScreen } from "../MyPageScreen";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

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
    vi.clearAllMocks();
    captured.refreshAll = null;

    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        users: { data: { id: USER_ID, name: "テストユーザー" } },
      },
    });
    apiMocks.getMyTeams.mockResolvedValue([]);
    apiMocks.getBestTimes.mockResolvedValue([]);

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

      expect(captured.refreshAll).not.toBeNull();
      await act(async () => {
        await captured.refreshAll!();
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
