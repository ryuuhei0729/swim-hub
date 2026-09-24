/**
 * PracticesScreen.targetMode.test.tsx
 *
 * Sprint Contract (練習タブでカードをタップしたとき、DayDetailModal を
 * 「タップした練習ログ1件のみ」表示モードで開く) 検証観点:
 *
 *   [V-48]  ログを持つ行をタップすると、DayDetailModal に
 *           scope="practice" / targetId=そのログのid / titleOverride=practice.title
 *           (未入力なら「練習」) が渡る
 *   [V-48b] ログが0件の行 (log===null) をタップすると、targetId=practice.id が渡る
 *           (buildPracticeLogRows の id 契約: log?.id ?? practice.id と一致すること)
 *   [V-48c] 同じ練習に複数ログがあるとき、どのログの行をタップしたかで targetId が変わる
 *           (兄弟ログの id を誤って渡さない)
 *
 * 対象実装 (未実装 / 現状は practice オブジェクトしか渡らないため RED):
 *   apps/mobile/screens/PracticesScreen.tsx (renderItem / handlePracticePress)
 *
 * テスト方針:
 *   PracticesScreen.refreshDrift.test.tsx と同一のモック基盤 (react-navigation /
 *   @shopify/flash-list 軽量スタブ / useDayDetailHandlers) を流用しつつ、
 *   `@/components/calendar` の DayDetailModal だけを props キャプチャ用スタブに差し替える。
 *   実 DayDetailModal は render せず、PracticesScreen 側の「どの id を渡す配線にしたか」
 *   だけを検証する (DayDetailModal 自身の絞り込み挙動は DayDetailModal.targetMode.test.tsx
 *   の責務)。
 *
 * トートロジー防止メモ:
 *   期待値 (どのケースでどの id が targetId になるべきか) は Planner が実測した
 *   buildPracticeLogRows の id 契約 (`id: log?.id ?? practice.id`, apps/shared/utils/
 *   practiceLogRows.ts) と PM 確定仕様 (タップした1件のみ) から導出したものであり、
 *   PracticesScreen.tsx の実装を読んでコピーしたものではない。
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PracticeWithLogs } from "@swim-hub/shared/types";

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

function makeLog(id: string, overrides: Partial<PracticeWithLogs["practice_logs"][number]> = {}) {
  return {
    id,
    user_id: USER_ID,
    practice_id: "practice-1",
    style: "Fr",
    swim_category: "Swim" as const,
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: null,
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: [],
    ...overrides,
  };
}

const PRACTICE_WITH_TITLE: PracticeWithLogs = {
  id: "practice-1",
  user_id: USER_ID,
  date: "2026-07-15",
  title: "朝練",
  place: "市民プール",
  note: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  practice_logs: [makeLog("log-A"), makeLog("log-B")],
};

const PRACTICE_NO_TITLE_NO_LOGS: PracticeWithLogs = {
  id: "practice-2",
  user_id: USER_ID,
  date: "2026-07-16",
  title: null,
  place: null,
  note: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  practice_logs: [],
};

describe("PracticesScreen — 行タップで DayDetailModal に渡る targetId/titleOverride", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedModalProps.current = null;
    apiMocks.getPracticeTags.mockResolvedValue([]);
    apiMocks.getCalendarEntries.mockResolvedValue([]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("[V-48] ログ1件目の行をタップすると targetId=そのログのid, titleOverride=practice.title が渡る", async () => {
    apiMocks.getPractices.mockResolvedValue([PRACTICE_WITH_TITLE]);
    render(<PracticesScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(apiMocks.getPractices).toHaveBeenCalled());

    // ListToolbar/SortBottomSheet 等にも button 要素があるため、練習カード固有のタイトル
    // テキストから closest("button") でカード自体の Pressable を辿る
    // (PracticeItem.test.tsx と同一のセレクタ手法)。practice_logs 配列順 = 表示順。
    const titleNodes = screen.getAllByText("朝練");
    expect(titleNodes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(titleNodes[0]!.closest("button")!);

    await waitFor(() => expect(capturedModalProps.current).not.toBeNull());
    expect(capturedModalProps.current?.scope).toBe("practice");
    expect(capturedModalProps.current?.targetId).toBe("log-A");
    expect(capturedModalProps.current?.titleOverride).toBe("朝練");
  });

  it("[V-48c] 同じ練習の2件目のログ行をタップすると targetId が別のログidになる", async () => {
    apiMocks.getPractices.mockResolvedValue([PRACTICE_WITH_TITLE]);
    render(<PracticesScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(apiMocks.getPractices).toHaveBeenCalled());

    const titleNodes = screen.getAllByText("朝練");
    expect(titleNodes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(titleNodes[1]!.closest("button")!);

    await waitFor(() => expect(capturedModalProps.current).not.toBeNull());
    expect(capturedModalProps.current?.targetId).toBe("log-B");
  });

  it("[V-48b] ログ0件の練習行をタップすると targetId=practice.id, titleOverride は「練習」 (フォールバック)", async () => {
    apiMocks.getPractices.mockResolvedValue([PRACTICE_NO_TITLE_NO_LOGS]);
    render(<PracticesScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(apiMocks.getPractices).toHaveBeenCalled());

    const titleNode = screen.getAllByText("練習")[0]!;
    fireEvent.click(titleNode.closest("button")!);

    await waitFor(() => expect(capturedModalProps.current).not.toBeNull());
    expect(capturedModalProps.current?.targetId).toBe("practice-2");
    expect(capturedModalProps.current?.titleOverride).toBe("練習");
  });
});
