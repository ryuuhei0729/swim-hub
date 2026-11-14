import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";

// -----------------------------------------------------------------------------
// react-navigation の useFocusEffect グローバルモック (vitest.setup.ts) は
// 「呼ばれるたびに callback を同期実行する」実装になっており、実機の
// 「フォーカスされた時だけ発火する」挙動とは異なる。react-query の再フェッチは
// 購読しているコンポーネントを再レンダーさせるため、このグローバルモックの
// ままだと「再レンダー → useFocusEffect 発火 → refetch → 再レンダー → ...」の
// ループを誘発しかねない (useRefreshOnFocus を実際に使う画面を describe.each
// 等でマウントするテストがこれまで一件も存在しなかったのはこれが一因と推測される)。
// このファイルではマウント時に一度だけ発火する安全な実装に上書きする
// (「フォーカス復帰で再取得される」経路自体は hooks/__tests__/useRefreshOnFocus.test.ts
// で hook 単体として別途検証する)。
const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
const check = vi.hoisted(() => ({
  state: { expiredGoal: null as null | { id: string }, expiredMilestone: null as null | { id: string } },
  handlers: { handleGoalSaved: vi.fn(), handleMilestoneSaved: vi.fn(), skipGoal: vi.fn(), skipMilestone: vi.fn() },
}));
vi.mock("@/hooks/useExpiredGoalCheck", () => ({
  useExpiredGoalCheck: () => ({ ...check.state, ...check.handlers }),
}));
vi.mock("@/components/ui/ScreenSkeletons", () => ({
  DashboardSkeleton: () => <div data-testid="calendar-skeleton" />,
}));
vi.mock("@/components/goals/GoalReflectionModal", () => ({
  GoalReflectionModal: (p: { goal: { id: string }; onSkip: () => void; onSaved: () => void; onGoToGoals?: () => void }) => (
    // onGoToGoals は渡されないはず (v6): 渡されたら data 属性で観測できるようにする
    <div data-testid="goal-modal" data-id={p.goal.id}>
      <button onClick={p.onSkip}>goal-skip</button><button onClick={p.onSaved}>goal-saved</button>{p.onGoToGoals && <button onClick={p.onGoToGoals}>goal-go</button>}
    </div>
  ),
}));
vi.mock("@/components/goals/ReflectionModal", () => ({
  ReflectionModal: (p: { milestone: { id: string }; onSkip: () => void; onSaved: () => void; onGoToGoals: () => void }) => (
    <div data-testid="ms-modal" data-id={p.milestone.id}>
      <button onClick={p.onSkip}>ms-skip</button><button onClick={p.onSaved}>ms-saved</button><button onClick={p.onGoToGoals}>ms-go</button>
    </div>
  ),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: nav.navigate, goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// DayDetailModal はバレル export 経由で ImageViewerModal (components/shared) を
// eager import する。react-native 静的モックには Dimensions が無く、
// expo-image-picker / expo-image-manipulator も未モックだと落ちるため、
// 既存の DayDetailModal 系テスト (PracticeLogDetail.share.test.tsx) と同一パターンで補う。
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

// -----------------------------------------------------------------------------
// usePullToRefresh は薄いラッパー (オフライン判定 + spinner state) であり、
// 独立したユニットテスト (hooks/__tests__/usePullToRefresh.test.ts) で別途検証済み。
// このテストの関心事は「画面が組み立てる refreshAll がどのクエリを尽くすか」であり
// usePullToRefresh 自体の再検証ではないため、DashboardScreen が組み立てた
// refreshAll 関数そのものを捕捉できるよう薄くモックする
// (= RefreshControl 経由でクリックイベントを発火させる代替手段。
//  react-native の ScrollView 静的モックは `refreshControl` prop を
//  DOM に反映しないため、UI 経由でのクリック発火は不可能)。
const captured = vi.hoisted(() => ({
  refreshAll: null as null | (() => Promise<unknown>),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => {
    captured.refreshAll = refresh;
    return { refreshing: false, handleRefresh: refresh };
  },
}));

// -----------------------------------------------------------------------------
// DayDetailModal の編集/削除ハンドラ群は本テストの検証範囲外
// (useUserQuery / usePracticesQuery / useIOSCalendarSync 等、無関係な依存が
// 大量にぶら下がるため、既存の useDayDetailHandlers.test.tsx と同じ方針で
// フック自体をスタブする)。
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

// DayDetailModal 配下 (バレル export 経由で eager import される) には
// expo-image-picker に依存する ImageUploader が含まれる。既存のテスト
// (RecordFormScreen.standalone.test.tsx 等) と同じ方針でスタブする。
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: () => null,
}));
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: () => null,
}));
// react-native-view-shot (Flow構文) に依存する共有カード機能もスタブする
// (PracticeLogDetail.share.test.tsx と同一パターン)。
vi.mock("@/components/share", () => ({
  ShareCardModal: () => null,
}));

