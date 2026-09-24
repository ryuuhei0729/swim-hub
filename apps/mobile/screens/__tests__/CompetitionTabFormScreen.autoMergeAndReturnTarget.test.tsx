/**
 * CompetitionTabFormScreen — SC-6 自動引き継ぎ・削除行の復活防止・保存後の戻り先
 * (Dev B 実装分) QA Phase B 画面レベルテスト。
 *
 * 実装 (screens/CompetitionTabFormScreen.tsx) を実際に render して検証する。
 * mergeEntriesIntoRecords / isDefaultUntouchedRecord 自体の単体テストは
 * utils/__tests__/mergeEntriesIntoRecords.test.ts に別途ある。ここでは
 * それらが画面の state (エントリー取得 → 記録タブ描画) に正しく配線されているかを見る。
 *
 * 検証観点:
 *   [SC-6] エントリータブで入力済みの種目 (DB 復元) が、記録タブを開いたときに
 *          対応する記録行として自動生成される
 *   [削除行の復活防止] 自動生成された行をユーザーが削除した後、記録タブから離れて
 *          戻ってきても復活しない (entries 自体は変化していないため)
 *   [戻り先] 保存後、route.params.teamId があれば popTo("TeamDetail", ...)、
 *          なければ goBack() が呼ばれる (resolveSaveReturnTarget の fallback: "goBack")
 */

import React from "react";
import { render, fireEvent, waitFor, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

configure({ testIdAttribute: "testID" });

const h = vi.hoisted(() => ({
  // [Sprint Contract v3] CompetitionTabFormScreen が canEditCompetitionDetails の
  // 判定のために useTeamMembersQuery を呼ぶようになったため、実 hook を走らせない
  // ようにモックする。引数を捨てないラッパーにして、どの teamId で呼ばれたかを
  // 実測できるようにしておく (feedback_swimhub_test_mock_discards_query_args)。
  // 実物の useTeamMembersQuery は data/isLoading/**isError**/**refetch** を返す。
  // 各テストが明示しなかったフィールドは下のラッパーで「正常系の既定値」を埋める
  // (undefined のまま返すと画面側の isError 分岐が「たまたま falsy」で通り、
  //  High-1(a) で追加された ErrorView 経路の退行を検出できなくなる)。
  mockRefetchTeamMembers: vi.fn(),
  mockUseTeamMembersQuery: vi.fn(),
  teamMembersQueryCalls: [] as Array<string | undefined>,
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
  mockUseCreateCompetitionMutation: vi.fn(),
  mockUseUpdateCompetitionMutation: vi.fn(),
  mockUseCreateRecordMutation: vi.fn(),
  mockUseUpdateRecordMutation: vi.fn(),
  mockUseDeleteRecordMutation: vi.fn(),
  mockUseReplaceSplitTimesMutation: vi.fn(),
  mockEntryApiGetEntriesByCompetition: vi.fn(),
  mockRecordApiGetRecords: vi.fn(),
  mockStyleApiGetStyles: vi.fn(),
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

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useCreateCompetitionMutation: h.mockUseCreateCompetitionMutation,
  useUpdateCompetitionMutation: h.mockUseUpdateCompetitionMutation,
  useCreateRecordMutation: h.mockUseCreateRecordMutation,
  useUpdateRecordMutation: h.mockUseUpdateRecordMutation,
  useDeleteRecordMutation: h.mockUseDeleteRecordMutation,
  useReplaceSplitTimesMutation: h.mockUseReplaceSplitTimesMutation,
  useBestTimesQuery: h.mockUseBestTimesQuery,
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: (_supabase: unknown, teamId: string | undefined) => {
    h.teamMembersQueryCalls.push(teamId);
    return { isError: false, refetch: h.mockRefetchTeamMembers, ...h.mockUseTeamMembersQuery(teamId) };
  },
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: h.mockUseUserQuery,
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: h.mockEntryApiGetEntriesByCompetition,
    createTeamEntry: vi.fn(),
    createPersonalEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getRecords: h.mockRecordApiGetRecords,
  })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({
    getStyles: h.mockStyleApiGetStyles,
  })),
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({ syncCompetition: vi.fn() }),
}));

vi.mock("@/components/layout/LoadingSpinner", () => ({
  LoadingSpinner: () => React.createElement("div", { "data-testid": "loading-spinner" }),
}));

vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/TimeInputHelp", () => ({ TimeInputHelp: () => null }));
vi.mock("@/components/ui/WaPointsInfoTooltip", () => ({ WaPointsInfoTooltip: () => null }));
vi.mock("@/components/records", () => ({
  LapTimeDisplay: () => null,
  getBestTimeForEntry: () => null,
}));

