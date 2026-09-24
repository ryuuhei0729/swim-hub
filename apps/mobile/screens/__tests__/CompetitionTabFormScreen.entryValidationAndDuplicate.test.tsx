/**
 * CompetitionTabFormScreen — エントリータブ (2-B) 未編集行スキップの緩和度 検証 +
 * (2-C・指示外の変更) 種目重複チェック緩和の実証。
 *
 * 背景 (PM 指示):
 *   (B) validateEntryTab に「未編集行はスキップ」の逃げ道が追加された。これが無いと
 *       ユーザーが一切触っていないデフォルト行のせいで保存が丸ごとブロックされる。
 *       ただし緩めすぎていないか (種目だけ選んだ・タイムだけ入れた・メモだけ書いた・
 *       リレーON にしただけの行が誤ってスキップされないか) を検証する。
 *   (C) 種目重複チェックが `entries.filter((e) => e.styleId)` から
 *       `entries.filter((e) => e.styleId && !isDefaultUntouchedEntry(...))` に変更された。
 *       これは PM が指示していない変更であり、実際の重複が素通りしないことを
 *       実証する必要がある。
 *
 * 実装 (screens/CompetitionTabFormScreen.tsx) を実際に render して検証する。
 * isDefaultUntouchedEntry 自体の単体テストは utils/__tests__/isDefaultUntouchedEntry.test.ts
 * に別途ある。ここではそれが画面の validateEntryTab・重複チェック・保存フローに
 * 正しく配線されているかを見る。
 */

import React from "react";
import { render, fireEvent, waitFor, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

// __mocks__/react-native.ts の testID は "data-testid" ではなく生の testID 属性を
// そのまま描画する (getAttribute は HTML 上大文字小文字を区別しないため testid とも
// 一致する)。findByTestId 側をこれに合わせる
// (screens/__tests__/CompetitionTabFormScreen.autoMergeAndReturnTarget.test.tsx と同じ方式)。
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
  mockEntryApiCreatePersonalEntry: vi.fn(),
  mockEntryApiCreateTeamEntry: vi.fn(),
  mockEntryApiUpdateEntry: vi.fn(),
  mockEntryApiDeleteEntry: vi.fn(),
  mockRecordApiGetRecords: vi.fn(),
  mockStyleApiGetStyles: vi.fn(),
}));

// TextInput の onChangeText は共有モックでは DOM の onChange に結線されていないため、
// このファイル限定で結線し直す (screens/__tests__/RecordLogFormScreen.saveReturnTarget.test.tsx
// と同じ方式。共有モック自体は変更しない)。
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
      onBlur,
      value,
      testID,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      onBlur?: () => void;
      value?: string;
      testID?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        testID,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
        onBlur: () => onBlur?.(),
      }),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: h.mockUseRoute,
  useNavigation: () => ({
    navigate: h.mockNavigate,
    goBack: h.mockGoBack,
    popTo: h.mockPopTo,
    popToTop: h.mockPopToTop,
    setOptions: h.mockSetOptions,
  }),
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
    createTeamEntry: h.mockEntryApiCreateTeamEntry,
    createPersonalEntry: h.mockEntryApiCreatePersonalEntry,
    updateEntry: h.mockEntryApiUpdateEntry,
    deleteEntry: h.mockEntryApiDeleteEntry,
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
// 「未選択に戻す」ボタン (production の StyleChipSelector には無いが、
// handleEntryStyleChange(draftId, index, "") という現実に取りうる状態遷移 (fetchStyles
// 未完了時に styleId="" のまま他フィールドが編集される競合状態。
// isDefaultUntouchedEntry.test.ts の境界値テストと同一の前提) を UI から起こすための
// テスト専用の穴) を持つ最小スタブに差し替える。
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
    React.createElement(
      "div",
      { testID },
      React.createElement("span", { testID: `${testID}-current` }, value),
      React.createElement(
        "button",
        { testID: `${testID}-clear`, onClick: () => onChange("") },
        "clear",
      ),
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
const STYLE_A = { id: 1, name_jp: "25m自由形", name: "25m Freestyle", style: "Fr", distance: 25 };
const STYLE_B = { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };

const today = new Date();
const FUTURE_DATE = new Date(today.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);

// 保存が成功すると resolvedCompetitionId がセットされ isEditMode=true になり、
// 「既存データ初期化」effect (screens/CompetitionTabFormScreen.tsx:371 付近) が
// supabase.from("competitions").select("*")... を呼ぶ。これを実装しないと
// supabase.from is not a function で例外になり、catch 節が navigation.goBack() を
// 追加で呼んでしまい (本題と無関係な二重呼び出し)、保存フローのアサーションを
// 汚染する。テスト対象の挙動ではないため、成功時に読める最小限のダミー行を返す。
function makeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "session-user" } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: "new-comp-1",
              date: FUTURE_DATE,
              end_date: null,
              title: null,
              place: null,
              pool_type: 0,
              note: null,
              image_paths: [],
              team_id: null,
            },
            error: null,
          })),
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
  h.mockEntryApiCreatePersonalEntry.mockResolvedValue({ id: "entry-created" });
  h.mockEntryApiCreateTeamEntry.mockResolvedValue({ id: "entry-created" });
  h.mockEntryApiUpdateEntry.mockResolvedValue({});
  h.mockEntryApiDeleteEntry.mockResolvedValue({});
  h.mockRecordApiGetRecords.mockResolvedValue([]);
  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(),
    subscription: null,
    getAccessToken: vi.fn(async () => "token"),
  });
}