// CalendarView は react-i18next のグローバルモック (returnObjects 非対応) と
// 相性が悪く本テストの関心事でもないためスタブする。DayDetailModal 等
// 同バレルの他 export は実物のまま使う (importOriginal で温存)。
vi.mock("@/components/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/calendar")>();
  return {
    ...actual,
    CalendarView: (p: { isLoading: boolean; onNextMonth: () => void }) => (
      <div data-testid="calendar" data-loading={String(p.isLoading)}>
        <button onClick={p.onNextMonth}>next-month</button>
      </div>
    ),
  };
});

const apiMocks = vi.hoisted(() => ({
  getMyTeams: vi.fn(),
  getCalendarEntries: vi.fn(),
  announcementsList: vi.fn(),
}));

vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = apiMocks.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {
    list = apiMocks.announcementsList;
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

import { DashboardScreen } from "../DashboardScreen";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// =============================================================================
// DashboardScreen.monthSwitchLoading.test.tsx
// カレンダーで月を切り替えたとき、読み込み中になるのはカレンダーだけで、
// ホーム全体 (全画面スケルトン / 全画面エラー) には切り替わらないことを確認する。
// 壊したら赤: 月の切り替えでホーム全体がスケルトンや全画面エラーに戻る
// =============================================================================
async function mountDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<DashboardScreen />, { wrapper: createWrapper(queryClient) });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

describe("DashboardScreen — 月の切り替え時の読み込み表示", () => {
  beforeEach(() => {
    check.state.expiredGoal = null;
    check.state.expiredMilestone = null;
    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        users: { data: { personal_practice_color: null, personal_competition_color: null } },
        user_team_calendar_colors: { data: [] },
        practices: { data: [] },
        competitions: { data: [] },
      },
    });
    apiMocks.getMyTeams.mockResolvedValue([]);
    apiMocks.getCalendarEntries.mockResolvedValue([]);
    apiMocks.announcementsList.mockResolvedValue([]);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("初回の読み込み中はホーム全体のスケルトンを出す", async () => {
    apiMocks.getCalendarEntries.mockReturnValue(new Promise(() => {}));
    await mountDashboard();
    expect(screen.getByTestId("calendar-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("calendar")).toBeNull();
  });

  it("次月へ切り替えて読み込み中の間、ホームはそのままでカレンダーだけが読み込み中になる", async () => {
    await mountDashboard();
    expect(screen.getByTestId("calendar").getAttribute("data-loading")).toBe("false");

    let resolveNext: (v: unknown[]) => void = () => {};
    apiMocks.getCalendarEntries.mockReturnValue(new Promise((r) => { resolveNext = r; }));
    await act(async () => { fireEvent.click(screen.getByText("next-month")); });

    expect(screen.queryByTestId("calendar-skeleton")).toBeNull();
    expect(screen.getByTestId("calendar").getAttribute("data-loading")).toBe("true");

    await act(async () => { resolveNext([]); await new Promise((r) => setTimeout(r, 10)); });
    expect(screen.getByTestId("calendar").getAttribute("data-loading")).toBe("false");
  });

  it("次月の取得に失敗しても全画面エラーにせず、ホームとカレンダーを出したままにする", async () => {
    await mountDashboard();
    apiMocks.getCalendarEntries.mockRejectedValue(new Error("network"));
    await act(async () => {
      fireEvent.click(screen.getByText("next-month"));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByTestId("calendar-skeleton")).toBeNull();
    expect(screen.getByTestId("calendar")).toBeTruthy();
  });
});
