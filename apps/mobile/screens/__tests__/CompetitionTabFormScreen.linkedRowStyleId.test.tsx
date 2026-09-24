/**
 * CompetitionTabFormScreen — 双方向リンク4ハンドラ (entry⇔record) の styleId 突き合わせ
 * (Reviewer 検出 Critical・PM 実測確認済み。Dev B 実装分) QA Phase B 画面レベルテスト。
 *
 * 背景 (故障シナリオ):
 *   1. エントリータブで2行入力: entry[0]=種目X, entry[1]=種目Y
 *   2. 記録タブを開く → 自動引き継ぎで records=[recX(idx0), recY(idx1)]
 *   3. エントリータブに戻り entry[0](種目X) を削除 → entries=[entryY] (1件、idx0)。
 *      records は追加のみ設計なので [recX, recY] のまま取り残される
 *   4. 記録タブで records[0](recX) の種目を変更する
 *   5. 修正前 (index 突き合わせ): linkedEntry = entries[0] = entryY (無関係) を拾い、
 *      種目が黙って上書きされる
 *   6. 修正後 (styleId 突き合わせ): recX の styleId (変更前の X) に一致する entry が
 *      存在しないため、findLinkedRowDraftId は undefined を返し、entryY は触られない
 *
 * 実装 (screens/CompetitionTabFormScreen.tsx) を実際に render して検証する。
 * findLinkedRowDraftId 自体の単体テストは utils/__tests__/findLinkedRowDraftId.test.ts に
 * 別途ある。ここではそれが4ハンドラ (handleEntryStyleChange / handleEntryToggleRelaying /
 * handleRecordStyleChange / handleRecordToggleRelaying) に正しく配線されているかを見る。
 *
 * 実装上の制約 (テスト設計に影響):
 *   showEntryTab (isEntryTabVisible(date)) と showRecordTab は日付に関して相補
 *   (未来日 → entry タブのみ編集可能、今日/過去 → record タブのみ編集可能)。
 *   一つの render セッション内で両方の編集操作を行き来するため、本ファイルでは
 *   DatePickerField をテスト用の <input> に差し替え、日付を未来⇄過去に往復させて
 *   タブの可視性を切り替える。
 *
 * 種目は Fr 25/50/100/200 (id=1..4, すべて canRelay=true) を使う。
 *   - entry1 (先頭行) は fetchStyles 完了時に自動で id=1 (styleA) がセットされる。
 *     これを styleB (id=2) に変更すると、その時点で唯一の記録行 (record0, 同じく
 *     自動で id=1 がセットされている) と styleId が一致し、双方向リンクにより
 *     record0 も styleB に追従する (これは仕様通りの正しい 1:1 追従であり、
 *     本ファイルが検出対象とするバグとは別物)。
 *   - entry2 (追加行) は addEntry で id=1 (swimStyles[0]) がデフォルトになるため、
 *     record0 が既に styleB に切り替わった後に styleC (id=3) へ変更すれば
 *     record0 との誤マッチは起きない。
 *   - 記録タブを開くと mergeEntriesIntoRecords が entry2(styleC) 用の記録行を
 *     追加生成する。ここまでで entry1(styleB)⇔record0(styleB)、
 *     entry2(styleC)⇔recordC(styleC) の2組ができる。
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
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/TimeInputHelp", () => ({ TimeInputHelp: () => null }));
vi.mock("@/components/ui/WaPointsInfoTooltip", () => ({ WaPointsInfoTooltip: () => null }));
vi.mock("@/components/records", () => ({
  LapTimeDisplay: () => null,
  getBestTimeForEntry: () => null,
}));

// DatePickerField を制御可能な <input> に差し替える。start date (required=true) と
// end date (required 省略) を testID で区別する。value/onChange のみを素通しする
// 最小スタブ (本題はカレンダー UI そのものではなく、日付変更による showEntryTab/
// showRecordTab の切り替えなので、実カレンダー UI を経由する必要はない)。
vi.mock("@/components/ui/DatePickerField", () => ({
  DatePickerField: ({
    value,
    onChange,
    required,
  }: {
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
  }) =>
    React.createElement("input", {
      type: "text",
      testID: required ? "date-field-start" : "date-field-end",
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    }),
}));

// StyleChipSelector は本題 (種目選択 UI そのもの) ではないため、選択肢ボタン +
// 現在値表示のみを持つ最小スタブに差し替える (autoMergeAndReturnTarget.test.tsx と同一方式)。
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
// テストデータ (すべて Fr・距離200以下 → canRelay=true)
// ---------------------------------------------------------------------------
const STYLE_A = { id: 1, name_jp: "25m自由形", name: "25m Freestyle", style: "Fr", distance: 25 };
const STYLE_B = { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };
const STYLE_C = { id: 3, name_jp: "100m自由形", name: "100m Freestyle", style: "Fr", distance: 100 };
const STYLE_D = { id: 4, name_jp: "200m自由形", name: "200m Freestyle", style: "Fr", distance: 200 };
const ALL_STYLES = [STYLE_A, STYLE_B, STYLE_C, STYLE_D];

const today = new Date();
const FUTURE_DATE = new Date(today.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);
const PAST_DATE = new Date(today.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);

function makeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "session-user" } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
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
  h.mockUseCreateCompetitionMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({})) });
  h.mockUseUpdateCompetitionMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({})) });
  h.mockUseCreateRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({ id: "new-rec" })) });
  h.mockUseUpdateRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => ({})) });
  h.mockUseDeleteRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => {}) });
  h.mockUseReplaceSplitTimesMutation.mockReturnValue({ mutateAsync: vi.fn(async () => {}) });
  h.mockStyleApiGetStyles.mockResolvedValue(ALL_STYLES);
  h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]);
  h.mockRecordApiGetRecords.mockResolvedValue([]);
  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(),
    subscription: null,
    getAccessToken: vi.fn(async () => "token"),
  });
}

type Utils = ReturnType<typeof render>;

/** 新規作成・未来日で render する。種目取得完了 (フッターの保存ボタン描画) まで待つ。 */
async function renderScreen(): Promise<Utils> {
  h.mockUseRoute.mockReturnValue({ params: { date: FUTURE_DATE } });
  const Wrapper = createQueryWrapper();
  const utils = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });
  await utils.findByTestId("competition-tab-form-save");
  return utils;
}