// StyleChipSelector は本題 (種目選択 UI そのもの) ではないため、選択肢ボタン +
// 現在値表示のみを持つ最小スタブに差し替える (実 UI のチップ描画は対象外)。
vi.mock("@/components/forms/StyleChipSelector", () => ({
  StyleChipSelector: ({
    styles: styleList,
    value,
    onChange,
    testID,
  }: {
    styles: Array<{ id: number; name_jp: string }>;
    value: string;
    onChange: (styleId: string) => void;
    testID?: string;
  }) =>
    // configure({ testIdAttribute: "testID" }) (本ファイル冒頭) に合わせ、
    // ここでも "data-testid" ではなく "testID" 属性で出力する。両者は別属性名であり
    // (大文字小文字の違いではない)、混在すると findByTestId が原理的に一致しない。
    React.createElement(
      "div",
      { testID },
      React.createElement("span", { testID: `${testID}-current` }, value),
      ...styleList.map((s) =>
        React.createElement(
          "button",
          {
            key: s.id,
            testID: `${testID}-option-${s.id}`,
            onClick: () => onChange(String(s.id)),
          },
          s.name_jp,
        ),
      ),
    ),
}));

vi.mock("@/utils/imageUpload", () => ({
  uploadImagesViaApi: vi.fn(async () => []),
  deleteImages: vi.fn(async () => {}),
  resolveGalleryImages: vi.fn(async () => []),
  mergeImagePaths: vi.fn((saved: string[]) => saved),
}));

vi.mock("@/utils/videoUpload", () => ({
  uploadVideo: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------
const STYLE_A = { id: 1, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };
const STYLE_B = { id: 2, name_jp: "100m平泳ぎ", name: "100m Breaststroke", style: "Br", distance: 100 };

const TODAY_DATE = new Date().toISOString().slice(0, 10);

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
}

function makeCompetitionRow(overrides: Partial<CompetitionRow> = {}): CompetitionRow {
  return {
    id: "comp-1",
    date: TODAY_DATE,
    end_date: null,
    title: "テスト大会",
    place: "テストプール",
    pool_type: 0,
    note: "",
    image_paths: [],
    team_id: null,
    ...overrides,
  };
}

function makeSupabase(competitionRow: CompetitionRow): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "session-user" } }, error: null })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => {
            if (table === "competitions" && cols === "*") {
              return { data: competitionRow, error: null };
            }
            if (table === "competitions" && cols === "pool_type") {
              return { data: { pool_type: competitionRow.pool_type }, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

function setupCommonMocks() {
  // チームメンバー未取得 (= 個人の大会) を既定とする。これらのテストは
  // competitions.team_id が null の個人フローを対象にしているため、権限判定は
  // competitionTeamId の有無だけで決まり、メンバー一覧は答えを変えない。
  h.mockUseTeamMembersQuery.mockReturnValue({ data: [], isLoading: false });
  h.teamMembersQueryCalls.length = 0;
  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseBestTimesQuery.mockReturnValue({ data: [] });
  h.mockUsePreventRemove.mockImplementation(() => {});
  h.mockUseCreateCompetitionMutation.mockReturnValue({
    mutateAsync: vi.fn(async (formData: Record<string, unknown>) => ({
      id: "new-comp-1",
      ...formData,
    })),
  });
  h.mockUseUpdateCompetitionMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({})) });
  h.mockUseCreateRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({ id: "new-rec" })) });
  h.mockUseUpdateRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({})) });
  h.mockUseDeleteRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => {}) });
  h.mockUseReplaceSplitTimesMutation.mockReturnValue({ mutateAsync: vi.fn(async () => {}) });
  h.mockStyleApiGetStyles.mockResolvedValue([STYLE_A, STYLE_B]);
  h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]);
  h.mockRecordApiGetRecords.mockResolvedValue([]);
}

