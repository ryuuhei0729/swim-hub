/**
 * RecordsScreen.targetMode.test.tsx
 *
 * Sprint Contract (大会タブでカードをタップしたとき、DayDetailModal を
 * 「タップした記録1件のみ」表示モードで開く) 検証観点:
 *
 *   [V-48]  記録カードをタップすると、DayDetailModal に
 *           scope="competition" / targetId=record.competition.id /
 *           targetRecordId=record.id / titleOverride=competition.title
 *           (未入力なら「大会」) が渡る (同じ大会の他種目記録は出さない)
 *   [V-48d] 「エントリー済み(記録未登録)」カードをタップすると targetId=競技会id は渡るが
 *           targetRecordId は渡らない (PM裁定: 同じ大会に絞るが特定記録には絞らない)
 *
 * 対象実装 (未実装 / 現状は日付だけで DayDetailModal を開き targetId 系は一切渡さないため RED):
 *   apps/mobile/screens/RecordsScreen.tsx (handleRecordPress / handleEntryOnlyPress)
 *
 * テスト方針:
 *   RecordsScreen.refreshDrift.test.tsx と同一のモック基盤 (react-navigation /
 *   @shopify/flash-list 軽量スタブ / RecordAPI クラスモック) を流用しつつ、
 *   `@/components/calendar` の DayDetailModal を props キャプチャ用スタブに差し替え、
 *   `@/components/records` の RecordItem/EntryOnlySection も onPress 引数をそのまま
 *   forward する軽量スタブに差し替える (実際のカードUI描画はこのテストの関心事ではない)。
 *
 * トートロジー防止メモ:
 *   期待値は PM 確定仕様 (大会タブ=タップした記録1件のみ、他種目は出さない / エントリー済み
 *   行はPM裁定により同じ大会に絞るが特定記録には絞らない) から導出したものであり、
 *   RecordsScreen.tsx の実装を読んでコピーしたものではない。
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import type { EntryOnlyItem } from "@/utils/entryOnlyFilter";

// --------------------------------------------------------------------------
// react-i18next の t をキー呼び出しごとスパイする (このファイルのみのローカル上書き)。
//
// 【Critical修正の経緯】グローバル設定 (vitest.setup.ts) の t モックは ja.json から実値を
// 解決する。ja.json では `teams.mobile.fallbackCompetitionName` と
// `competition.client.competitionFallback` がどちらも "大会" であり、解決後の文字列を
// assert しても「どちらのキーが呼ばれたか」を一切区別できない
// (Reviewer 指摘: 過去の [Reviewer指摘再検証] テストは常に GREEN になり、キー取り違えの
// 退行を検出できていなかった)。解決結果ではなく呼び出しキーそのものを検証するため、
// t を vi.fn() でラップしそのまま ja.json 実値も返す (他コンポーネントの描画は壊さない)。
// --------------------------------------------------------------------------
import jaMessages from "@apps/shared/messages/ja.json";

function resolveJaKey(key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = jaMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

const tSpy = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: tSpy,
    i18n: { language: "ja", changeLanguage: vi.fn(async () => undefined) },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

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

// DayDetailModal を props キャプチャ用スタブに差し替える (このテストの唯一の関心事)
const capturedModalProps = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
}));
vi.mock("@/components/calendar", () => ({
  DayDetailModal: (props: Record<string, unknown>) => {
    if (props.visible) {
      capturedModalProps.current = props;
    }
    return null;
  },
  CalendarView: () => null,
}));

// RecordItem/EntryOnlySection は実UIを持たず、onPress 引数だけをテストから駆動できる
// 軽量スタブに差し替える (カードUIの描画は本テストの関心事ではない)
vi.mock("@/components/records", () => ({
  RecordItem: ({
    record,
    onPress,
  }: {
    record: RecordWithDetails;
    onPress: (record: RecordWithDetails) => void;
  }) => (
    <button data-testid={`record-item-${record.id}`} onClick={() => onPress(record)}>
      {record.competition?.title ?? "record"}
    </button>
  ),
  EntryOnlySection: ({
    items,
    onItemPress,
  }: {
    items: EntryOnlyItem[];
    onItemPress: (item: EntryOnlyItem) => void;
  }) => (
    <div>
      {items.map((item) => (
        <button
          key={item.competitionId}
          data-testid={`entry-only-${item.competitionId}`}
          onClick={() => onItemPress(item)}
        >
          {item.competitionName}
        </button>
      ))}
    </div>
  ),
  StandaloneRecordDetailModal: () => null,
}));

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

// entries/records の直接クエリ (エントリー済みセクション用) は supabase.from(...) 経由で
// 呼ばれるため、テーブル名ごとに固定データを返すディスパッチ式スタブにする。
// "entries" は ENTRY_ONLY_ROW 1件、"records" は空 (= その大会にまだ記録が無い =
// エントリー済みセクションに載る条件を満たす) を返す。
const ENTRY_ONLY_ROW = {
  id: "entry-1",
  style_id: 2,
  entry_time: null,
  competition_id: "comp-9",
  style: { id: 2, name_jp: "200m自由形" },
  competition: {
    id: "comp-9",
    title: "D大会",
    date: "2026-07-20",
    place: "大阪",
    pool_type: 0,
    team_id: null,
    team: null,
  },
};

function makeChain(data: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  return chain;
}

const entriesChain = makeChain([ENTRY_ONLY_ROW]);
const recordsRawChain = makeChain([]);

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {
      from: (table: string) => (table === "entries" ? entriesChain : recordsRawChain),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } } }) },
      removeChannel: () => {},
    },
    user: { id: USER_ID },
  }),
}));

import { RecordsScreen } from "../RecordsScreen";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const RECORD_A: RecordWithDetails = {
  id: "record-A",
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
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  competition: {
    id: "comp-1",
    user_id: USER_ID,
    team_id: null,
    title: "第10回市民大会",
    date: "2026-07-15",
    end_date: null,
    place: "東京",
    pool_type: 1,
    note: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
  style: { id: 1, name_jp: "100m自由形", name: "100Fr", style: "Fr", distance: 100 },
  split_times: [],
};

// 大会名未入力(title: null)のケース。titleOverride のフォールバックキーが
// `teams.mobile.fallbackCompetitionName` から `competition.client.competitionFallback` に
// 統一された(Reviewer指摘のen不一致修正)ことを検証するための専用フィクスチャ。
// ja では両キーとも「大会」で表示不変だが、その等価性に依存せず実際に呼ばれる
// キーの解決結果を直接assertする。
const RECORD_NO_TITLE: RecordWithDetails = {
  ...RECORD_A,
  id: "record-B",
  competition_id: "comp-2",
  competition: {
    ...RECORD_A.competition!,
    id: "comp-2",
    title: null,
  },
};

describe("RecordsScreen — 行タップで DayDetailModal に渡る targetId/targetRecordId/titleOverride", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks は呼び出し履歴のみ消去し実装は保持するはずだが、明示的に再設定して
    // テスト間の実装漏れを防ぐ (t の呼び出しキーを検証するテストの前提条件)
    tSpy.mockImplementation((key: string, options?: { defaultValue?: string }) => {
      return resolveJaKey(key) ?? options?.defaultValue ?? key;
    });
    capturedModalProps.current = null;
    apiMocks.getRecords.mockResolvedValue([RECORD_A]);
    apiMocks.getCompetitions.mockResolvedValue([]);
    apiMocks.getListBestCandidates.mockResolvedValue([]);
    apiMocks.subscribeToRecords.mockReturnValue({});
    apiMocks.subscribeToCompetitions.mockReturnValue({});
    apiMocks.getCalendarEntries.mockResolvedValue([]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("[V-48] 記録カードをタップすると targetId=大会id / targetRecordId=記録id / titleOverride=大会名 が渡る", async () => {
    render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(screen.getByTestId("record-item-record-A")).toBeDefined());
    fireEvent.click(screen.getByTestId("record-item-record-A"));

    await waitFor(() => expect(capturedModalProps.current).not.toBeNull());
    expect(capturedModalProps.current?.scope).toBe("competition");
    expect(capturedModalProps.current?.targetId).toBe("comp-1");
    expect(capturedModalProps.current?.targetRecordId).toBe("record-A");
    expect(capturedModalProps.current?.titleOverride).toBe("第10回市民大会");
  });

  it(
    "[Reviewer指摘再検証・Critical修正] 大会名未入力の記録をタップすると、" +
      "titleOverride のフォールバックに competition.client.competitionFallback キーが " +
      "呼ばれる (teams.mobile.fallbackCompetitionName ではない)。" +
      "ja では両キーとも解決結果が同一文字列 (\"大会\") になるため、解決結果ではなく " +
      "t の呼び出しキーそのものを検証する (解決結果だけの assert はキー取り違えの" +
      "退行を検出できない — Reviewer Critical 指摘の再発防止)",
    async () => {
      apiMocks.getRecords.mockResolvedValue([RECORD_NO_TITLE]);
      render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => expect(screen.getByTestId("record-item-record-B")).toBeDefined());
      fireEvent.click(screen.getByTestId("record-item-record-B"));

      await waitFor(() => expect(capturedModalProps.current).not.toBeNull());
      expect(capturedModalProps.current?.titleOverride).toBe("大会");
      expect(tSpy).toHaveBeenCalledWith("competition.client.competitionFallback");
      expect(tSpy).not.toHaveBeenCalledWith("teams.mobile.fallbackCompetitionName");
    },
  );

  it(
    "[V-48d] 「エントリー済み(記録未登録)」カードをタップすると targetId=大会id は渡るが " +
      "targetRecordId は渡らない (PM裁定: 同じ大会に絞るが特定記録には絞らない)",
    async () => {
      render(<RecordsScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => expect(screen.getByTestId("entry-only-comp-9")).toBeDefined());
      fireEvent.click(screen.getByTestId("entry-only-comp-9"));

      await waitFor(() => expect(capturedModalProps.current).not.toBeNull());
      expect(capturedModalProps.current?.scope).toBe("competition");
      expect(capturedModalProps.current?.targetId).toBe("comp-9");
      expect(capturedModalProps.current?.targetRecordId).toBeUndefined();
    },
  );
});
