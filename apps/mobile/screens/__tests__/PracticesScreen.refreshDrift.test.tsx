// =============================================================================
// PracticesScreen.refreshDrift.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点: [V-04] 6画面すべてで「画面と子孫が依存する全 active query」に
// 漏れがないこと。PracticesScreen は `keys.ts` に定義されていない孤立キー
// (`["practice-tags"]`) と disabled な `useDayEntriesQuery`(日付詳細モーダル用)を
// 自前で持つため、DashboardScreen.refreshDrift.test.tsx と同一の「観測ベース・
// 非ハードコード」手法(queryKey を一切ハードコードせず、マウント後に実測した
// active query 集合の dataUpdateCount 増加を assert する)で検証する。
//
// PM 確定事実: PracticesScreen は子孫コンポーネントが独自クエリを持たず、
// refreshAll (`Promise.allSettled([refetch(), refetchTags(), refetchDayEntries()])`)
// が画面自身の全クエリを直接列挙し尽くしているため、このテストは現行実装に対して
// green であることが期待される (回帰確認)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// react-navigation の useFocusEffect グローバルモックはマウントごとに1回同期実行する
// 実装になっており (DashboardScreen.refreshDrift.test.tsx と同じ懸念)、このファイルでも
// マウント時に一度だけ発火する安全な実装に上書きする。
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// @shopify/flash-list はソースが素の .ts (型キャスト構文込み) のまま配布されており、
// このリポジトリの vitest 環境では変換に失敗する
// (TeamsScreen.refreshDrift.test.tsx と同一の既知の壁)。
vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    refreshControl,
    ...props
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
    ListEmptyComponent?: React.ReactNode;
    refreshControl?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      refreshControl ?? null,
      data && data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              "div",
              { key: keyExtractor ? keyExtractor(item, index) : index },
              renderItem ? renderItem({ item, index }) : null,
            ),
          )
        : (ListEmptyComponent ?? null),
    ),
}));

// DayDetailModal はバレル export (@/components/calendar) 経由で ImageViewerModal 等を
// eager import する。DashboardScreen.refreshDrift.test.tsx と同一パターンで補う。
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn((_dim: string) => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  };
});
vi.mock("@/hooks/useDayDetailHandlers", () => ({
  useDayDetailHandlers: () => ({
    isDeleting: false,
    setIsDeleting: vi.fn(),
    handleEntryPress: vi.fn(),
    handleAddPractice: vi.fn(),
    handleAddRecord: vi.fn(),
    handleEditPractice: vi.fn(),
    handleDeletePractice: vi.fn(),
    handleAddPracticeLog: vi.fn(),
    handleEditPracticeLog: vi.fn(),
    handleDeletePracticeLog: vi.fn(),
    handleEditRecord: vi.fn(),
    handleDeleteRecord: vi.fn(),
    handleEditEntry: vi.fn(),
    handleDeleteEntry: vi.fn(),
    handleAddEntry: vi.fn(),
    handleEditCompetition: vi.fn(),
    handleDeleteCompetition: vi.fn(),
  }),
}));
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: () => null,
}));
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: () => null,
}));
vi.mock("@/components/share", () => ({
  ShareCardModal: () => null,
}));
vi.mock("@/components/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/calendar")>();
  return {
    ...actual,
    CalendarView: () => null,
  };
});

const captured = vi.hoisted(() => ({
  refreshAll: null as null | (() => Promise<unknown>),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    captured.refreshAll = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

const apiMocks = vi.hoisted(() => ({
  getPracticeTags: vi.fn(),
  getPractices: vi.fn(),
  getCalendarEntries: vi.fn(),
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    getPracticeTags = apiMocks.getPracticeTags;
    getPractices = apiMocks.getPractices;
  },
}));

vi.mock("@apps/shared/api/dashboard", () => ({
  DashboardAPI: class {
    getCalendarEntries = apiMocks.getCalendarEntries;
  },
}));

const USER_ID = "user-1";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: USER_ID } }),
}));

import { PracticesScreen } from "../PracticesScreen";

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

/** observer を持ち、かつ既に一度でも成功フェッチ済みの query のみを対象にする
 * (enabled:false のまま observer だけ持つクエリ (未選択の dayEntries) を誤検出しないため。
 *  詳細は DashboardScreen.refreshDrift.test.tsx のコメント参照) */
function activeQueries(queryClient: QueryClient): Query[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.getObserversCount() > 0 && q.state.dataUpdateCount > 0);
}

describe("PracticesScreen — pull-to-refresh のクエリ網羅性 (ドリフト検出)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    captured.refreshAll = null;

    apiMocks.getPracticeTags.mockResolvedValue([]);
    apiMocks.getPractices.mockResolvedValue([]);
    apiMocks.getCalendarEntries.mockResolvedValue([]);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "[ドリフト検出] refreshAll 発火前から observer を持つ全 active query が、" +
      "queryKey をハードコードせずに再取得されたことを確認する " +
      "(練習一覧 + keys.ts 外の孤立キー ['practice-tags'])",
    async () => {
      render(<PracticesScreen />, { wrapper: createWrapper(queryClient) });
      await waitForQuiescence(queryClient);
      await waitFor(() => {
        expect(apiMocks.getPractices).toHaveBeenCalled();
        expect(apiMocks.getPracticeTags).toHaveBeenCalled();
      });
      await waitForQuiescence(queryClient);

      const before = activeQueries(queryClient);
      expect(before.length).toBeGreaterThan(0);
      const beforeCounts = new Map(before.map((q) => [q.queryHash, q.state.dataUpdateCount]));

      expect(captured.refreshAll).not.toBeNull();
      await act(async () => {
        await captured.refreshAll!();
      });
      await waitForQuiescence(queryClient);

      const failures: string[] = [];
      for (const query of before) {
        const prevCount = beforeCounts.get(query.queryHash)!;
        if (query.state.dataUpdateCount <= prevCount) {
          failures.push(
            `queryKey=${JSON.stringify(query.queryKey)} (queryHash=${query.queryHash}) が ` +
              `refreshAll で再取得されていない (dataUpdateCount: ${prevCount} → ${query.state.dataUpdateCount})`,
          );
        }
      }

      expect(
        failures,
        `PracticesScreen の refreshAll から漏れている active query:\n${failures.join("\n")}`,
      ).toEqual([]);
    },
  );

  it("[観測前提] practice-tags クエリ (keys.ts 外の孤立キー) が実際に active として観測される", async () => {
    render(<PracticesScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);
    await waitFor(() => expect(apiMocks.getPracticeTags).toHaveBeenCalled());

    const hasTagsQuery = activeQueries(queryClient).some(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(["practice-tags"]),
    );
    expect(hasTagsQuery).toBe(true);
  });

  it("[異常系] 練習一覧のみ失敗しても spinner に相当する Promise は例外を投げず、他クエリは再取得される", async () => {
    render(<PracticesScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);
    await waitFor(() => expect(apiMocks.getPractices).toHaveBeenCalled());
    await waitForQuiescence(queryClient);

    apiMocks.getPractices.mockRejectedValueOnce(new Error("network down"));
    const tagsCallsBefore = apiMocks.getPracticeTags.mock.calls.length;

    await expect(
      act(async () => {
        await captured.refreshAll!();
        await waitForQuiescence(queryClient);
      }),
    ).resolves.not.toThrow();

    expect(apiMocks.getPracticeTags.mock.calls.length).toBeGreaterThan(tagsCallsBefore);
  });
});