/** 新規作成 (未来日、初期タブ=entry) で render する。 */
async function renderEntryTab() {
  h.mockUseRoute.mockReturnValue({
    params: { date: FUTURE_DATE, initialTab: "entry" },
  });
  const Wrapper = createQueryWrapper();
  const utils = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });
  // 種目取得完了 (defaultEntryStyleIdRef セット済み) を待つ。1行目の styleId 表示バッジで判定。
  await utils.findByTestId("entry-item-tabs");
  await waitFor(() =>
    expect((utils.queryByTestId("entry-style-1-current") as HTMLElement | null)?.textContent).toBe(
      String(STYLE_A.id),
    ),
  );
  return utils;
}

function setEntryTime(utils: ReturnType<typeof render>, value: string) {
  const input = utils.getByPlaceholderText("2.00.00");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe("CompetitionTabFormScreen — validateEntryTab 未編集行スキップ (2-B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[B-1] 種目だけ選んでタイム未入力の行 → スキップされず保存される (デフォルトと異なる種目を選べば有効な入力として扱われる)", async () => {
    const utils = await renderEntryTab();

    fireEvent.click(await utils.findByTestId("entry-style-1-option-2"));

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(1));
    expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ style_id: STYLE_B.id, entry_time: null, note: null }),
    );
    expect(utils.queryByText("種目を選択してください")).toBeNull();
    expect(
      utils.queryByText("同じ種目が複数入力されています。種目を変更してください。"),
    ).toBeNull();
  });

  it("[B-2] タイムだけ入れて種目未選択の行 → 「種目を選択してください」のエラーが出て保存がブロックされる", async () => {
    const utils = await renderEntryTab();

    setEntryTime(utils, "30.50");
    // fetchStyles 未完了時に起こりうる styleId="" の状態を模す (isDefaultUntouchedEntry.test.ts
    // の境界値ケースと同一の前提)。
    fireEvent.click(await utils.findByTestId("entry-style-1-clear"));

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    expect(await utils.findByText("種目を選択してください")).toBeDefined();
    expect(h.mockUseCreateCompetitionMutation().mutateAsync).not.toHaveBeenCalled();
    expect(h.mockEntryApiCreatePersonalEntry).not.toHaveBeenCalled();
  });

  it("[B-3] メモだけ書いた行 (種目・タイムはデフォルトのまま) → スキップされず保存される", async () => {
    const utils = await renderEntryTab();

    const memoInput = utils.getByPlaceholderText("メモ（任意）");
    fireEvent.change(memoInput, { target: { value: "自己ベスト更新目標" } });

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(1));
    expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        style_id: STYLE_A.id,
        entry_time: null,
        note: "自己ベスト更新目標",
      }),
    );
  });

  it("[B-3] リレーON にしただけの行 (種目・タイム・メモはデフォルトのまま) → スキップされず保存される", async () => {
    const utils = await renderEntryTab();

    fireEvent.click(await utils.findByTestId("entry-style-1-relay"));

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(1));
    expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ style_id: STYLE_A.id, is_relaying: true }),
    );
  });

  it("[B-4] 完全に未編集の行だけ → スキップされ、保存はブロックされない (エントリー0件で成功)", async () => {
    const utils = await renderEntryTab();

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalledTimes(1));
    expect(h.mockEntryApiCreatePersonalEntry).not.toHaveBeenCalled();
    expect(h.mockEntryApiCreateTeamEntry).not.toHaveBeenCalled();
    expect(utils.queryByText("種目を選択してください")).toBeNull();
  });

  it(
    "[B-5] 編集モードで既存エントリーが0件のとき、未編集のデフォルト空行 (styleId=\"\") は" +
      "種目必須エラーでブロックされない (「既存データ初期化」effect が createEmptyEntry() で" +
      "styleId=\"\" の行に上書きし、fetchStyles の自動セットを追い越すため。" +
      "screens/CompetitionTabFormScreen.tsx:438 の `: [createEmptyEntry()]` フォールバック)",
    async () => {
      // route.params.date が無い編集モードでは、初期 activeTab の判定
      // (isEntryTabVisible(initialDateParam || "")) が未取得の競技日を考慮できず
      // "competition" のままになる。競技データ取得完了 (date=未来日) を待ってから
      // 手動で「エントリー」タブへ切り替える。
      h.mockUseRoute.mockReturnValue({
        params: { competitionId: "comp-edit-1" },
      });
      h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]); // 既存エントリー0件
      h.mockRecordApiGetRecords.mockResolvedValue([]);
      const Wrapper = createQueryWrapper();
      const utils = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

      fireEvent.click(await utils.findByText("エントリー"));
      await utils.findByTestId("entry-item-tabs");
      // 「既存データ初期化」effect が createEmptyEntry() (styleId="") で上書きするため、
      // fetchStyles の自動セットは残らない (実装済みの既知の状態。SC-6 テストの
      // コメントで説明されている順序競合と同型)。
      await waitFor(() =>
        expect(
          (utils.queryByTestId("entry-style-1-current") as HTMLElement | null)?.textContent,
        ).toBe(""),
      );

      fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

      await waitFor(() => expect(h.mockGoBack).toHaveBeenCalledTimes(1));
      expect(utils.queryByText("種目を選択してください")).toBeNull();
      expect(h.mockEntryApiCreatePersonalEntry).not.toHaveBeenCalled();
    },
  );
});

