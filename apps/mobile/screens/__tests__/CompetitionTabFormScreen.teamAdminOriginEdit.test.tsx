/**
 * CompetitionTabFormScreen.teamAdminOriginEdit.test.tsx
 *
 * Sprint Contract v3 — D4 (権限判定) の検証。SC-4 / SC-5 / SC-6 / SC-7。
 *
 * ■ 実装 (Developer 実装分。QA は実装コードを読まずに Contract から書き、
 *   観測点の実在だけを実測で確かめている)
 *     canEditCompetitionDetails:
 *       !isEditMode                                         → true
 *       !competitionTeamId                                  → true
 *       origin === "teamAdmin" && isCurrentUserCompetitionTeamAdmin → true
 *       それ以外                                            → false
 *     isResolvingCompetitionPermission =
 *       origin === "teamAdmin" && isEditMode && !!competitionTeamId && isTeamMembersLoading
 *
 * ■ PM 裁定2 (Phase B ブリーフ)
 *   `isResolvingCompetitionPermission` は **4条件の AND**。origin を渡さない fixture では
 *   ガードが発火しないのが**仕様**であり、「ガードが無い」ではない。
 *   → [CTAO-7/8] は4条件を揃えた fixture で検証し、
 *     [CTAO-11] に「origin 無し + メンバー取得中 → フォームと制限バナーが即出る」対照を置く。
 *
 * ■ モック設計
 *   CompetitionTabFormScreen.autoMergeAndReturnTarget.test.tsx の構成を土台に、
 *   PracticeTabFormScreen.teamAdminOriginEdit.test.tsx から以下を移植する:
 *     - TextInput の `editable={false}` → DOM の `disabled` 変換
 *       (これをしないと `.disabled` の assert が常に false になり、述語がどう壊れても
 *        検出できないテストになる)
 *     - `useTeamMembersQuery` を**引数を捨てないラッパー**でモックし、実際に渡された
 *       teamId を記録する (feedback_swimhub_test_mock_discards_query_args)
 *
 * ■ トートロジー防止
 *   - 「保存できた」ではなく `updateCompetitionMutation.mutateAsync` の**呼び出し回数と実引数**を見る。
 *   - 非 admin 系は 0 回を件数厳密に assert する (無言スキップの検出)。
 *   - fixture の id は互いに部分文字列関係にならない固有値にする。
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  mockUseTeamMembersQuery: vi.fn(),
  teamMembersQueryCalls: [] as Array<string | undefined>,
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
    // RN の `editable={false}` は実機で入力不可を意味するが、jsdom の <input> には
    // 対応する属性が無い。ここで DOM の `disabled` へ変換しないと
    // `.disabled` の assert が常に false になり、canEditCompetitionDetails の述語が
    // どう壊れても赤くならないテストになる。
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
  usePreventRemove: h.mockUsePreventRemove,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: h.mockUseAuth,
}));

// 引数を捨てないラッパー: canEditCompetitionDetails が正しい competitionTeamId
// (competitions.team_id) で useTeamMembersQuery を呼んでいることを実測できるようにする。
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

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: h.mockUseUserQuery,
}));

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

// disabled フラグを DOM 属性として観測可能にする素通しスタブ。
function TestFlag(props: { testID: string; "data-disabled": string }) {
  return React.createElement("span", props);
}

vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({ disabled }: { disabled?: boolean }) => (
    <TestFlag testID="image-uploader-disabled-flag" data-disabled={String(!!disabled)} />
  ),
}));
vi.mock("@/components/ui/DatePickerField", () => ({
  DatePickerField: ({ disabled }: { disabled?: boolean }) => (
    <TestFlag testID="date-picker-disabled-flag" data-disabled={String(!!disabled)} />
  ),
}));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/TimeInputHelp", () => ({ TimeInputHelp: () => null }));
vi.mock("@/components/ui/WaPointsInfoTooltip", () => ({ WaPointsInfoTooltip: () => null }));
vi.mock("@/components/records", () => ({
  LapTimeDisplay: () => null,
  getBestTimeForEntry: () => null,
}));
vi.mock("@/components/forms/StyleChipSelector", () => ({
  StyleChipSelector: () => null,
}));

vi.mock("@/utils/imageUpload", () => ({
  uploadImagesViaApi: vi.fn(async () => []),
  deleteImages: vi.fn(async () => {}),
  resolveGalleryImages: vi.fn(async () => []),
  mergeImagePaths: vi.fn((saved: string[]) => saved),
}));

vi.mock("@/utils/videoUpload", () => ({ uploadVideo: vi.fn(async () => {}) }));

import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

// ---------------------------------------------------------------------------
// fixture (互いに部分文字列関係にならない固有値)
// ---------------------------------------------------------------------------
const COMPETITION_ID = "comp-8801";
const TEAM_ID = "team-8802";
const ADMIN_VIEWER_ID = "roster-admin-8803";
const GENERAL_VIEWER_ID = "roster-general-8804";
const OWNER_ID = "roster-owner-8805";

const EDIT_RESTRICTED_MESSAGE = "この大会の情報はチーム管理者のみ編集できます";

const STYLE_A = { id: 1, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };

const TODAY = new Date().toISOString().slice(0, 10);

const competitionFixture = {
  id: COMPETITION_ID,
  date: TODAY,
  end_date: null as string | null,
  title: "管理者ビュー鉛筆編集検証大会",
  place: "検証用アクアティクスセンター",
  pool_type: 1,
  note: "origin付き編集導線の確認用備考",
  image_paths: [] as string[],
  team_id: TEAM_ID as string | null,
  user_id: OWNER_ID,
};

function makeSupabase(row: typeof competitionFixture, currentUserId: string): SupabaseClient {
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
  membersLoading?: boolean;
  /** useTeamMembersQuery が isError=true を返す (High-1(a) の経路) */
  membersError?: boolean;
  competitionOverrides?: Partial<typeof competitionFixture>;
  routeTeamId?: string;
  /** true で新規作成モード (route params から competitionId を落とす) */
  createMode?: boolean;
}

