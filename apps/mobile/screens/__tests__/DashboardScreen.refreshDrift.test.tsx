// =============================================================================
// DashboardScreen.refreshDrift.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点:
//   ユーザー報告バグ「ホーム画面で pull-to-refresh しても、子孫コンポーネント
//   (TeamAnnouncementsSection 配下の TeamCard) が持つお知らせクエリが再取得されず、
//   タスクキルするまで新規お知らせが表示されない」の再発防止。
//
// PM からの明示的要求 (最重要): 「実装がどの queryKey を列挙しているか」をテストに
// ハードコードして突合するテストは、実装をミラーするだけのトートロジーであり、
// 将来子コンポーネントが新しいクエリを追加したときの再発を検出できない。
//
// このテストは queryKey のリストを一切ハードコードしない。
// 1. DashboardScreen を実 QueryClientProvider 配下で render し、初期ロードが
//    落ち着くのを待つ
// 2. その時点で queryClient.getQueryCache() から「observer を持つ (active な)
//    全 query」を実測で列挙し、各々の dataUpdateCount を記録する
// 3. refreshAll (= usePullToRefresh に渡される関数。DashboardScreen 内部で
//    calendar/teams/calendarColorSettings の refetch と announcements/notifications
//    の invalidateQueries をまとめたもの) を発火する
// 4. 手順2で列挙した「実測済みの active query 集合」の全てについて、
//    dataUpdateCount が増加したことを assert する
//
// これにより、TeamAnnouncementsSection (または将来追加される別の子孫コンポーネント)
// が新しいクエリを増やしたとき、refreshAll がそれを尽くしていなければ
// このテストは自動的に FAIL する。
//
// ミューテーション確認 (このテストが本当にバグを検出できることの証明) は
// このファイルの末尾のコメントと QA 報告に記載する。実行手順:
//   1. apps/mobile/screens/DashboardScreen.tsx の
//      `queryClient.invalidateQueries({ queryKey: announcementKeys.lists() })` を
//      一時的にコメントアウトする
//   2. `pnpm --filter @swim-hub/mobile exec vitest run
//      screens/__tests__/DashboardScreen.refreshDrift.test.tsx` を実行し、
//      本テストが FAIL することを確認する
//   3. 元に戻し、green に復帰することを確認する
// (QA はプロダクションコードを変更しない制約があるため、この手順は QA が
//  一時的に実施し証跡を報告した上で必ず元に戻す)

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@tanstack/react-query";
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
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
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
    CalendarView: () => null,
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
const TEAM_ID = "team-1";

const APPROVED_TEAM = {
  id: "membership-1",
  team_id: TEAM_ID,
  user_id: USER_ID,
  role: "member",
  status: "approved" as const,
  is_active: true,
  joined_at: "2026-01-01T00:00:00Z",
  left_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  teams: { id: TEAM_ID, name: "テストチーム" },
  users: { id: USER_ID, name: "テストユーザー" },
};

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

/** active (observer を持つ) query のうち、まだ fetch 中のものが無いことを待つ */
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

/**
 * 「observer を持ち (active)、かつ既に一度でも成功フェッチ済み」の query を列挙する。
 *
 * `useQuery` は `enabled: false` でも observer は必ず生成される (DashboardScreen の
 * useTeamsQuery は teamId 未指定のため、内部の teamDetailQuery/membersQuery/
 * announcementsQuery(teamKeys側) は enabled:false のまま永久に observer だけ持つ)。
 * これらは一度も画面に表示されうるデータを持たないため「ユーザーに見えている
 * stale データ」ではなく、pull-to-refresh 網羅性チェックの対象外とするのが妥当。
 * dataUpdateCount > 0 (= 少なくとも1回は実際に成功取得している) でフィルタすることで、
 * 「表示されうる実データを持つ active query」だけを実測対象にする
 * (queryKey のリストは一切ハードコードしていない点は変わらない)。
 */
function activeQueries(queryClient: QueryClient): Query[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.getObserversCount() > 0 && q.state.dataUpdateCount > 0);
}

