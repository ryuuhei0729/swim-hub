/**
 * CompetitionTabFormScreen.teamAdminTabScope.test.tsx
 *
 * Sprint Contract v3 — D5 / D10 / D11 の検証。SC-1 / SC-3 / SC-9 / SC-10 / SC-18 / SC-19,
 * BC-3 / BC-4 / BC-5 / BC-6 / BC-8。
 *
 * ■ v3 (R14 / D11) による反転
 *   タブが1本しかないときは **FormTabBar 自体を描画しない**。
 *   よって origin="teamAdmin" の期待値は「タブが厳密に1件」ではなく
 *   **「role=tab の要素が DOM に1つも無い」**。
 *   対照 (origin 無し) の「タブが2〜3件描画される」はそのまま維持する
 *   — これが無いと「常にタブバーを消す」実装が全 green で通る。
 *
 * ■ 検証の骨子 (R12 / D10-(4))
 *   「タブ絞り込みは origin **単独**」「編集権限は origin **AND** admin」という
 *   2つの別の導出であることを、対照実験でしか pin できない:
 *     [CTS-3]  origin あり + **非 admin** → それでもタブは1本   (絞り込みは admin に依存しない)
 *     [CTS-2c] **admin** + origin 無し    → タブは従来どおり複数 (絞り込みは origin にのみ依存)
 *   この2つが無いと「常に1タブ」の実装でも全て green で通ってしまう。
 *
 * ■ D10 の事故経路 (隠したタブが保存を壊す) の検証
 *   [CTS-6] 隠したタブが原因で保存がブロックされない (SC-18)
 *   [CTS-7] 隠したタブのデータが書き込まれない・消されない (SC-19)。
 *           対照として origin 無しなら同じブロックが実際に走ることも見る
 *           (「常にスキップ」の実装でも通るテストにしないため)。
 *
 * ■ トートロジー防止
 *   - タブ一覧は `accessibilityRole="tab"` を持つ要素のテキストを **配列の厳密一致**で見る
 *     (`toContain` は「余分なタブが無いこと」を検証できない)。
 *   - 保存系は mutateAsync / API の **呼び出し件数** を厳密に見る。
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, subDays } from "date-fns";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";

configure({ testIdAttribute: "testID" });

const h = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
  mockNavigate: vi.fn(),
  mockGoBack: vi.fn(),
  mockPopTo: vi.fn(),
  mockPopToTop: vi.fn(),
  mockSetOptions: vi.fn(),
  // navigation オブジェクトは hoisted 内で1度だけ生成し、以後同一参照を返す
  // (詳細は useNavigation モック直上のコメント)。vi.mock のファクトリは巻き上げ
  // られるため、module scope の const では初期化前アクセスになる。
  navigationObject: {} as Record<string, unknown>,
  mockUsePreventRemove: vi.fn(),
  preventRemoveArgs: [] as boolean[],
  mockUseAuth: vi.fn(),
  mockUseUserQuery: vi.fn(),
  mockUseBestTimesQuery: vi.fn(),
  mockCreateMutateAsync: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockCreateRecordMutateAsync: vi.fn(),
  mockUpdateRecordMutateAsync: vi.fn(),
  mockDeleteRecordMutateAsync: vi.fn(),
  mockReplaceSplitTimesMutateAsync: vi.fn(),
  mockEntryApiGetEntriesByCompetition: vi.fn(),
  mockEntryApiCreateTeamEntry: vi.fn(),
  mockEntryApiCreatePersonalEntry: vi.fn(),
  mockEntryApiUpdateEntry: vi.fn(),
  mockEntryApiDeleteEntry: vi.fn(),
  mockRecordApiGetRecords: vi.fn(),
  mockStyleApiGetStyles: vi.fn(),
  // 実物の useTeamMembersQuery は data/isLoading/**isError**/**refetch** を返す。
  // 各テストが明示しなかったフィールドは下のラッパーで「正常系の既定値」を埋める
  // (undefined のまま返すと画面側の isError 分岐が「たまたま falsy」で通り、
  //  High-1(a) で追加された ErrorView 経路の退行を検出できなくなる)。
  mockRefetchTeamMembers: vi.fn(),
  teamMembersQueryCalls: [] as Array<string | undefined>,
  mockUseTeamMembersQuery: vi.fn(),
}));