function goToTab(utils: Utils, label: "大会" | "エントリー" | "レースレコード") {
  fireEvent.click(utils.getByText(label));
}

/** 大会タブの開始日を書き換える (大会タブがアクティブな状態で呼ぶこと)。 */
function setStartDate(utils: Utils, value: string) {
  const input = utils.getByTestId("date-field-start");
  fireEvent.change(input, { target: { value } });
}

function currentEntryStyle(utils: Utils, index: 1 | 2 | 3): string {
  return (utils.getByTestId(`entry-style-${index}-current`) as HTMLElement).textContent ?? "";
}

function currentRecordStyle(utils: Utils, index: 1 | 2 | 3): string {
  return (utils.getByTestId(`record-style-${index}-current`) as HTMLElement).textContent ?? "";
}

function entryRelayValue(utils: Utils, index: 1 | 2 | 3): string | null {
  return utils.getByTestId(`entry-style-${index}-relay`).getAttribute("data-value");
}

function recordRelayValue(utils: Utils, index: 1 | 2 | 3): string | null {
  return utils.getByTestId(`record-style-${index}-relay`).getAttribute("data-value");
}

/**
 * 共通セットアップ: entry1(styleB)⇔record0(styleB)、entry2(styleC)⇔recordC(styleC) の
 * 2組を作り、entry1 を削除して「record0 が取り残された orphan」の状態にする。
 * 呼び出し後は活性タブ = エントリータブ、entries=[entry2(styleC)] のみ (index0)。
 * records=[record0(styleB), recordC(styleC)] (削除の影響を受けず2件のまま)。
 */
async function setupOrphanedRecord(utils: Utils): Promise<void> {
  // entry1 (先頭行、自動で styleA) を styleB に変更 → 唯一の記録行 record0 (自動で
  // styleA) と一致し、双方向リンクにより record0 も styleB に追従する (仕様通り)。
  goToTab(utils, "エントリー");
  await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_A.id)));
  fireEvent.click(utils.getByTestId(`entry-style-1-option-${STYLE_B.id}`));
  await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_B.id)));

  // entry2 を追加 (デフォルト styleA) → styleC に変更。この時点で record0 は既に
  // styleB のため、styleA での誤マッチは起きない。
  fireEvent.click(utils.getByTestId("item-tab-add"));
  await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_A.id)));
  fireEvent.click(utils.getByTestId(`entry-style-2-option-${STYLE_C.id}`));
  await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_C.id)));

  // 記録タブを一度開き、mergeEntriesIntoRecords により entry2(styleC) 用の記録行を
  // 自動生成させる (未来日のため record タブの中身自体はガード表示だが、
  // マージ effect は activeTab のみに依存するため実行される)。
  goToTab(utils, "レースレコード");
  goToTab(utils, "エントリー");
  await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

  // entry1 (styleB) を削除する → record0 (styleB) が取り残された orphan になる。
  fireEvent.click(utils.getByTestId("item-tab-remove-1"));
  await waitFor(() => expect(utils.queryByTestId("item-tab-2")).toBeNull());
  await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_C.id)));
}