/**
 * useTeamMembersQuery は素の vi.fn() なので mockReturnValue を差し替えても React が
 * 自発的に再レンダーしない。isLoading 解決後の再評価を確認するケース ([CTAO-9]) の
 * ために、Host 自身に強制再レンダー用の useReducer を持たせて外から dispatch する。
 */
function renderScreen(opts: RenderOptions = {}) {
  const row = { ...competitionFixture, ...(opts.competitionOverrides ?? {}) };
  const currentUserId = opts.currentUserId ?? ADMIN_VIEWER_ID;

  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(row, currentUserId),
    user: { id: currentUserId },
    subscription: null,
    getAccessToken: vi.fn(async () => "test-access-token"),
  });
  h.mockUseRoute.mockReturnValue({
    params: {
      ...(opts.createMode ? {} : { competitionId: row.id }),
      date: row.date,
      // 新規作成モードでは competitionTeamId の初期値が route の teamId になるため、
      // 明示されていなければ fixture の team_id を渡して「チーム大会の新規作成」を作る。
      ...(opts.routeTeamId !== undefined
        ? { teamId: opts.routeTeamId }
        : opts.createMode && row.team_id
          ? { teamId: row.team_id }
          : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
  });
  h.mockUseTeamMembersQuery.mockReturnValue({
    data: opts.membersLoading || opts.membersError ? undefined : (opts.members ?? []),
    isLoading: !!opts.membersLoading,
    isError: !!opts.membersError,
  });

  let forceUpdate: (() => void) | null = null;
  function Host() {
    const [, bump] = React.useReducer((c: number) => c + 1, 0);
    React.useEffect(() => {
      forceUpdate = bump;
      return () => {
        forceUpdate = null;
      };
    }, []);
    return <CompetitionTabFormScreen />;
  }

  const Wrapper = createQueryWrapper();
  const result = render(<Host />, { wrapper: Wrapper });
  return {
    ...result,
    forceRerender: () => {
      if (!forceUpdate) throw new Error("Host is not mounted (forceUpdate unavailable)");
      act(() => {
        forceUpdate!();
      });
    },
  };
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** 大会名入力欄 (value が fixture の title) */
function titleInput(): HTMLInputElement {
  return screen.getByDisplayValue(competitionFixture.title) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.teamMembersQueryCalls.length = 0;

  h.mockRefetchTeamMembers.mockReset().mockResolvedValue(undefined);
  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseBestTimesQuery.mockReturnValue({ data: [] });
  h.mockUsePreventRemove.mockImplementation(() => {});
  h.mockStyleApiGetStyles.mockResolvedValue([STYLE_A]);
  h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]);
  h.mockRecordApiGetRecords.mockResolvedValue([]);
  h.mockCreateMutateAsync.mockResolvedValue({ id: "created-8806" });
  h.mockUpdateMutateAsync.mockResolvedValue({ id: COMPETITION_ID });
  h.mockCreateRecordMutateAsync.mockResolvedValue({ id: "rec-8807" });
  h.mockUpdateRecordMutateAsync.mockResolvedValue({});
  h.mockDeleteRecordMutateAsync.mockResolvedValue(undefined);
  h.mockReplaceSplitTimesMutateAsync.mockResolvedValue(undefined);
});

