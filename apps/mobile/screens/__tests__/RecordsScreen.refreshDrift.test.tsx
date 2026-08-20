// =============================================================================
// RecordsScreen.refreshDrift.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点: [V-04] 6画面すべてで「画面と子孫が依存する全 active query」に
// 漏れがないこと。RecordsScreen は PracticesScreen と同様 `keys.ts` に定義されていない
// 孤立キー (["entryOnlyItems", userId]) と disabled な useDayEntriesQuery(日付詳細モーダル用)
// を自前で持つが、加えて DashboardScreen と同型の「子孫コンポーネントが独自クエリを持つ」
// ケースでもある: RecordItem 配下の BestTimeBadge (一覧パス) が
// useListBestCandidatesQuery (queryKey = recordKeys.listBestCandidates({...}))を保持する。
//
// PM 確定事実: このクエリは (userId, styleId, isRelaying, poolType) の組み合わせごとに
// queryKey が分かれ、画面側からは個々の filters を再現できないため、RecordsScreen の
// refreshAll は recordKeys.bestCandidates() の前方一致で invalidateQueries している
// (Promise.allSettled の4番目)。この行が直近の Critical 修正であり、本テストはこの修正が
// 効いていることを担保するために書かれる。
//
// PM からの明示的要求 (最重要・DashboardScreen.refreshDrift.test.tsx と同一方針):
// queryKey のリストを一切ハードコードしない。
// 1. RecordsScreen を実 QueryClientProvider 配下で render し、初期ロードが落ち着くのを待つ
// 2. その時点で queryClient.getQueryCache() から「observer を持つ (active な) 全 query」を
//    実測で列挙し、各々の dataUpdateCount を記録する
// 3. refreshAll (= usePullToRefresh に渡される関数) を発火する
// 4. 手順2で列挙した「実測済みの active query 集合」の全てについて、
//    dataUpdateCount が増加したことを assert する
//
// 偽 green 防止 (最重要): BestTimeBadge は「ロード中・判定不能 (styleId / recordDate なし)・
// エラー・time<=0 → 非表示」であり、fixture の記録データが不適切だと
// useListBestCandidatesQuery が一度もマウントされず、「active query 集合」に現れないため、
// refreshAll がベスト候補を尽くしていなくてもテストが green になってしまう。
// このため、以下を必須要件として実装する:
// - styleId / 記録日 (competition.date) / time > 0 が揃った有効な記録 fixture を用意する
// - 実測した active query 集合に recordKeys.bestCandidates() (= ["records","list",
//   "bestCandidates"]) で始まる queryKey が少なくとも1件含まれることを、部分一致
//   (toContain) ではなく厳密一致 (先頭3要素の JSON.stringify 比較) で assert する。
//   これが含まれない、または通らない場合はテスト自体を FAIL させる。
//
// ミューテーション確認 (このテストが本当にバグを検出できることの証明) は QA 報告に記載する。
// 実行手順:
//   1. apps/mobile/screens/RecordsScreen.tsx の refreshAll から
//      `queryClient.invalidateQueries({ queryKey: recordKeys.bestCandidates() }),`
//      の行を一時的に削除する (PM が代行する。QA はプロダクションコードを変更しない)
//   2. `pnpm --filter @swim-hub/mobile exec vitest run
//      screens/__tests__/RecordsScreen.refreshDrift.test.tsx -t "ドリフト検出"` を実行し、
//      本テストが FAIL することを確認する (listBestCandidates の dataUpdateCount が増加しない)
//   3. 元の行に戻し、green に復帰することを確認する

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordKeys } from "@apps/shared/hooks/queries/keys";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";

// -----------------------------------------------------------------------------
// react-navigation の useFocusEffect グローバルモックはマウントごとに1回同期実行する
// 実装になっており (Dashboard/PracticesScreen.refreshDrift.test.tsx と同じ懸念)、
// このファイルでもマウント時に一度だけ発火する安全な実装に上書きする。
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
// このリポジトリの vitest 環境では変換に失敗する (PracticesScreen.refreshDrift.test.tsx
// と同一の既知の壁)。data 全件を素の div でレンダーする軽量モックに差し替える
// (これにより displayRecords の全件が RecordItem として実際にマウントされ、
// BestTimeBadge の useListBestCandidatesQuery も実際に発火する)。
vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListEmptyComponent,
    refreshControl,
    ...props
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    refreshControl?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      refreshControl ?? null,
      ListHeaderComponent ?? null,
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
// eager import する。Dashboard/PracticesScreen.refreshDrift.test.tsx と同一パターンで補う。
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