h.navigationObject = {
  navigate: h.mockNavigate,
  goBack: h.mockGoBack,
  popTo: h.mockPopTo,
  popToTop: h.mockPopToTop,
  setOptions: h.mockSetOptions,
};

vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("../../__mocks__/react-native")>(
    "../../__mocks__/react-native",
  );
  return {
    ...actual,
    KeyboardAvoidingView: ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
    TextInput: ({
      onChangeText,
      value,
      editable,
      testID,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      editable?: boolean;
      testID?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        ...(typeof testID === "string" ? { testID } : {}),
        value,
        disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

// 【重要】useNavigation は **安定した同一オブジェクト** を返すこと。
// 実物の react-navigation の useNavigation はスクリーンごとに memo 化された
// navigation オブジェクトを返す (再レンダーのたびに参照が変わらない)。
// ここで毎回新しいオブジェクトリテラルを返すと、
// `useEffect(..., [isSaved, navigation, teamId])` (保存後の戻り先 effect) の依存が
// 毎レンダー変化し、isSaved=true 以降レンダーのたびに popTo が再発火する。
// その結果「ちょうど1回」の assert が、テストがいつ値を読むかに依存して
// 1 にも 2 にもなる (= 偽陰性/偽陽性の温床)。
vi.mock("@react-navigation/native", () => ({
  useRoute: h.mockUseRoute,
  useNavigation: () => h.navigationObject,
  // preventRemove の第1引数 (破棄確認を張るか) を記録する。BC-6 の観測点。
  usePreventRemove: (preventRemove: boolean, cb: unknown) => {
    h.preventRemoveArgs.push(preventRemove);
    return h.mockUsePreventRemove(preventRemove, cb);
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: h.mockUseAuth }));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: (_supabase: unknown, teamId: string | undefined) => {
    h.teamMembersQueryCalls.push(teamId);
    return { isError: false, refetch: h.mockRefetchTeamMembers, ...h.mockUseTeamMembersQuery(teamId) };
  },
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useCreateCompetitionMutation: () => ({ mutateAsync: h.mockCreateMutateAsync }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: h.mockUpdateMutateAsync }),
  useCreateRecordMutation: () => ({ mutateAsync: h.mockCreateRecordMutateAsync }),
  useUpdateRecordMutation: () => ({ mutateAsync: h.mockUpdateRecordMutateAsync }),
  useDeleteRecordMutation: () => ({ mutateAsync: h.mockDeleteRecordMutateAsync }),
  useReplaceSplitTimesMutation: () => ({ mutateAsync: h.mockReplaceSplitTimesMutateAsync }),
  useBestTimesQuery: h.mockUseBestTimesQuery,
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({ useUserQuery: h.mockUseUserQuery }));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: h.mockEntryApiGetEntriesByCompetition,
    createTeamEntry: h.mockEntryApiCreateTeamEntry,
    createPersonalEntry: h.mockEntryApiCreatePersonalEntry,
    updateEntry: h.mockEntryApiUpdateEntry,
    deleteEntry: h.mockEntryApiDeleteEntry,
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({ getRecords: h.mockRecordApiGetRecords })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({ getStyles: h.mockStyleApiGetStyles })),
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({ syncCompetition: vi.fn() }),
}));

vi.mock("@/components/layout/LoadingSpinner", () => ({
  LoadingSpinner: () => React.createElement("div", { testID: "loading-spinner" }),
}));
vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/TimeInputHelp", () => ({ TimeInputHelp: () => null }));
vi.mock("@/components/ui/WaPointsInfoTooltip", () => ({ WaPointsInfoTooltip: () => null }));
vi.mock("@/components/records", () => ({
  LapTimeDisplay: () => null,
  getBestTimeForEntry: () => null,
}));
vi.mock("@/components/forms/StyleChipSelector", () => ({ StyleChipSelector: () => null }));