describe("CompetitionTabFormScreen — origin=teamAdmin による大会基本情報の編集許可 (Sprint Contract v3 D4)", () => {
  describe("[SC-4] admin かつ origin=teamAdmin: 全フィールドが編集可能・バナー非表示", () => {
    it("[CTAO-1/2/3] 大会名/場所/メモが disabled でなく、日付・画像も disabled=false、制限バナーも出ない", async () => {
      renderScreen({
        origin: "teamAdmin",
        currentUserId: ADMIN_VIEWER_ID,
        members: [
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
          { user_id: OWNER_ID, role: "user" },
        ],
      });

      await waitFor(() => expect(titleInput()).toBeTruthy());

      // [CTAO-1] テキスト入力3つ (大会名/場所/メモ) が編集可能
      expect(titleInput().disabled).toBe(false);
      expect((screen.getByDisplayValue(competitionFixture.place) as HTMLInputElement).disabled).toBe(
        false,
      );
      expect((screen.getByDisplayValue(competitionFixture.note) as HTMLInputElement).disabled).toBe(
        false,
      );

      // [CTAO-2] 制限バナーが出ない
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      // [CTAO-3] DatePickerField (開始日/終了日の2つ) と ImageUploader が disabled=false。
      // 開始日だけを見ると終了日側の disabled 配線ミスを見逃すため、件数も固定する。
      const datePickerFlags = screen.getAllByTestId("date-picker-disabled-flag");
      expect(datePickerFlags).toHaveLength(2);
      expect(datePickerFlags.map((el) => el.getAttribute("data-disabled"))).toEqual([
        "false",
        "false",
      ]);
      expect(screen.getByTestId("image-uploader-disabled-flag").getAttribute("data-disabled")).toBe(
        "false",
      );
    });
  });

  describe("[SC-6] origin=teamAdmin でも実 admin でなければ編集不可 (UI が RLS より広がらない)", () => {
    it("[CTAO-4] origin=teamAdmin + 一般メンバー: フィールドは disabled、バナー表示、保存しても UPDATE は0回", async () => {
      renderScreen({
        origin: "teamAdmin",
        currentUserId: GENERAL_VIEWER_ID,
        members: [
          { user_id: GENERAL_VIEWER_ID, role: "user" },
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
        ],
      });

      await waitFor(() => expect(titleInput()).toBeTruthy());

      expect(titleInput().disabled).toBe(true);
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });
      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
      expect(h.mockCreateMutateAsync).toHaveBeenCalledTimes(0);
    });

    it("[CTAO-5] origin=teamAdmin + 作成者本人 (owner) だが admin ではない: 依然として編集不可 (owner 判定を使わない)", async () => {
      renderScreen({
        origin: "teamAdmin",
        currentUserId: OWNER_ID,
        members: [
          { user_id: OWNER_ID, role: "user" },
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
        ],
      });

      await waitFor(() => expect(titleInput()).toBeTruthy());

      expect(titleInput().disabled).toBe(true);
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
    });
  });

  describe("[SC-5] 対照: admin でも origin が無ければ編集不可 (ダッシュボード/カレンダー経由)", () => {
    it("[CTAO-6] admin だが origin 未指定: フィールドは disabled のまま、バナーが出て UPDATE も0回", async () => {
      renderScreen({
        currentUserId: ADMIN_VIEWER_ID,
        members: [
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
          { user_id: OWNER_ID, role: "user" },
        ],
      });

      await waitFor(() => expect(titleInput()).toBeTruthy());

      expect(titleInput().disabled).toBe(true);
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });
      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
    });
  });

  describe("[SC-7] 権限解決中は画面全体がローディング (4条件 AND の fixture)", () => {
    it("[CTAO-7/8] origin=teamAdmin + 編集モード + team_id あり + isLoading=true: フォームもバナーも保存ボタンも DOM に存在しない", async () => {
      renderScreen({
        origin: "teamAdmin",
        currentUserId: ADMIN_VIEWER_ID,
        membersLoading: true,
      });

      // 既存データ取得 (competitionTeamId の設定) が終わるまで待つ
      await waitFor(() => expect(h.teamMembersQueryCalls).toContain(TEAM_ID));
      await act(async () => {
        await flushAsync();
      });

      // [CTAO-7] フォーム本体が描画されていない = 画面全体がローディング表示
      expect(screen.queryByDisplayValue(competitionFixture.title)).toBeNull();
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
      // [CTAO-8] 保存ボタン自体が存在しない = 権限未確定のまま保存できない
      expect(screen.queryByTestId("competition-tab-form-save")).toBeNull();
      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
    });

    it("[CTAO-9] isLoading が false に解決した後、admin+origin=teamAdmin なら編集可能になり保存できる", async () => {
      const { forceRerender } = renderScreen({
        origin: "teamAdmin",
        currentUserId: ADMIN_VIEWER_ID,
        membersLoading: true,
      });

      await waitFor(() => expect(h.teamMembersQueryCalls).toContain(TEAM_ID));
      await act(async () => {
        await flushAsync();
      });
      expect(screen.queryByDisplayValue(competitionFixture.title)).toBeNull();

      h.mockUseTeamMembersQuery.mockReturnValue({
        data: [
          { user_id: ADMIN_VIEWER_ID, role: "admin" },
          { user_id: OWNER_ID, role: "user" },
        ],
        isLoading: false,
      });
      forceRerender();

      await waitFor(() => expect(screen.getByDisplayValue(competitionFixture.title)).toBeTruthy(), {
        timeout: 5000,
      });
      expect(titleInput().disabled).toBe(false);
      expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

      fireEvent.change(titleInput(), { target: { value: "CTAO9解決後の編集タイトル" } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
      const [arg] = h.mockUpdateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(arg.id).toBe(COMPETITION_ID);
      expect(arg.updates.title).toBe("CTAO9解決後の編集タイトル");
    });
  });

  describe("[SC-4 保存側] 編集後の値が UPDATE payload に乗る (無言スキップの検出)", () => {
    it("[CTAO-10] origin=teamAdmin + admin: 大会名を編集して保存 → updateCompetitionMutation に編集後の値が乗る", async () => {
      renderScreen({
        origin: "teamAdmin",
        currentUserId: ADMIN_VIEWER_ID,
        members: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
      });

      await waitFor(() => expect(titleInput()).toBeTruthy());

      fireEvent.change(titleInput(), { target: { value: "CTAO10編集後大会名固有文字列" } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("competition-tab-form-save"));
        await flushAsync();
      });

      expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
      const [arg] = h.mockUpdateMutateAsync.mock.calls[0] as [
        { id: string; updates: Record<string, unknown> },
      ];
      expect(arg.id).toBe(COMPETITION_ID);
      expect(arg.updates.title).toBe("CTAO10編集後大会名固有文字列");
      expect(arg.updates.place).toBe(competitionFixture.place);
      expect(arg.updates.note).toBe(competitionFixture.note);
      // [SC-9] 編集時は team_id を送らない (不変)
      expect(Object.prototype.hasOwnProperty.call(arg.updates, "team_id")).toBe(false);
      // [SC-10] 長水路 (1) で保存した大会を開いて保存しても短水路 (0) に化けない
      expect(arg.updates.pool_type).toBe(1);
    });
  });

  describe("[PM 裁定2 の対照] origin 無しの経路では権限解決待ちのローディングに入らない", () => {
    it("[CTAO-11] origin 無し + メンバー取得中 (isLoading=true): フォームと制限バナーが即座に描画される", async () => {
      renderScreen({
        currentUserId: ADMIN_VIEWER_ID,
        membersLoading: true,
      });

      // origin が無いので isResolvingCompetitionPermission は発火しない (4条件 AND)。
      // 既存データの取得完了だけでフォームが出る。
      await waitFor(() => expect(screen.getByDisplayValue(competitionFixture.title)).toBeTruthy());
      expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
      expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy();
      expect(titleInput().disabled).toBe(true);
    });
  });

  describe("[引数を捨てない検証] useTeamMembersQuery が正しい teamId で呼ばれていること", () => {
    it("[CTAO-12] useTeamMembersQuery が competitions.team_id (route の teamId ではない) で呼ばれる", async () => {
      // route params の teamId は敢えて別の値にする。実装が route 側を使っていたら
      // teamMembersQueryCalls に TEAM_ID が現れず赤くなる。
      renderScreen({
        origin: "teamAdmin",
        currentUserId: ADMIN_VIEWER_ID,
        members: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
        routeTeamId: "team-8808-route-only",
      });

      await waitFor(() => expect(titleInput()).toBeTruthy());

      // 既存データ取得後は competitions.team_id で呼ばれている
      expect(h.teamMembersQueryCalls).toContain(TEAM_ID);
      // 最終レンダー時点の引数が competitions.team_id であること (route 値に戻っていない)
      expect(h.teamMembersQueryCalls[h.teamMembersQueryCalls.length - 1]).toBe(TEAM_ID);
    });
  });
});

