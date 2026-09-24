/**
 * PracticeTabFormScreen.teamAdminTabScope.test.tsx
 *
 * Sprint Contract v3 — D9 / D10 / D11 の検証。SC-15 / SC-16 / SC-17 / SC-18 / SC-19, BC-9 / BC-10。
 *
 * ■ v3 (R14 / D11) による反転
 *   タブが1本しかないときは **FormTabBar 自体を描画しない**。
 *   origin="teamAdmin" の期待値は「練習タブ1件」ではなく
 *   **「role=tab の要素が DOM に1つも無い」**。
 *   対照 (origin 無し = 練習/練習ログの2件) はそのまま維持する。
 *
 * ■ 追加要望 (R10)
 *   管理者がチーム練習の作成/編集ボタンから開いた画面は **練習タブ1本のみ**。
 *   「ログ」タブは出さない (代理入力は一覧画面の導線に一本化)。
 *
 * ■ D10-(2) の事故経路 (最重要)
 *   log タブを隠す目的で `menus` の初期ロードをスキップすると、`snapshotExistingIds`
 *   だけが残り `diff.deletes` が既存 practice_logs を **全件 DELETE** する。
 *   [PTS-4] がこれを直接 pin する: 既存ログを2件持つチーム練習を管理者が編集して
 *   基本情報だけ変更 → `api.deletePracticeLog` が **0回** であることを件数厳密に見る。
 *
 * ■ 対照実験 (無いと「常に1タブ」の実装でも全 green で通る)
 *   [PTS-3] origin 無しなら練習/ログの2タブが従来どおり出る (SC-17 非退行)。
 *
 * ■ トートロジー防止
 *   - タブ一覧は `accessibilityRole="tab"` のテキストを **配列の厳密一致** で見る。
 *   - 「消えていない」は `toContain` ではなく **呼び出し件数 0** で見る。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeWithLogs } from "@apps/shared/types";

configure({ testIdAttribute: "testID" });

const mocks = vi.hoisted(() => {
  function makeSupabase() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { image_paths: [] }, error: null }),
          }),
        }),
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
  }

  return {
    routeParams: {
      practiceId: undefined as string | undefined,
      date: undefined as string | undefined,
      teamId: undefined as string | undefined,
      initialTab: undefined as "practice" | "log" | undefined,
      origin: undefined as "teamAdmin" | undefined,
    },
    navigate: vi.fn(),
    goBack: vi.fn(),
    popTo: vi.fn(),
    popToTop: vi.fn(),
    setOptions: vi.fn(),
    getAccessToken: vi.fn(),
    getTeamScopedPracticeById: vi.fn(),
    getUniquePlaces: vi.fn(),
    resolveGalleryImages: vi.fn(),
    uploadImagesViaApi: vi.fn(),
    deleteImagesViaApi: vi.fn(),
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    createLogMutateAsync: vi.fn(),
    updateLogMutateAsync: vi.fn(),
    deletePracticeLog: vi.fn(),
    replacePracticeTimes: vi.fn(),
    currentUserId: "user-1" as string,
    useTeamMembersQuery: vi.fn(),
    refetchTeamMembers: vi.fn(),
    useTeamMembersQueryCalls: [] as Array<string | undefined>,
    supabase: makeSupabase(),
  };
});

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn(() => ({ width: 375, height: 812 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Keyboard: { dismiss: vi.fn() },
    KeyboardAvoidingView: original.View,
    TextInput: ({
      onChangeText,
      value,
      editable,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      editable?: boolean;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    popTo: mocks.popTo,
    popToTop: mocks.popToTop,
    setOptions: mocks.setOptions,
    addListener: () => () => {},
  }),
  usePreventRemove: () => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    user: { id: mocks.currentUserId },
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: (_supabase: unknown, teamId: string | undefined) => {
    mocks.useTeamMembersQueryCalls.push(teamId);
    // 実物の useTeamMembersQuery は data/isLoading/**isError**/**refetch** を返す。
    // テストが明示しなかったフィールドは既定値 (正常系) で埋める。undefined のまま
    // 返すと D12 で追加された isError 分岐が「たまたま falsy」で通ってしまい、
    // 退行を検出できないテストになる (大会側で同じ修正をしたのと同じ理由)。
    return { isError: false, refetch: mocks.refetchTeamMembers, ...mocks.useTeamMembersQuery(teamId) };
  },
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: () => ({ data: [], isLoading: false }),
  usePracticeTagsQuery: () => ({ data: [], isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeMutation: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: mocks.createLogMutateAsync, isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: mocks.updateLogMutateAsync, isPending: false }),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({
    profile: null,
    teams: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({ syncPractice: vi.fn(), syncCompetition: vi.fn() }),
}));