/** 大会タブに移動して日付を変更する (record タブの編集可否を切り替える)。 */
function changeDateFrom(utils: Utils, value: string) {
  goToTab(utils, "大会");
  setStartDate(utils, value);
}

describe("CompetitionTabFormScreen — 双方向リンク: 削除後の種目変更 (record→entry方向・handleRecordStyleChange)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[V-LINK-01] orphan 化した record0 の種目を変更しても、無関係な entry2 の種目は変わらない", async () => {
    const utils = await renderScreen();
    await setupOrphanedRecord(utils);

    // 過去日に変更 → record タブが編集可能になる (entry タブは消える)
    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    // record0 (item-tab-1, styleB) の種目を styleD に変更する
    await waitFor(() => expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_B.id)));
    fireEvent.click(utils.getByTestId(`record-style-1-option-${STYLE_D.id}`));
    await waitFor(() => expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_D.id)));

    // recordC (item-tab-2, styleC) は無関係なので触られていないこと
    fireEvent.click(utils.getByTestId("item-tab-2"));
    expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_C.id));

    // 未来日に戻す → entry タブを再表示し、entry2(styleC) が上書きされていないことを確認する
    changeDateFrom(utils, FUTURE_DATE);
    goToTab(utils, "エントリー");
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_C.id)));
  });
});

describe("CompetitionTabFormScreen — 双方向リンク: 削除後の種目変更 (entry→record方向・handleEntryStyleChange)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[V-LINK-02] 残った entry2 の種目を変更しても、orphan 化した record0 の種目は変わらない (正しいペアの recordC のみ更新される)", async () => {
    const utils = await renderScreen();
    await setupOrphanedRecord(utils);

    // まだ未来日・エントリータブがアクティブな状態で entry2 (styleC) を styleD に変更する
    fireEvent.click(utils.getByTestId(`entry-style-1-option-${STYLE_D.id}`));
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_D.id)));

    // 過去日に変更して record タブを確認する
    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    // record0 (styleB, orphan) は触られていない
    await waitFor(() => expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_B.id)));
    // recordC (正しいペア) は styleD に追従している
    fireEvent.click(utils.getByTestId("item-tab-2"));
    expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_D.id));
  });
});

describe("CompetitionTabFormScreen — 双方向リンク: isRelaying トグル (record→entry方向・handleRecordToggleRelaying)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[V-LINK-03] orphan 化した record0 の isRelaying をトグルしても、無関係な entry2 の isRelaying は変わらない", async () => {
    const utils = await renderScreen();
    await setupOrphanedRecord(utils);

    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());
    await waitFor(() => expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_B.id)));

    expect(recordRelayValue(utils, 1)).toBe("false");
    fireEvent.click(utils.getByTestId("record-style-1-relay"));
    await waitFor(() => expect(recordRelayValue(utils, 1)).toBe("true"));

    changeDateFrom(utils, FUTURE_DATE);
    goToTab(utils, "エントリー");
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_C.id)));
    expect(entryRelayValue(utils, 1)).toBe("false");
  });
});

describe("CompetitionTabFormScreen — 双方向リンク: isRelaying トグル (entry→record方向・handleEntryToggleRelaying)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[V-LINK-04] 残った entry2 の isRelaying をトグルしても、orphan 化した record0 は変わらず、正しいペアの recordC のみ更新される", async () => {
    const utils = await renderScreen();
    await setupOrphanedRecord(utils);

    expect(entryRelayValue(utils, 1)).toBe("false");
    fireEvent.click(utils.getByTestId("entry-style-1-relay"));
    await waitFor(() => expect(entryRelayValue(utils, 1)).toBe("true"));

    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    await waitFor(() => expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_B.id)));
    expect(recordRelayValue(utils, 1)).toBe("false");

    fireEvent.click(utils.getByTestId("item-tab-2"));
    expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_C.id));
    expect(recordRelayValue(utils, 2)).toBe("true");
  });
});