describe("CompetitionTabFormScreen — 種目重複チェック (2-C・指示外の変更の実証)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[C-1] ユーザーが明示的に同じ種目を2行選び、両方編集した → 重複エラーが出て保存がブロックされる (実際の重複は素通りしない)", async () => {
    const utils = await renderEntryTab();

    // 1行目: デフォルト種目のままタイムを入れて「編集済み」にする
    setEntryTime(utils, "30.50");

    // 2行目を追加 (addEntry は firstStyle.id = デフォルト種目で初期化される)
    fireEvent.click(await utils.findByTestId("item-tab-add"));
    await utils.findByTestId("item-tab-2");
    setEntryTime(utils, "45.00");

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    expect(
      await utils.findByText("同じ種目が複数入力されています。種目を変更してください。"),
    ).toBeDefined();
    expect(h.mockUseCreateCompetitionMutation().mutateAsync).not.toHaveBeenCalled();
    expect(h.mockEntryApiCreatePersonalEntry).not.toHaveBeenCalled();
  });

  it("[C-2] 未編集デフォルト行 + ユーザーが同じ種目を選び編集した行 → 重複エラーは出ず保存できる (Dev B の意図どおり)", async () => {
    const utils = await renderEntryTab();

    // 1行目は一切触らない (未編集デフォルト行のまま残す)
    // 2行目を追加 (デフォルトと同じ種目で初期化される) し、タイムだけ入れて編集済みにする
    fireEvent.click(await utils.findByTestId("item-tab-add"));
    await utils.findByTestId("item-tab-2");
    setEntryTime(utils, "45.00");

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(1));
    expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ style_id: STYLE_A.id, entry_time: 45 }),
    );
    expect(
      utils.queryByText("同じ種目が複数入力されています。種目を変更してください。"),
    ).toBeNull();
  });

  it("[C-3] 3行以上のうち一部が重複 (未編集デフォルト行1 + 同一種目の編集済み行2) → 重複エラーが出る", async () => {
    const utils = await renderEntryTab();

    // 1行目: 未編集のまま残す (デフォルト種目・除外対象)
    // 2行目: STYLE_B を選び、タイムを入れて編集済みにする
    fireEvent.click(await utils.findByTestId("item-tab-add"));
    await utils.findByTestId("item-tab-2");
    fireEvent.click(await utils.findByTestId("entry-style-2-option-2"));
    setEntryTime(utils, "30.50");

    // 3行目: 同じく STYLE_B を選び、タイムを入れて編集済みにする (2行目と実際に重複)
    fireEvent.click(await utils.findByTestId("item-tab-add"));
    await utils.findByTestId("item-tab-3");
    fireEvent.click(await utils.findByTestId("entry-style-3-option-2"));
    setEntryTime(utils, "31.00");

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    expect(
      await utils.findByText("同じ種目が複数入力されています。種目を変更してください。"),
    ).toBeDefined();
    expect(h.mockUseCreateCompetitionMutation().mutateAsync).not.toHaveBeenCalled();
  });
});