vi.mock("@apps/shared/hooks/queries/practiceLogTemplates", () => ({
  usePracticeLogTemplatesQuery: () => ({ data: [], isLoading: false }),
  useUsePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    getPracticeById = vi.fn();
    getTeamScopedPracticeById = mocks.getTeamScopedPracticeById;
    getUniquePlaces = mocks.getUniquePlaces;
    // D10-(2) の核心。既存ログ削除の呼び出し件数を実測するため hoisted mock に紐付ける。
    deletePracticeLog = mocks.deletePracticeLog;
    replacePracticeTimes = mocks.replacePracticeTimes;
  },
}));

vi.mock("@/utils/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/imageUpload")>("@/utils/imageUpload");
  return {
    ...actual,
    resolveGalleryImages: mocks.resolveGalleryImages,
    uploadImagesViaApi: mocks.uploadImagesViaApi,
    deleteImagesViaApi: mocks.deleteImagesViaApi,
  };
});

vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

// ---------------------------------------------------------------------------
// fixture (互いに部分文字列関係にならない固有値)
// ---------------------------------------------------------------------------
const PRACTICE_ID = "practice-9901";
const TEAM_ID = "team-9902";
const ADMIN_VIEWER_ID = "roster-admin-9903";
const OWNER_ID = "roster-owner-9904";
const LOG_ID_A = "plog-9905-alpha";
const LOG_ID_B = "plog-9906-bravo";

const TAB_PRACTICE = "練習";
const TAB_LOG = "練習ログ";

const PRACTICE_TITLE = "タブ絞り込み検証チーム練習";
const PRACTICE_PLACE = "検証用長水路プール";
const PRACTICE_NOTE = "D9タブ絞り込み検証用備考";

function makePracticeFixture(logs: unknown[] = []): PracticeWithLogs {
  return {
    id: PRACTICE_ID,
    user_id: OWNER_ID,
    team_id: TEAM_ID,
    date: "2026-05-20",
    title: PRACTICE_TITLE,
    place: PRACTICE_PLACE,
    note: PRACTICE_NOTE,
    image_paths: [],
    created_at: "2026-05-20T00:00:00Z",
    updated_at: "2026-05-20T00:00:00Z",
    practice_logs: logs,
  } as unknown as PracticeWithLogs;
}

function makeLog(id: string, distance: number) {
  return {
    id,
    practice_id: PRACTICE_ID,
    style: "Fr",
    swim_category: "Swim",
    distance,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    note: "",
    video_path: null,
    video_thumbnail_path: null,
    practice_times: [],
    practice_log_tags: [],
  };
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * FormTabBar が描画したタブのラベルを表示順で返す。
 *
 * 【スコープに注意】`accessibilityRole="tab"` は画面下部の ItemTabs (「メニュー 1」等の
 * 項目サブタブ) にも付く。document 全体を querySelectorAll すると両者が混ざるため、
 * **最初のタブ要素の親 (= FormTabBar の tabList)** に限定して読む。
 * FormTabBar は画面最上部に描画されるので、最初のタブは必ず FormTabBar のもの。
 */
function tabLabels(): string[] {
  const first = document.querySelector('[accessibilityrole="tab"]');
  if (!first) return [];
  return Array.from(first.parentElement?.children ?? []).map((el) => el.textContent ?? "");
}

/**
 * DOM 全体の `accessibilityRole="tab"` 要素のラベル。
 * 練習タブのコンテンツには ItemTabs (メニュー項目サブタブ) が無いため、
 * origin="teamAdmin" のときここが空であること = タブバーが描画されていないこと。
 */
function allTabRoleLabels(): string[] {
  return Array.from(document.querySelectorAll('[accessibilityrole="tab"]')).map(
    (el) => el.textContent ?? "",
  );
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PracticeTabFormScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.routeParams.practiceId = PRACTICE_ID;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = undefined;
  mocks.routeParams.origin = undefined;
  mocks.currentUserId = ADMIN_VIEWER_ID;

  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.popTo.mockReset();
  mocks.popToTop.mockReset();
  mocks.setOptions.mockReset();
  mocks.useTeamMembersQueryCalls.length = 0;

  mocks.getTeamScopedPracticeById.mockReset().mockResolvedValue(makePracticeFixture([]));
  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.uploadImagesViaApi.mockReset().mockResolvedValue([]);
  mocks.deleteImagesViaApi.mockReset().mockResolvedValue(undefined);
  mocks.createMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.createLogMutateAsync.mockReset().mockResolvedValue({ id: "plog-new" });
  mocks.updateLogMutateAsync.mockReset().mockResolvedValue({});
  mocks.deletePracticeLog.mockReset().mockResolvedValue(undefined);
  mocks.replacePracticeTimes.mockReset().mockResolvedValue(undefined);
  mocks.useTeamMembersQuery.mockReset().mockReturnValue({
    data: [
      { user_id: ADMIN_VIEWER_ID, role: "admin" },
      { user_id: OWNER_ID, role: "user" },
    ],
    isLoading: false,
  });

  vi.mocked(Alert.alert).mockClear();
});