vi.mock("@/utils/imageUpload", () => ({
  uploadImagesViaApi: vi.fn(async () => []),
  deleteImages: vi.fn(async () => {}),
  resolveGalleryImages: vi.fn(async () => []),
  mergeImagePaths: vi.fn((saved: string[]) => saved),
}));
vi.mock("@/utils/videoUpload", () => ({ uploadVideo: vi.fn(async () => {}) }));

import { Alert } from "react-native";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

// ---------------------------------------------------------------------------
// fixture
// ---------------------------------------------------------------------------
const COMPETITION_ID = "comp-8901";
const TEAM_ID = "team-8902";
const ADMIN_VIEWER_ID = "roster-admin-8903";
const GENERAL_VIEWER_ID = "roster-general-8904";
const OWNER_ID = "roster-owner-8905";
const EXISTING_ENTRY_ID = "entry-8906";
const EXISTING_RECORD_ID = "record-8907";

const NOW = new Date();
const TODAY = format(NOW, "yyyy-MM-dd");
const FUTURE = format(addDays(NOW, 7), "yyyy-MM-dd");
const PAST = format(subDays(NOW, 7), "yyyy-MM-dd");

const STYLE_A = { id: 1, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };

const TAB_COMPETITION = "大会";
const TAB_ENTRY = "エントリー";
const TAB_RECORD = "レースレコード";

interface CompetitionRow {
  id: string;
  date: string;
  end_date: string | null;
  title: string | null;
  place: string | null;
  pool_type: number;
  note: string | null;
  image_paths: string[];
  team_id: string | null;
  user_id: string;
}

function makeCompetitionRow(overrides: Partial<CompetitionRow> = {}): CompetitionRow {
  return {
    id: COMPETITION_ID,
    date: TODAY,
    end_date: null,
    title: "タブ絞り込み検証大会",
    place: "検証用アリーナ",
    pool_type: 1,
    note: "タブ絞り込み検証用備考",
    image_paths: [],
    team_id: TEAM_ID,
    user_id: OWNER_ID,
    ...overrides,
  };
}