// ===========================================================================
// [Phase C / High-1(a)] 権限判定の取得失敗 (isError) 経路
// ===========================================================================
// Developer が新設した経路:
//   isCompetitionPermissionUnavailable =
//     origin === "teamAdmin" && isEditMode && !!competitionTeamId && isError
//   → true なら ErrorView (fullScreen + onRetry={refetch}) を返し、
//     フォームも保存ボタンも描画しない。
//
// 【なぜこのガードが要るか】isError のとき react-query は isLoading=false /
// data=undefined を返す。放置すると isCurrentUserCompetitionTeamAdmin が false に
// 倒れ、**正規の管理者**に制限バナー付きの読み取り専用フォームと押せる保存ボタンが
// 出る。その保存は基本情報をスキップし、エントリー/レコードもタブごと非表示で
// スキップされるため、**1件も書かずに画面が閉じて成功と区別がつかない**。
//
// 【対照が必須】「エラーなら常に ErrorView」という実装でも CTAO-13 は通る。
// 4条件 AND のうち origin / isEditMode / competitionTeamId の各々を外した
// 対照 (CTAO-15 / 15b / 15c) を置いて初めて述語を pin できる。
// ---------------------------------------------------------------------------

/** ErrorView (alert-triangle アイコン) の描画数。vitest.setup の Feather モックは
 *  data-testid="icon-<name>" を出すため、testID 属性ではなくこちらで引く。 */