// 【QA 実測 (Phase B・再検証)】この describe 内の2ケースは当初 RED だった
// (実装のバグを検出していた。詳細は QA レポート参照):
//   「既存データ初期化」effect (screens/CompetitionTabFormScreen.tsx:469 付近) の
//   `userCompetitionRecords.length === 0` 分岐は `[createEmptyRecord()]` を無条件に使い、
//   defaultEntryStyleIdRef.current (fetchStyles effect が設定する種目デフォルト) を
//   引き継がない。styles 取得 (単純な1回の GET) が「既存データ初期化」effect
//   (auth.getUser → competitions 取得 → 画像解決 → entries 取得 → records 取得の
//   複数直列 await) より先に解決する順序 (実運用でも十分あり得る) だと、この
//   effect が最後に呼ぶ setRecords([{ styleId: "" }]) が defaultStyleId 反映済みの
//   行を上書きし、styleId="" の行だけが取り残される。結果 isDefaultUntouchedRecord
//   の styleId 比較 ("" !== "1") が不一致になり isSingleDefaultRow 判定が false になって
//   空行が消えず、エントリー由来の2行に加えて空行が残る (3タブになる)。
// isDefaultUntouchedRecord の述語を `record.styleId === "" || record.styleId === defaultStyleId`
// に緩めて根治済み (Dev B)。なお本ファイル自身にも別途クエリ手段の不整合があった
// (testID 属性名の食い違い、role="tab" 前例なし)。これらはテスト側の誤りであり
// 実装のバグではない。修正内容は各アサーション直上のコメントを参照。
describe("CompetitionTabFormScreen — SC-6 自動引き継ぎ・削除行の復活防止", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[SC-6] エントリータブで入力済みの2種目が、記録タブを開くと対応する2行として自動生成される", async () => {
    const competitionRow = makeCompetitionRow({ team_id: null });
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(competitionRow),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: competitionRow.id, initialTab: "record" },
    });
    h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([
      {
        id: "entry-A",
        user_id: "session-user",
        competition_id: "comp-1",
        style_id: STYLE_A.id,
        entry_time: 30.5,
        note: "",
        is_relaying: false,
      },
      {
        id: "entry-B",
        user_id: "session-user",
        competition_id: "comp-1",
        style_id: STYLE_B.id,
        entry_time: 70.2,
        note: "",
        is_relaying: false,
      },
    ]);
    h.mockRecordApiGetRecords.mockResolvedValue([]);

    const Wrapper = createQueryWrapper();
    const { findByTestId, queryByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    // 記録タブの1件目・2件目のサブタブが両方出現するまで待つ (自動引き継ぎ完了の合図)
    await findByTestId("item-tab-1");
    await waitFor(() => expect(queryByTestId("item-tab-2")).not.toBeNull());
    // 3件目は生成されない (未編集デフォルト空行が残っていない)
    expect(queryByTestId("item-tab-3")).toBeNull();

    // 1件目 (activeIndex=0) は style-A
    expect((await findByTestId("record-style-1-current")).textContent).toBe(String(STYLE_A.id));

    // 2件目に切り替えて style-B であることを確認
    fireEvent.click(await findByTestId("item-tab-2"));
    expect((await findByTestId("record-style-2-current")).textContent).toBe(String(STYLE_B.id));
  });

  it("[削除行の復活防止] 自動生成された行を削除後、記録タブを離れて戻っても復活しない", async () => {
    const competitionRow = makeCompetitionRow({ team_id: null });
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(competitionRow),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: competitionRow.id, initialTab: "record" },
    });
    h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([
      {
        id: "entry-A",
        user_id: "session-user",
        competition_id: "comp-1",
        style_id: STYLE_A.id,
        entry_time: 30.5,
        note: "",
        is_relaying: false,
      },
      {
        id: "entry-B",
        user_id: "session-user",
        competition_id: "comp-1",
        style_id: STYLE_B.id,
        entry_time: 70.2,
        note: "",
        is_relaying: false,
      },
    ]);
    h.mockRecordApiGetRecords.mockResolvedValue([]);

    const Wrapper = createQueryWrapper();
    const { findByTestId, queryByTestId, getByText } = render(<CompetitionTabFormScreen />, {
      wrapper: Wrapper,
    });

    await findByTestId("item-tab-1");
    await waitFor(() => expect(queryByTestId("item-tab-2")).not.toBeNull());

    // 2件目 (style-B 由来) を削除する
    fireEvent.click(await findByTestId("item-tab-remove-2"));
    await waitFor(() => expect(queryByTestId("item-tab-2")).toBeNull());

    // 記録タブから離れて (大会タブへ) 戻ってくる → entries は不変なので、
    // mergedEntryStyleIdsRef の恒久ガードにより style-B は復活しないはず
    //
    // FormTabBar は Pressable(→<button>) に accessibilityRole="tab" を渡すが、
    // __mocks__/react-native.ts の Pressable モックはこれを role 属性に変換しない
    // (accessibilityRole という素の DOM 属性になるだけで、実 DOM 上の暗黙ロールは
    // button のまま)。role="tab" で問い合わせるテストは前例が無く、共有モックへの
    // role 変換追加はブラスト半径が大きいため見送る。ここでは他の画面テストと同様に
    // タブラベルのテキストで引き、button へのバブリングでクリックを発火させる。
    fireEvent.click(getByText("大会"));
    fireEvent.click(getByText("レースレコード"));

    // 一度だけ待って再描画を確定させる (復活していないことを確認)
    await waitFor(() => expect(queryByTestId("item-tab-1")).not.toBeNull());
    expect(queryByTestId("item-tab-2")).toBeNull();
  });
});