describe("CompetitionTabFormScreen — 双方向リンク: 正常系の非退行 (行数一致・削除なし)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[V-LINK-05] entry→record方向: 行数が一致した通常状態では、対応する記録行が正しく更新される", async () => {
    const utils = await renderScreen();

    goToTab(utils, "エントリー");
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_A.id)));
    fireEvent.click(utils.getByTestId(`entry-style-1-option-${STYLE_B.id}`));
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_B.id)));

    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_A.id)));
    fireEvent.click(utils.getByTestId(`entry-style-2-option-${STYLE_C.id}`));
    await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_C.id)));

    goToTab(utils, "レースレコード");
    goToTab(utils, "エントリー");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    // entry1 (styleB) を styleD に変更 (削除なし、行数一致のまま)。
    // 直前の操作で activeEntryIndex は entry2 (index1) を指しているため、
    // 先に item-tab-1 をアクティブにしてから entry-style-1-* を操作する
    // (1行ずつしか描画されない UI のため)。
    fireEvent.click(utils.getByTestId("item-tab-1"));
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_B.id)));
    fireEvent.click(utils.getByTestId(`entry-style-1-option-${STYLE_D.id}`));
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_D.id)));

    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    // record0 (entry1 のペア) は styleD に追従、recordC (entry2 のペア) は styleC のまま
    await waitFor(() => expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_D.id)));
    fireEvent.click(utils.getByTestId("item-tab-2"));
    expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_C.id));
  });

  it("[V-LINK-06] record→entry方向: 行数が一致した通常状態では、対応するエントリー行が正しく更新される", async () => {
    const utils = await renderScreen();

    goToTab(utils, "エントリー");
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_A.id)));
    fireEvent.click(utils.getByTestId(`entry-style-1-option-${STYLE_B.id}`));
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_B.id)));

    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_A.id)));
    fireEvent.click(utils.getByTestId(`entry-style-2-option-${STYLE_C.id}`));
    await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_C.id)));

    goToTab(utils, "レースレコード");
    goToTab(utils, "エントリー");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());

    // recordC (item-tab-2, styleC) を styleD に変更 (削除なし、行数一致のまま)
    fireEvent.click(utils.getByTestId("item-tab-2"));
    await waitFor(() => expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_C.id)));
    fireEvent.click(utils.getByTestId(`record-style-2-option-${STYLE_D.id}`));
    await waitFor(() => expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_D.id)));

    // record0 (item-tab-1, styleB) は無関係なので変わらない
    fireEvent.click(utils.getByTestId("item-tab-1"));
    expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_B.id));

    changeDateFrom(utils, FUTURE_DATE);
    goToTab(utils, "エントリー");
    // entry2 (styleC のペア) は styleD に追従、entry1 (styleB) は無関係なので変わらない
    await waitFor(() => expect(currentEntryStyle(utils, 2)).toBe(String(STYLE_D.id)));
    fireEvent.click(utils.getByTestId("item-tab-1"));
    expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_B.id));
  });
});

describe("CompetitionTabFormScreen — 双方向リンク: 相手が見つからないケース (記録行がエントリー由来でない)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("[V-LINK-07] エントリー由来でない独立した記録行の種目を変更してもクラッシュせず、他の記録行は影響を受けない", async () => {
    const utils = await renderScreen();
    await setupOrphanedRecord(utils);

    changeDateFrom(utils, PAST_DATE);
    goToTab(utils, "レースレコード");
    await waitFor(() => expect(utils.queryByTestId("item-tab-2")).not.toBeNull());
    expect(utils.queryByTestId("item-tab-3")).toBeNull();

    // 独立した3件目の記録行を追加する (entries には styleC の entry2 しかいない)
    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() => expect(utils.queryByTestId("item-tab-3")).not.toBeNull());
    await waitFor(() => expect(currentRecordStyle(utils, 3)).toBe(String(STYLE_A.id)));

    // styleD (entries に一致する行が無い) に変更する → 相手が見つからずクラッシュしない
    fireEvent.click(utils.getByTestId(`record-style-3-option-${STYLE_D.id}`));
    await waitFor(() => expect(currentRecordStyle(utils, 3)).toBe(String(STYLE_D.id)));

    // 既存の record0 / recordC は影響を受けていない
    fireEvent.click(utils.getByTestId("item-tab-1"));
    expect(currentRecordStyle(utils, 1)).toBe(String(STYLE_B.id));
    fireEvent.click(utils.getByTestId("item-tab-2"));
    expect(currentRecordStyle(utils, 2)).toBe(String(STYLE_C.id));

    // entries も1件のまま (styleC) で、余計な行が生成されていないこと
    changeDateFrom(utils, FUTURE_DATE);
    goToTab(utils, "エントリー");
    await waitFor(() => expect(currentEntryStyle(utils, 1)).toBe(String(STYLE_C.id)));
    expect(utils.queryByTestId("item-tab-2")).toBeNull();
  });
});