function errorViewIconCount(): number {
  return document.querySelectorAll('[data-testid="icon-alert-triangle"]').length;
}

/** saveError バナー (#FEE2E2 背景) の要素。無ければ undefined */
function saveErrorBanner(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll("div")).find(
    (el) => (el as HTMLElement).style.backgroundColor === "rgb(254, 226, 226)",
  ) as HTMLElement | undefined;
}

const PERMISSION_CHECK_FAILED_MESSAGE =
  "編集権限を確認できませんでした。通信状況を確認して再試行してください。";

describe("CompetitionTabFormScreen — [High-1(a)] 権限判定の取得失敗で ErrorView を出す", () => {
  it("[CTAO-13] isError=true + origin + 編集モード + team_id あり: ErrorView が1件で、フォーム・保存ボタン・制限バナーがすべて不在", async () => {
    renderScreen({
      origin: "teamAdmin",
      currentUserId: ADMIN_VIEWER_ID,
      membersError: true,
    });

    await waitFor(() => expect(errorViewIconCount()).toBe(1));

    // メッセージが新規キーの実値で出ている (キー名の書き間違いを検出する)
    expect(screen.getByText(PERMISSION_CHECK_FAILED_MESSAGE)).toBeTruthy();
    // フォーム本体も保存ボタンも制限バナーも存在しない
    expect(screen.queryByDisplayValue(competitionFixture.title)).toBeNull();
    expect(screen.queryByTestId("competition-tab-form-save")).toBeNull();
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
    // 「何も書かずに閉じる」経路に入っていない
    expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
    expect(h.mockGoBack).toHaveBeenCalledTimes(0);
    expect(h.mockPopTo).toHaveBeenCalledTimes(0);
  });

  it("[CTAO-14] ErrorView の「再試行」を押すと refetch がちょうど1回呼ばれる", async () => {
    renderScreen({
      origin: "teamAdmin",
      currentUserId: ADMIN_VIEWER_ID,
      membersError: true,
    });

    await waitFor(() => expect(errorViewIconCount()).toBe(1));

    const retryButton = screen.getByText("再試行").closest("button");
    expect(retryButton, "ErrorView に再試行ボタンが無い (onRetry が渡っていない)").not.toBeNull();
    fireEvent.click(retryButton as HTMLButtonElement);

    expect(h.mockRefetchTeamMembers).toHaveBeenCalledTimes(1);
  });

  it("[CTAO-15 / 対照] isError=true でも origin 無しなら ErrorView は出ず、従来どおりフォーム + 制限バナーが出る", async () => {
    renderScreen({
      currentUserId: ADMIN_VIEWER_ID,
      membersError: true,
    });

    await waitFor(() => expect(screen.getByDisplayValue(competitionFixture.title)).toBeTruthy());

    expect(errorViewIconCount()).toBe(0);
    expect(screen.queryByText(PERMISSION_CHECK_FAILED_MESSAGE)).toBeNull();
    expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy();
    expect(titleInput().disabled).toBe(true);
  });

  it("[CTAO-15b / 対照] isError=true + origin あり でも新規作成モードなら ErrorView は出ない (isEditMode 条件)", async () => {
    renderScreen({
      origin: "teamAdmin",
      currentUserId: ADMIN_VIEWER_ID,
      membersError: true,
      createMode: true,
    });

    await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

    expect(errorViewIconCount()).toBe(0);
    // 新規作成は常に編集可能 (制限バナーも出ない)
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
  });

  it("[CTAO-15c / 対照] isError=true + origin あり でも個人大会 (team_id が null) なら ErrorView は出ない (competitionTeamId 条件)", async () => {
    renderScreen({
      origin: "teamAdmin",
      currentUserId: ADMIN_VIEWER_ID,
      membersError: true,
      competitionOverrides: { team_id: null },
    });

    await waitFor(() => expect(screen.getByDisplayValue(competitionFixture.title)).toBeTruthy());

    expect(errorViewIconCount()).toBe(0);
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();
    // 個人大会は編集可能
    expect(titleInput().disabled).toBe(false);
  });
});