// RecordsScreen 自身が使う useRecordsQuery / useListBestCandidatesQuery (BestTimeBadge 経由)
// は内部で `new RecordAPI(supabase)` を構築するため、API クラスごとモックする
// (MyPageScreen.refreshDrift.test.tsx / BestTimeBadge.test.tsx と同一パターン)。
const apiMocks = vi.hoisted(() => ({
  getRecords: vi.fn(),
  getCompetitions: vi.fn(),
  getListBestCandidates: vi.fn(),
  subscribeToRecords: vi.fn(),
  subscribeToCompetitions: vi.fn(),
  getCalendarEntries: vi.fn(),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getRecords = apiMocks.getRecords;
    getCompetitions = apiMocks.getCompetitions;
    getListBestCandidates = apiMocks.getListBestCandidates;
    subscribeToRecords = apiMocks.subscribeToRecords;
    subscribeToCompetitions = apiMocks.subscribeToCompetitions;
  },
}));

vi.mock("@apps/shared/api/dashboard", () => ({
  DashboardAPI: class {
    getCalendarEntries = apiMocks.getCalendarEntries;
  },
}));

const USER_ID = "user-1";

let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: supabaseMock.client, user: { id: USER_ID } }),
}));

import { RecordsScreen } from "../RecordsScreen";

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

/**
 * queryKey の先頭が recordKeys.bestCandidates() (= ["records","list","bestCandidates"]) と
 * 厳密一致するかを判定する。fixture 名の部分文字列一致で偽陽性を出さないよう、
 * toContain 等の部分一致ではなく、先頭 N 要素の配列を JSON.stringify で厳密比較する。
 */
function isBestCandidatesQuery(query: Query): boolean {
  const prefix = recordKeys.bestCandidates();
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < prefix.length) return false;
  return JSON.stringify(key.slice(0, prefix.length)) === JSON.stringify(prefix);
}

// styleId / competition.date (記録日) / time > 0 が揃った有効な記録 fixture。
// BestTimeBadge の doc コメント (ロード中・判定不能・エラー・time<=0 → 非表示) に抵触しない
// ことで useListBestCandidatesQuery を実際に active にする(偽 green 防止の要件)。
const VALID_RECORD: RecordWithDetails = {
  id: "record-1",
  user_id: USER_ID,
  competition_id: "comp-1",
  team_id: null,
  style_id: 1,
  time: 60.0,
  video_path: null,
  video_thumbnail_path: null,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 1,
  created_at: "2025-03-01T00:00:00.000Z",
  updated_at: "2025-03-01T00:00:00.000Z",
  competition: {
    id: "comp-1",
    user_id: USER_ID,
    team_id: null,
    title: "テスト大会",
    date: "2025-03-01",
    end_date: null,
    place: "東京",
    pool_type: 1,
    note: null,
    created_at: "2025-03-01T00:00:00.000Z",
    updated_at: "2025-03-01T00:00:00.000Z",
  },
  style: {
    id: 1,
    name_jp: "100m自由形",
    name: "100Fr",
    style: "fr",
    distance: 100,
  },
  split_times: [],
};