describe("PracticeTabFormScreen — チーム管理者ビューのタブ絞り込み (Sprint Contract v3 D9/D10/D11)", () => {
  describe("[SC-15 / BC-10] origin=teamAdmin ではタブバー非描画 + 保存して終了1ボタン", () => {
    it("[PTS-1 / v3 反転] タブバーが DOM に存在しない (タブ要素が1つも描画されない)", async () => {
      mocks.routeParams.origin = "teamAdmin";

      renderScreen();

      await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

      // v3/R14: タブが1本しかないならタブバー自体を出さない。
      // 「練習」というタブ要素が1件ある状態も NG。
      expect(allTabRoleLabels()).toEqual([]);
      // 練習タブのコンテンツ自体は描画される (タブバーを消しただけ)
      expect(screen.getByDisplayValue(PRACTICE_PLACE)).toBeTruthy();
    });

    it("[PTS-1b / BC-10] フッターが『保存して終了』1ボタンで、前後タブボタンが出ない", async () => {
      // タブバーの描画有無 (D11) とは独立した観測点。getTabNavAdjacency に渡す配列が
      // 1要素に絞られていないと「次に進む」が出る (D9 の片側だけ絞る罠)。
      mocks.routeParams.origin = "teamAdmin";

      renderScreen();

      await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

      expect(screen.queryByTestId("practice-tab-form-back")).toBeNull();
      expect(screen.queryByTestId("practice-tab-form-next")).toBeNull();
      expect(screen.getByTestId("practice-tab-form-save").textContent).toBe("保存して終了");
    });

    it("[PTS-2 / SC-16] origin=teamAdmin では initialTab='log' を渡されても練習タブが選択される", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.routeParams.initialTab = "log";

      renderScreen();

      await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

      // log タブのコンテンツ (メニュー項目サブタブ) が描画されていない = activeTab が "practice"。
      // タブバーが描画されないこと自体 (D11) は [PTS-1] が見る。ここで重ねて assert すると
      // SC-16 の検証が D11 の未実装に巻き込まれて実行されなくなる。
      expect(screen.queryByTestId("practicelog-item-tabs")).toBeNull();
      // 練習タブのコンテンツ (場所/メモ) は描画されている
      expect(screen.getByDisplayValue(PRACTICE_PLACE)).toBeTruthy();
    });

    it("[PTS-3 / 対照 SC-17] origin 無し (個人フロー): 練習/練習ログの2タブが従来どおり出て、次に進むボタンもある", async () => {
      mocks.routeParams.origin = undefined;

      renderScreen();

      await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

      expect(tabLabels()).toEqual([TAB_PRACTICE, TAB_LOG]);
      expect(screen.getByTestId("practice-tab-form-next")).toBeTruthy();
    });

    it("[PTS-3b / 対照 SC-17] origin 無し + initialTab='log': ログタブが選択され、log タブのコンテンツが出る", async () => {
      mocks.routeParams.origin = undefined;
      mocks.routeParams.initialTab = "log";

      renderScreen();

      await waitFor(() => expect(screen.getByTestId("practicelog-item-tabs")).toBeTruthy());

      expect(tabLabels()).toEqual([TAB_PRACTICE, TAB_LOG]);
    });
  });

  describe("[SC-18 / SC-19 / BC-9] 隠した log タブが保存を壊さない・既存ログを消さない", () => {
    it("[PTS-4] 既存ログ2件を持つチーム練習を管理者が編集 → 親 UPDATE は1回、practice_logs の DELETE/INSERT は0回で既存2件だけが書き戻される", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.getTeamScopedPracticeById.mockResolvedValue(
        makePracticeFixture([makeLog(LOG_ID_A, 100), makeLog(LOG_ID_B, 200)]),
      );

      renderScreen();

      const titleInput = (await screen.findByDisplayValue(PRACTICE_TITLE)) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: "PTS4基本情報のみ編集" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("practice-tab-form-save"));
        await flushAsync();
      });

      // SC-18: 隠したタブが原因で保存がブロックされていない
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
      const [arg] = mocks.updateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(arg.id).toBe(PRACTICE_ID);
      expect(arg.updates.title).toBe("PTS4基本情報のみ編集");

      // SC-19 / BC-9: 既存 practice_logs が1件も消えていない・増えていない
      expect(mocks.deletePracticeLog).toHaveBeenCalledTimes(0);
      expect(mocks.createLogMutateAsync).toHaveBeenCalledTimes(0);

      // 【QA 実測】log タブを隠しても menus はロードされたまま差分計算を通るため、
      // 既存ログは diff.updates に入り「同じ値で書き戻す」UPDATE が走る。
      // これは origin の有無に依らない練習フォームの既存挙動 (PTS-6 の対照で同値を確認)。
      // ここでは「対象が既存ログ2件ちょうどであり、別の行に波及していない」ことを
      // ID の集合一致で pin する (件数だけだと別 ID への誤書き込みを見逃す)。
      const updatedLogIds = mocks.updateLogMutateAsync.mock.calls.map(
        (call: unknown[]) => (call[0] as { id: string }).id,
      );
      expect([...updatedLogIds].sort()).toEqual([LOG_ID_A, LOG_ID_B].sort());
    });

    it("[PTS-5 / BC-9 後半] 既存ログが無いチーム練習を管理者が保存しても、空のデフォルトログ行が新規作成されない", async () => {
      mocks.routeParams.origin = "teamAdmin";
      mocks.getTeamScopedPracticeById.mockResolvedValue(makePracticeFixture([]));

      renderScreen();

      const titleInput = (await screen.findByDisplayValue(PRACTICE_TITLE)) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: "PTS5空ログのまま保存" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("practice-tab-form-save"));
        await flushAsync();
      });

      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
      expect(mocks.createLogMutateAsync).toHaveBeenCalledTimes(0);
      expect(mocks.deletePracticeLog).toHaveBeenCalledTimes(0);
    });

    it("[PTS-6 / 対照 SC-17] origin 無しでも既存ログは消えない (非退行。PTS-4 の差分が origin だけであることを示す)", async () => {
      mocks.routeParams.origin = undefined;
      mocks.getTeamScopedPracticeById.mockResolvedValue(
        makePracticeFixture([makeLog(LOG_ID_A, 100), makeLog(LOG_ID_B, 200)]),
      );

      renderScreen();

      await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

      await act(async () => {
        fireEvent.click(screen.getByTestId("practice-tab-form-save"));
        await flushAsync();
      });

      expect(mocks.deletePracticeLog).toHaveBeenCalledTimes(0);
      expect(mocks.createLogMutateAsync).toHaveBeenCalledTimes(0);
      // origin の有無で log 側の書き込み挙動が変わっていないこと (PTS-4 と同値)。
      // ここが PTS-4 と食い違ったら「タブを隠したこと」が log の書き込みを変えた証拠になる。
      const updatedLogIds = mocks.updateLogMutateAsync.mock.calls.map(
        (call: unknown[]) => (call[0] as { id: string }).id,
      );
      expect([...updatedLogIds].sort()).toEqual([LOG_ID_A, LOG_ID_B].sort());
    });

    it("[PTS-7 / 引数を捨てない検証] useTeamMembersQuery が practices.team_id で呼ばれる", async () => {
      mocks.routeParams.origin = "teamAdmin";

      renderScreen();

      await waitFor(() => expect(screen.getByDisplayValue(PRACTICE_TITLE)).toBeTruthy());

      expect(mocks.useTeamMembersQueryCalls).toContain(TEAM_ID);
      expect(
        mocks.useTeamMembersQueryCalls[mocks.useTeamMembersQueryCalls.length - 1],
      ).toBe(TEAM_ID);
    });
  });
});