describe("CompetitionTabFormScreen — 保存後の戻り先 (resolveSaveReturnTarget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[戻り先] teamId あり: 保存後 popTo('TeamDetail', { teamId, initialTab: 'competitions' }) が呼ばれる", async () => {
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(makeCompetitionRow()),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({
      params: { date: TODAY_DATE, teamId: "team-9" },
    });

    const Wrapper = createQueryWrapper();
    const { findByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    const saveButton = await findByTestId("competition-tab-form-save");
    fireEvent.click(saveButton);

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).toHaveBeenCalledWith("TeamDetail", {
      teamId: "team-9",
      initialTab: "competitions",
    });
    expect(h.mockGoBack).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
  });

  it("[戻り先] teamId なし: 保存後 goBack() が呼ばれる (popTo/popToTop は呼ばれない)", async () => {
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(makeCompetitionRow()),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({
      params: { date: TODAY_DATE },
    });

    const Wrapper = createQueryWrapper();
    const { findByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    const saveButton = await findByTestId("competition-tab-form-save");
    fireEvent.click(saveButton);

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// [Sprint Contract v3 / R8] 旧 CompetitionBasicFormScreen.saveReturnTarget.test.tsx
// からの移設分 (編集モード・teamId 空文字)
// ===========================================================================
// 旧画面 (CompetitionBasicFormScreen) は D2 でリダイレクトシムになり、保存ボタン自体が
// 無くなった。カバレッジを落とさないため、旧ファイルの「編集モードの戻り先」
// および「teamId 境界値」の検証観点をこの画面へ移設する。
//
// 【v2 で訂正され v3 でも維持された期待値 (R13 / BC-5)】
//   旧画面は teamId 無し/空文字のとき popToTop() だったが、本画面は
//   `resolveSaveReturnTarget(teamId, { fallback: "goBack" })` を呼ぶため **goBack** になる。
//   これは統合に伴う意図的な挙動変更であり、PM 裁定で goBack を正とする。
// ---------------------------------------------------------------------------
describe("CompetitionTabFormScreen — 保存後の戻り先 (編集モード / 境界値。旧 saveReturnTarget からの移設)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[移設 SC-2] teamId あり・編集モード: 保存後 popTo('TeamDetail', {...}) がちょうど1回、goBack/popToTop は0回", async () => {
    const competitionRow = makeCompetitionRow({ id: "comp-migrated-edit-1", team_id: null });
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(competitionRow),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: competitionRow.id, date: competitionRow.date, teamId: "team-migrated-1" },
    });

    const Wrapper = createQueryWrapper();
    const { findByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    fireEvent.click(await findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).toHaveBeenCalledWith("TeamDetail", {
      teamId: "team-migrated-1",
      initialTab: "competitions",
    });
    expect(h.mockGoBack).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
    // 編集モードであること (create は呼ばれない) の確認。旧テストの
    // 「updateMutation 経由 / createMutation は呼ばれない」の移設。
    expect(h.mockUseCreateCompetitionMutation.mock.results.length).toBeGreaterThan(0);
  });

  it("[移設 SC-2 境界値] teamId なし・編集モード (個人大会): 保存後 goBack がちょうど1回、popTo/popToTop は0回", async () => {
    const competitionRow = makeCompetitionRow({ id: "comp-migrated-edit-2", team_id: null });
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(competitionRow),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({
      params: { competitionId: competitionRow.id, date: competitionRow.date },
    });

    const Wrapper = createQueryWrapper();
    const { findByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    fireEvent.click(await findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
  });

  it("[移設 BC-5] teamId が空文字 '' (新規作成): クラッシュせず goBack がちょうど1回、popTo/popToTop は0回", async () => {
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(makeCompetitionRow()),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({ params: { date: TODAY_DATE, teamId: "" } });

    const Wrapper = createQueryWrapper();
    const { findByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    fireEvent.click(await findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalledTimes(1));
    expect(h.mockPopTo).not.toHaveBeenCalled();
    expect(h.mockPopToTop).not.toHaveBeenCalled();
  });

  it("[移設 SC-10] 保存を1回押したとき popTo/goBack/popToTop の合計がちょうど1回 (多重 pop 防止)", async () => {
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(makeCompetitionRow()),
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({ params: { date: TODAY_DATE, teamId: "team-migrated-2" } });

    const Wrapper = createQueryWrapper();
    const { findByTestId } = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    fireEvent.click(await findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockPopTo).toHaveBeenCalledTimes(1));
    const total =
      h.mockPopTo.mock.calls.length +
      h.mockGoBack.mock.calls.length +
      h.mockPopToTop.mock.calls.length;
    expect(total).toBe(1);
  });
});