describe("RecordsScreen — pull-to-refresh のクエリ網羅性 (ドリフト検出)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    captured.refreshAll = null;

    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        // entryOnlyItems クエリ(keys.ts 外の孤立キー)が直接叩くテーブル
        entries: { data: [] },
        records: { data: [] },
      },
    });

    apiMocks.getRecords.mockResolvedValue([VALID_RECORD]);
    apiMocks.getCompetitions.mockResolvedValue([VALID_RECORD.competition]);
    apiMocks.getListBestCandidates.mockResolvedValue({ competitionRows: [], bulkRows: [] });
    apiMocks.subscribeToRecords.mockReturnValue({});
    apiMocks.subscribeToCompetitions.mockReturnValue({});
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
      "(記録一覧 + 大会一覧 + keys.ts 外の孤立キー ['entryOnlyItems'] + " +
      "子孫 BestTimeBadge の listBestCandidates)",
    async () => {
      render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });
      await waitForQuiescence(queryClient);
      await waitFor(() => {
        expect(apiMocks.getRecords).toHaveBeenCalled();
        expect(apiMocks.getCompetitions).toHaveBeenCalled();
      });
      // getRecords 完了 → RecordItem/BestTimeBadge マウント → listBestCandidates フェッチ、
      // という2段階の非同期を跨ぐため、再度 quiescence を待つ
      await waitFor(() => {
        expect(apiMocks.getListBestCandidates).toHaveBeenCalled();
      });
      await waitForQuiescence(queryClient);

      const before = activeQueries(queryClient);
      expect(before.length).toBeGreaterThan(0);

      // 偽 green 防止の必須 assert: fixture が BestTimeBadge のクエリを active にできて
      // いなければ、このテスト自体を FAIL させる (recordKeys.bestCandidates() で始まる
      // queryKey が実測集合に厳密一致で含まれることを確認する)。
      const hasBestCandidatesQuery = before.some(isBestCandidatesQuery);
      expect(
        hasBestCandidatesQuery,
        `active query 集合に recordKeys.bestCandidates() (${JSON.stringify(
          recordKeys.bestCandidates(),
        )}) で始まる queryKey が存在しない。BestTimeBadge (子孫コンポーネント) の ` +
          `useListBestCandidatesQuery が有効化されていない可能性がある (fixture 不備で偽 green の恐れ)。` +
          `実測された queryKey 一覧: ${JSON.stringify(before.map((q) => q.queryKey))}`,
      ).toBe(true);

      const beforeCounts = new Map(before.map((q) => [q.queryHash, q.state.dataUpdateCount]));

      expect(captured.refreshAll).not.toBeNull();
      await act(async () => {
        await captured.refreshAll!();
      });
      await waitForQuiescence(queryClient);

      // 実測した集合 (= before) に対してのみ検証する。期待値リストは実装から一切コピーしていない
      for (const query of before) {
        const prevCount = beforeCounts.get(query.queryHash)!;
        expect(
          query.state.dataUpdateCount,
          `queryKey=${JSON.stringify(query.queryKey)} (queryHash=${query.queryHash}) が ` +
            `refreshAll で再取得されていない (dataUpdateCount: ${prevCount} → ${query.state.dataUpdateCount})`,
        ).toBeGreaterThan(prevCount);
      }
    },
  );

  it(
    "[観測前提] BestTimeBadge (子孫コンポーネント) の listBestCandidates クエリが " +
      "実際に active として観測される (厳密一致・部分一致 toContain は使わない)",
    async () => {
      render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });
      await waitForQuiescence(queryClient);
      await waitFor(() => expect(apiMocks.getListBestCandidates).toHaveBeenCalled());
      await waitForQuiescence(queryClient);

      const hasBestCandidatesQuery = activeQueries(queryClient).some(isBestCandidatesQuery);
      expect(hasBestCandidatesQuery).toBe(true);
      // queryFn には (userId, styleId, isRelaying, poolType) がそのまま渡ることも確認する
      expect(apiMocks.getListBestCandidates).toHaveBeenCalledWith(USER_ID, 1, false, 1);
    },
  );

  it("[観測前提] entryOnlyItems クエリ (keys.ts 外の孤立キー) が実際に active として観測される", async () => {
    render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);

    const hasEntryOnlyQuery = activeQueries(queryClient).some(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(["entryOnlyItems", USER_ID]),
    );
    expect(hasEntryOnlyQuery).toBe(true);
  });

  it("[異常系] 記録一覧のみ失敗しても spinner に相当する Promise は例外を投げず、他クエリは再取得される", async () => {
    render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);
    await waitFor(() => expect(apiMocks.getListBestCandidates).toHaveBeenCalled());
    await waitForQuiescence(queryClient);

    apiMocks.getRecords.mockRejectedValueOnce(new Error("network down"));
    const bestCandidatesCallsBefore = apiMocks.getListBestCandidates.mock.calls.length;

    await expect(
      act(async () => {
        await captured.refreshAll!();
        await waitForQuiescence(queryClient);
      }),
    ).resolves.not.toThrow();

    // recordKeys.bestCandidates() の invalidateQueries は getRecords の失敗と独立した
    // Promise.allSettled の別枝のため、getRecords が reject しても実行される
    expect(apiMocks.getListBestCandidates.mock.calls.length).toBeGreaterThan(bestCandidatesCallsBefore);
  });
});