function makeSupabase(row: CompetitionRow, currentUserId: string): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: currentUserId } }, error: null })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => {
            if (table === "competitions" && cols === "*") return { data: row, error: null };
            if (table === "competitions" && cols === "pool_type") {
              return { data: { pool_type: row.pool_type }, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

interface RenderOptions {
  origin?: "teamAdmin";
  currentUserId?: string;
  members?: Array<{ user_id: string; role: string }>;
  row?: CompetitionRow;
  /** 未指定なら編集モード (row.id)。null を渡すと新規作成モード */
  competitionId?: string | null;
  routeTeamId?: string;
  initialTab?: "competition" | "entry" | "record";
  date?: string;
}

function renderScreen(opts: RenderOptions = {}) {
  const row = opts.row ?? makeCompetitionRow();
  const currentUserId = opts.currentUserId ?? ADMIN_VIEWER_ID;
  const isCreate = opts.competitionId === null;

  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(row, currentUserId),
    user: { id: currentUserId },
    subscription: null,
    getAccessToken: vi.fn(async () => "test-access-token"),
  });
  h.mockUseRoute.mockReturnValue({
    params: {
      ...(isCreate ? {} : { competitionId: opts.competitionId ?? row.id }),
      date: opts.date ?? row.date,
      ...(opts.routeTeamId !== undefined ? { teamId: opts.routeTeamId } : {}),
      ...(opts.initialTab ? { initialTab: opts.initialTab } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
  });
  h.mockUseTeamMembersQuery.mockReturnValue({
    data: opts.members ?? [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
    isLoading: false,
  });

  const Wrapper = createQueryWrapper();
  return render(<CompetitionTabFormScreen />, { wrapper: Wrapper });
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
 * D11 (タブバー非描画) の検証は「FormTabBar が無い」だけでなく
 * 「タブとして描画された要素が画面のどこにも無い」ことまで見る。
 * 大会タブのコンテンツには ItemTabs が無いため、ここが空 = タブバー非描画。
 */
function allTabRoleLabels(): string[] {
  return Array.from(document.querySelectorAll('[accessibilityrole="tab"]')).map(
    (el) => el.textContent ?? "",
  );
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.preventRemoveArgs.length = 0;

  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseBestTimesQuery.mockReturnValue({ data: [] });
  h.mockUsePreventRemove.mockImplementation(() => {});
  h.mockStyleApiGetStyles.mockResolvedValue([STYLE_A]);
  h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]);
  h.mockRecordApiGetRecords.mockResolvedValue([]);
  h.mockCreateMutateAsync.mockResolvedValue({ id: "created-8908" });
  h.mockUpdateMutateAsync.mockResolvedValue({ id: COMPETITION_ID });
  h.mockCreateRecordMutateAsync.mockResolvedValue({ id: "rec-8909" });
  h.mockUpdateRecordMutateAsync.mockResolvedValue({});
  h.mockDeleteRecordMutateAsync.mockResolvedValue(undefined);
  h.mockReplaceSplitTimesMutateAsync.mockResolvedValue(undefined);
  h.mockEntryApiCreateTeamEntry.mockResolvedValue({ id: "e-new" });
  h.mockEntryApiCreatePersonalEntry.mockResolvedValue({ id: "e-new" });
  h.mockEntryApiUpdateEntry.mockResolvedValue({});
  h.mockEntryApiDeleteEntry.mockResolvedValue(undefined);
  vi.mocked(Alert.alert).mockClear();
});

describe("CompetitionTabFormScreen — チーム管理者ビューのタブ絞り込み (Sprint Contract v3 D5/D10/D11)", () => {
  describe("[SC-1 / SC-3] origin=teamAdmin ではタブバー非描画 + 保存して終了1ボタン", () => {
    it("[CTS-1 / v3 反転] タブバーが DOM に存在しない (タブ要素が1つも描画されない)", async () => {
      renderScreen({ origin: "teamAdmin" });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      // v3/R14: タブが1本しかないならタブバー自体を出さない。
      // 「大会」というタブ要素が1件ある状態も NG。
      expect(allTabRoleLabels()).toEqual([]);
      // 大会タブのコンテンツ自体は描画されている (タブバーを消しただけで中身は出る)
      expect(screen.getByDisplayValue("タブ絞り込み検証大会")).toBeTruthy();
    });

    it("[CTS-2] フッターが『保存して終了』1ボタンで、前後タブボタンも旧画面の4文言も存在しない (SC-3)", async () => {
      renderScreen({ origin: "teamAdmin" });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      // 前後タブボタンが無い (getTabNavAdjacency が prev/next とも undefined)
      expect(screen.queryByTestId("competition-tab-form-back")).toBeNull();
      expect(screen.queryByTestId("competition-tab-form-next")).toBeNull();
      expect(screen.getByTestId("competition-tab-form-save").textContent).toBe("保存して終了");

      // 旧 CompetitionBasicFormScreen の4文言が画面から消えている (R7)
      for (const label of ["キャンセル", "保存", "続けてエントリーを作成", "続けて記録を入力"]) {
        expect(screen.queryAllByText(label), `「${label}」が画面に残っている`).toHaveLength(0);
      }
    });

    it("[CTS-2c / 対照 R12②] admin だが origin 無し: タブは従来どおり複数本のまま (絞り込みは origin にのみ依存)", async () => {
      renderScreen({ currentUserId: ADMIN_VIEWER_ID });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      // 当日 (TODAY) なのでエントリータブは出ず、大会 + レースレコードの2本
      expect(tabLabels()).toEqual([TAB_COMPETITION, TAB_RECORD]);
    });

    it("[CTS-3 / R12①] origin=teamAdmin + 非 admin でもタブバーは出ない (絞り込みは admin 判定に依存しない)", async () => {
      renderScreen({
        origin: "teamAdmin",
        currentUserId: GENERAL_VIEWER_ID,
        members: [
          { user_id: GENERAL_VIEWER_ID, role: "user" },
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
        ],
      });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      expect(allTabRoleLabels()).toEqual([]);
      // 権限判定の方は落ちている (2つの導出が別物であることの確認)
      expect(screen.getByText("この大会の情報はチーム管理者のみ編集できます")).toBeTruthy();
    });
  });

  describe("[BC-3 / BC-4] 日付に関わらずタブバーが出ない (日付由来の表示制御を上書きする)", () => {
    it("[CTS-4] 未来日のチーム大会でもタブバーが出ない (エントリータブも現れない)", async () => {
      const futureRow = makeCompetitionRow({ date: FUTURE });
      renderScreen({ origin: "teamAdmin", row: futureRow, date: FUTURE });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());
      expect(allTabRoleLabels()).toEqual([]);
    });

    it("[CTS-4c / 対照] 未来日 + origin 無し: エントリータブが実際に出る", async () => {
      const futureRow = makeCompetitionRow({ date: FUTURE });
      renderScreen({ row: futureRow, date: FUTURE });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());
      expect(tabLabels()).toEqual([TAB_COMPETITION, TAB_ENTRY, TAB_RECORD]);
    });

    it("[CTS-5] 過去日のチーム大会でもタブバーが出ない (レースレコードタブも現れない)", async () => {
      const pastRow = makeCompetitionRow({ date: PAST });
      renderScreen({ origin: "teamAdmin", row: pastRow, date: PAST });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());
      expect(allTabRoleLabels()).toEqual([]);
    });

    it("[CTS-5c / 対照] 過去日 + origin 無し: レースレコードタブが実際に出る", async () => {
      const pastRow = makeCompetitionRow({ date: PAST });
      renderScreen({ row: pastRow, date: PAST });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());
      expect(tabLabels()).toEqual([TAB_COMPETITION, TAB_RECORD]);
    });

    it("[CTS-5b / D10-(3)] origin=teamAdmin では initialTab='entry' を渡されても大会タブが選択状態になる", async () => {
      const futureRow = makeCompetitionRow({ date: FUTURE });
      renderScreen({
        origin: "teamAdmin",
        row: futureRow,
        date: FUTURE,
        initialTab: "entry",
      });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      // 大会タブのコンテンツ (大会名入力欄) が描画されている = activeTab が "competition"。
      // タブバーが描画されないこと自体 (D11) は [CTS-1]/[CTS-3]/[CTS-4]/[CTS-5] が見る。
      // ここで重ねて assert すると D10-(3) の検証が D11 の未実装に巻き込まれて
      // 実行されなくなるため、観測点を意図的に分離している。
      expect(screen.getByDisplayValue("タブ絞り込み検証大会")).toBeTruthy();
      // エントリータブのコンテンツ (エントリー用の見出し) が描画されていないこと
      expect(screen.queryByTestId("competition-tab-form-next")).toBeNull();
    });
  });

  describe("[SC-18 / SC-19] 隠したタブが保存を壊さない・隠したタブのデータに触れない", () => {
    it("[CTS-6] 管理者が基本情報だけ編集して『保存して終了』→ 大会 UPDATE がちょうど1回成立する", async () => {
      renderScreen({ origin: "teamAdmin" });

      const title = (await screen.findByDisplayValue("タブ絞り込み検証大会")) as HTMLInputElement;
      fireEvent.change(title, { target: { value: "CTS6基本情報のみ編集" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
      const [arg] = h.mockUpdateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(arg.updates.title).toBe("CTS6基本情報のみ編集");
      // [SC-10] 長水路 (1) が短水路 (0) に化けない
      expect(arg.updates.pool_type).toBe(1);
      // [SC-9] 編集時は team_id を送らない
      expect(Object.prototype.hasOwnProperty.call(arg.updates, "team_id")).toBe(false);
      // 保存がブロックされず、戻り先まで到達している
      expect(h.mockGoBack).toHaveBeenCalledTimes(1);
    });

    it("[CTS-7] 既存エントリー/レコードを持つチーム大会を管理者が保存しても、エントリー/レコードの書き込み・削除が0件", async () => {
      h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([
        {
          id: EXISTING_ENTRY_ID,
          user_id: ADMIN_VIEWER_ID,
          competition_id: COMPETITION_ID,
          style_id: STYLE_A.id,
          entry_time: 30.5,
          note: "",
          is_relaying: false,
        },
      ]);
      h.mockRecordApiGetRecords.mockResolvedValue([
        {
          id: EXISTING_RECORD_ID,
          user_id: ADMIN_VIEWER_ID,
          competition_id: COMPETITION_ID,
          style_id: STYLE_A.id,
          time: 31.2,
          note: "",
          is_relaying: false,
          split_times: [],
        },
      ]);

      renderScreen({ origin: "teamAdmin" });

      const title = (await screen.findByDisplayValue("タブ絞り込み検証大会")) as HTMLInputElement;
      fireEvent.change(title, { target: { value: "CTS7隠しタブ不干渉検証" } });

      // 初期ロード分の呼び出しを除外し、「保存中に起きたこと」だけを数える
      h.mockEntryApiGetEntriesByCompetition.mockClear();

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
      // エントリー保存ブロックがまるごとスキップされている
      expect(h.mockEntryApiGetEntriesByCompetition).toHaveBeenCalledTimes(0);
      expect(h.mockEntryApiCreateTeamEntry).toHaveBeenCalledTimes(0);
      expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(0);
      expect(h.mockEntryApiUpdateEntry).toHaveBeenCalledTimes(0);
      expect(h.mockEntryApiDeleteEntry).toHaveBeenCalledTimes(0);
      // レコード保存ブロックもまるごとスキップされている
      expect(h.mockCreateRecordMutateAsync).toHaveBeenCalledTimes(0);
      expect(h.mockUpdateRecordMutateAsync).toHaveBeenCalledTimes(0);
      expect(h.mockDeleteRecordMutateAsync).toHaveBeenCalledTimes(0);
      expect(h.mockReplaceSplitTimesMutateAsync).toHaveBeenCalledTimes(0);
    });

    it("[CTS-7c / 対照] origin 無し (個人フロー) で同じ大会を保存すると、レコード保存ブロックは実際に走る", async () => {
      // 「常にスキップ」の実装でも CTS-7 は通ってしまうため、スキップが
      // origin 由来であることを対照で示す。
      h.mockRecordApiGetRecords.mockResolvedValue([
        {
          id: EXISTING_RECORD_ID,
          user_id: ADMIN_VIEWER_ID,
          competition_id: COMPETITION_ID,
          style_id: STYLE_A.id,
          time: 31.2,
          note: "",
          is_relaying: false,
          split_times: [],
        },
      ]);

      renderScreen({ currentUserId: ADMIN_VIEWER_ID });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      // origin 無しなのでレコードタブが表示されており、既存レコードの差分計算が走る。
      // (基本情報は編集不可なので UPDATE は0回だが、レコード側の処理には入る)
      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
      const recordWrites =
        h.mockCreateRecordMutateAsync.mock.calls.length +
        h.mockUpdateRecordMutateAsync.mock.calls.length +
        h.mockDeleteRecordMutateAsync.mock.calls.length +
        h.mockReplaceSplitTimesMutateAsync.mock.calls.length;
      expect(
        recordWrites,
        "origin 無しでもレコード保存ブロックが一切走っていない (CTS-7 のスキップが origin 由来だと示せない)",
      ).toBeGreaterThan(0);
    });

    it("[CTS-8 / SC-9 新規作成側] origin=teamAdmin の新規作成では team_id 付きで INSERT され、エントリー/レコードは作られない", async () => {
      renderScreen({ competitionId: null, origin: "teamAdmin", routeTeamId: TEAM_ID, date: TODAY });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockCreateMutateAsync).toHaveBeenCalledTimes(1);
      const [formData] = h.mockCreateMutateAsync.mock.calls[0] as [Record<string, unknown>];
      expect(formData.team_id).toBe(TEAM_ID);
      expect(formData.date).toBe(TODAY);
      expect(h.mockEntryApiCreateTeamEntry).toHaveBeenCalledTimes(0);
      expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(0);
      expect(h.mockCreateRecordMutateAsync).toHaveBeenCalledTimes(0);
    });
  });

  describe("[BC-5 / BC-6 / BC-8] 境界と異常系", () => {
    it("[CTS-9 / BC-5] teamId が空文字 '': 保存後 goBack がちょうど1回、popTo/popToTop は0回", async () => {
      renderScreen({ origin: "teamAdmin", routeTeamId: "" });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockGoBack).toHaveBeenCalledTimes(1);
      expect(h.mockPopTo).toHaveBeenCalledTimes(0);
      expect(h.mockPopToTop).toHaveBeenCalledTimes(0);
    });

    it("[CTS-9b / 非退行] teamId あり: 保存後 popTo('TeamDetail', {...}) がちょうど1回、goBack/popToTop は0回", async () => {
      renderScreen({ origin: "teamAdmin", routeTeamId: TEAM_ID });

      await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockPopTo).toHaveBeenCalledTimes(1);
      expect(h.mockPopTo).toHaveBeenCalledWith("TeamDetail", {
        teamId: TEAM_ID,
        initialTab: "competitions",
      });
      expect(h.mockGoBack).toHaveBeenCalledTimes(0);
      expect(h.mockPopToTop).toHaveBeenCalledTimes(0);
    });

    it("[CTS-10 / BC-6] 入力を変更すると usePreventRemove が true で呼ばれる (破棄確認が有効なまま。R6)", async () => {
      renderScreen({ origin: "teamAdmin" });

      const title = (await screen.findByDisplayValue("タブ絞り込み検証大会")) as HTMLInputElement;
      // 変更前は破棄確認を張っていない
      expect(h.preventRemoveArgs.every((v) => v === false)).toBe(true);

      fireEvent.change(title, { target: { value: "CTS10未保存の変更" } });

      await waitFor(() => {
        expect(h.preventRemoveArgs[h.preventRemoveArgs.length - 1]).toBe(true);
      });
    });

    it("[CTS-11 / BC-8] 保存が失敗したとき、空でないエラーメッセージが画面のエラーバナーに出る", async () => {
      h.mockUpdateMutateAsync.mockRejectedValueOnce(new Error("ネットワークに接続できません"));

      renderScreen({ origin: "teamAdmin" });

      const title = (await screen.findByDisplayValue("タブ絞り込み検証大会")) as HTMLInputElement;
      fireEvent.change(title, { target: { value: "CTS11失敗させる編集" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      // errorBanner は #FEE2E2 背景の View。中のテキストが空文字でないことを見る。
      const banner = Array.from(document.querySelectorAll("div")).find(
        (el) => (el as HTMLElement).style.backgroundColor === "rgb(254, 226, 226)",
      );
      expect(banner, "保存失敗時にエラーバナーが描画されていない").toBeTruthy();
      expect((banner as HTMLElement).textContent?.trim().length ?? 0).toBeGreaterThan(0);
      // 画面は閉じない (戻り先へ遷移しない)
      expect(h.mockGoBack).toHaveBeenCalledTimes(0);
      expect(h.mockPopTo).toHaveBeenCalledTimes(0);
    });
  });
});