// ===========================================================================
// [Phase C / High-1(b)] 「編集不可なのに基本情報が変わっている」保存の早期 return
// ===========================================================================
// handleSave の大会 INSERT/UPDATE ブロック直前:
//   isEditMode && savedCompetitionId && !canEditCompetitionDetails && competitionBasicChanged
//   → setSaveError(t("forms.tabModal.competitionSaveBlockedNoPermission")) して return
//     (画面は閉じない)
//
// 事故シナリオ: 権限判定が編集中に true→false へ変わる (staleTime 5分のキャッシュ
// ヒットで編集を始めた後に refetch が失敗する等)。フィールドは disabled になるが
// **入力済みの state は残る**。そのまま保存すると基本情報の UPDATE がスキップされ、
// エントリー/レコードもチーム管理者ビューでは非表示でスキップされるため、
// 1件も書かずに画面が閉じて「保存できた」と誤認させる。
// ---------------------------------------------------------------------------
const SAVE_BLOCKED_MESSAGE =
  "編集権限が確認できないため、大会情報を保存できませんでした。画面を開き直して再試行してください。";

describe("CompetitionTabFormScreen — [High-1(b)] 権限喪失後の保存を無言で成功させない", () => {
  it("[CTAO-16] 編集中に canEdit が true→false へ flip した状態で保存 → UPDATE 0回・画面が閉じない・空でないエラーが出る", async () => {
    const { forceRerender } = renderScreen({
      origin: "teamAdmin",
      currentUserId: ADMIN_VIEWER_ID,
      members: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
    });

    await waitFor(() => expect(titleInput()).toBeTruthy());
    expect(titleInput().disabled).toBe(false);

    // 編集して未保存の変更を作る
    fireEvent.change(titleInput(), { target: { value: "CTAO16権限喪失前に入力した大会名" } });

    // 権限判定が false へ転落 (admin ではなくなる)。isError ではないので ErrorView には
    // 入らず、制限バナー付きの読み取り専用フォームになる = 事故の再現条件。
    h.mockUseTeamMembersQuery.mockReturnValue({
      data: [{ user_id: "roster-other-8809", role: "admin" }],
      isLoading: false,
    });
    forceRerender();

    await waitFor(() => expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId("competition-tab-form-save"));
      await flushAsync();
    });

    // 1件も書いていない
    expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
    expect(h.mockCreateMutateAsync).toHaveBeenCalledTimes(0);
    // 画面が閉じていない (「成功したふり」をしていない)
    expect(h.mockGoBack).toHaveBeenCalledTimes(0);
    expect(h.mockPopTo).toHaveBeenCalledTimes(0);
    expect(h.mockPopToTop).toHaveBeenCalledTimes(0);
    // 空でないエラーが画面に出ている (文言もキーの実値で厳密に見る)
    const banner = saveErrorBanner();
    expect(banner, "保存ブロック時にエラーバナーが描画されていない").toBeTruthy();
    expect((banner as HTMLElement).textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(screen.getByText(SAVE_BLOCKED_MESSAGE)).toBeTruthy();
  });

  it("[CTAO-17 / 対照] flip しても基本情報を変更していなければ早期 return しない (何も失われないので閉じてよい)", async () => {
    // competitionBasicChanged を条件に入れていないと、権限が無いだけで
    // 「触っていない大会を開いて閉じる」操作までブロックされてしまう。
    const { forceRerender } = renderScreen({
      origin: "teamAdmin",
      currentUserId: ADMIN_VIEWER_ID,
      members: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
    });

    await waitFor(() => expect(titleInput()).toBeTruthy());

    h.mockUseTeamMembersQuery.mockReturnValue({
      data: [{ user_id: "roster-other-8809", role: "admin" }],
      isLoading: false,
    });
    forceRerender();
    await waitFor(() => expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId("competition-tab-form-save"));
      await flushAsync();
    });

    expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
    expect(screen.queryByText(SAVE_BLOCKED_MESSAGE)).toBeNull();
    expect(saveErrorBanner()).toBeUndefined();
    // 戻り先へ遷移している (route の teamId が無いので goBack)
    expect(h.mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("[CTAO-18 / 懸念1] 既存値に前後空白があっても、ロード直後は competitionBasicChanged=false (snapshotRef と state 初期値が一致している)", async () => {
    // Developer 申告の懸念: competitionBasicChanged は snapshotRef.current との比較。
    // 将来ロード側にだけ正規化 (トリム等) が入ると、**一度も触っていないのに** true に
    // なり、個人フロー (canEdit=false) の非 admin が「開いて保存」しただけで
    // ブロックされる。片側だけ正規化したらここが赤くなるように、
    // **トリムで値が変わる fixture** を使って「ブロックされないこと」を pin する。
    renderScreen({
      currentUserId: GENERAL_VIEWER_ID,
      members: [{ user_id: GENERAL_VIEWER_ID, role: "user" }],
      competitionOverrides: {
        title: "  前後に空白のある大会名  ",
        place: "  前後に空白のある会場  ",
        note: "  前後に空白のある備考  ",
      },
    });

    // RTL の getByDisplayValue は既定で空白を正規化するため、前後空白の有無を
    // そのまま比較できない。placeholder で引いて value を直接見る。
    await waitFor(() => {
      const input = screen.getByPlaceholderText(
        "例: 全国大会, 対抗戦, タイムトライアル",
      ) as HTMLInputElement;
      expect(input.value).toBe("  前後に空白のある大会名  ");
    });
    // 個人フロー相当 (origin 無し) なので編集不可
    expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("competition-tab-form-save"));
      await flushAsync();
    });

    // 一切触っていないので早期 return は発火しない
    expect(screen.queryByText(SAVE_BLOCKED_MESSAGE)).toBeNull();
    expect(saveErrorBanner()).toBeUndefined();
    expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
  });
});