describe("DashboardScreen — pull-to-refresh のクエリ網羅性 (ドリフト検出)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    captured.refreshAll = null;

    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        // カレンダー記録色設定(個人)
        users: { data: { personal_practice_color: null, personal_competition_color: null } },
        // カレンダー記録色設定(チーム)
        user_team_calendar_colors: { data: [] },
        // 出欠未回答 / エントリー未提出の照会対象 (0件なので team_attendance/entries までは到達しない)
        practices: { data: [] },
        competitions: { data: [] },
      },
    });

    apiMocks.getMyTeams.mockResolvedValue([APPROVED_TEAM]);
    apiMocks.getCalendarEntries.mockResolvedValue([]);
    apiMocks.announcementsList.mockResolvedValue([]);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "[ドリフト検出] refreshAll 発火前から observer を持つ全 active query が、" +
      "queryKey をハードコードせずに再取得されたことを確認する",
    async () => {
      render(<DashboardScreen />, { wrapper: createWrapper(queryClient) });

      // 初期ロードが落ち着くまで待つ (calendar / teams / calendarColorSettings /
      // TeamCard の announcements / notifications x2 が揃う)
      await waitForQuiescence(queryClient);
      await waitFor(() => {
        expect(apiMocks.announcementsList).toHaveBeenCalled();
      });
      await waitForQuiescence(queryClient);

      const before = activeQueries(queryClient);

      // 前提が壊れていないことの sanity check (0件だと以降の検証が無意味になる)
      expect(before.length).toBeGreaterThan(0);
      const beforeCounts = new Map(before.map((q) => [q.queryHash, q.state.dataUpdateCount]));

      expect(captured.refreshAll).not.toBeNull();
      await act(async () => {
        await captured.refreshAll!();
      });
      await waitForQuiescence(queryClient);

      // 実測した集合 (= before) に対してのみ検証する。期待値リストは実装から
      // 一切コピーしていない
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

  it("[観測前提] TeamAnnouncementsSection 配下の announcements クエリが実際に active として観測される", async () => {
    render(<DashboardScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);
    await waitFor(() => {
      expect(apiMocks.announcementsList).toHaveBeenCalled();
    });

    const hasAnnouncementsQuery = activeQueries(queryClient).some((q) => q.queryKey[0] === "announcements");
    expect(hasAnnouncementsQuery).toBe(true);
  });

  it("[V-03] calendar / teams / calendarColorSettings の3クエリが refreshAll で実際に再 fetch される", async () => {
    render(<DashboardScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);
    await waitFor(() => expect(apiMocks.announcementsList).toHaveBeenCalled());
    await waitForQuiescence(queryClient);

    const callsBefore = {
      calendar: apiMocks.getCalendarEntries.mock.calls.length,
      teams: apiMocks.getMyTeams.mock.calls.length,
      colorUsers: supabaseMock.fetchCounts["users"] ?? 0,
    };

    await act(async () => {
      await captured.refreshAll!();
    });
    await waitForQuiescence(queryClient);

    expect(apiMocks.getCalendarEntries.mock.calls.length).toBeGreaterThan(callsBefore.calendar);
    expect(apiMocks.getMyTeams.mock.calls.length).toBeGreaterThan(callsBefore.teams);
    expect(supabaseMock.fetchCounts["users"] ?? 0).toBeGreaterThan(callsBefore.colorUsers);
  });

  it("[異常系] calendar のみ失敗しても spinner に相当する Promise は例外を投げず、他クエリは再取得される", async () => {
    render(<DashboardScreen />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);
    await waitFor(() => expect(apiMocks.announcementsList).toHaveBeenCalled());
    await waitForQuiescence(queryClient);

    apiMocks.getCalendarEntries.mockRejectedValueOnce(new Error("network down"));
    const teamsCallsBefore = apiMocks.getMyTeams.mock.calls.length;

    await expect(
      act(async () => {
        await captured.refreshAll!();
        await waitForQuiescence(queryClient);
      }),
    ).resolves.not.toThrow();

    expect(apiMocks.getMyTeams.mock.calls.length).toBeGreaterThan(teamsCallsBefore);
  });
});

// -----------------------------------------------------------------------------
// ミューテーション確認 (Before/After) は QA 報告に転記した。再現手順:
//
// 1. apps/mobile/screens/DashboardScreen.tsx の refreshAll から
//    `queryClient.invalidateQueries({ queryKey: announcementKeys.lists() }),`
//    の行を一時的に削除する
// 2. `pnpm --filter @swim-hub/mobile exec vitest run
//    screens/__tests__/DashboardScreen.refreshDrift.test.tsx -t "ドリフト検出"`
//    を実行する → announcements クエリの dataUpdateCount が増加しないため FAIL する
// 3. 元の行に戻し、green に復帰することを確認する
// -----------------------------------------------------------------------------