// ===========================================================================
// [Phase C / M-3] origin 無しの経路では team_memberships を引かない
// ===========================================================================
// Developer の修正:
//   useTeamMembersQuery(supabase, origin === "teamAdmin" ? (competitionTeamId ?? undefined) : undefined)
// origin 無しでは canEditCompetitionDetails が competitionTeamId の有無だけで確定し、
// メンバー一覧は答えを変えない。無条件に渡すと、ダッシュボード/カレンダーから
// 他人のチーム大会を開いただけで、そのチームの**非メンバー**でも
// team_memberships への list クエリが飛ぶ。
//
// [CTAO-12] は origin ありのケースしか見ていないため、この対照が無いと
// 「常に competitionTeamId を渡す」実装に戻しても全 green で通る。
// ---------------------------------------------------------------------------
describe("CompetitionTabFormScreen — [M-3] origin 無しでは useTeamMembersQuery に teamId を渡さない", () => {
  it("[CTAO-19 / 対照] origin 無しでチーム大会を開くと、useTeamMembersQuery は一度も team_id で呼ばれない (全て undefined)", async () => {
    renderScreen({
      currentUserId: ADMIN_VIEWER_ID,
      members: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
    });

    // 既存データ取得が完了し competitionTeamId が state に入った後でも呼ばれないこと
    await waitFor(() => expect(screen.getByDisplayValue(competitionFixture.title)).toBeTruthy());
    await act(async () => {
      await flushAsync();
    });

    expect(h.teamMembersQueryCalls.length).toBeGreaterThan(0);
    expect(h.teamMembersQueryCalls).not.toContain(TEAM_ID);
    // 「undefined 以外が1つも無い」ことを厳密に見る (別の値が漏れていないか)
    expect(h.teamMembersQueryCalls.filter((v) => v !== undefined)).toEqual([]);
    // 権限判定の結果自体は従来どおり (編集不可 + 制限バナー)
    expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
  });
});
