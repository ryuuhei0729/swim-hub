/**
 * CompetitionTabFormScreen — 本人の「目標: xx.xx」バッジ (M1 エントリー行 / M1' 記録行)
 * Sprint Contract goal_target_badge
 *   - 保存済み大会 (大会 id あり) で、本人・その大会・その種目の目標があれば出る
 *   - 大会が未保存 (新規作成: 大会 id なし) では目標があっても出ない
 *   - cancelled / 別大会 / 別ユーザー / 大会削除済み (competition_id=null) / 別種目では出ない
 *   - 記録行は引き継ぎあり (is_relaying=true) で出ない。エントリー行は引き継ぎ区分を使わない
 *   - 目標フックが失敗 (data 無し) でも画面は描画される (バッジが出ないだけ)
 * RNモックの testID は TextInput のみ。バッジは文言 (ja.json 由来) で引く。
 */

import React from "react";
import { render, waitFor, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";
import ja from "@apps/shared/messages/ja.json";

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
  goalQuery: { data: [] as unknown[] | undefined, isError: false, isPending: false },
  goalOptionsSeen: [] as unknown[],
}));

// TextInput の onChangeText/onBlur を DOM の onChange/onBlur に結線し直す
// (entryValidationAndDuplicate.test.tsx と同じ方式。共有モック自体は変更しない)。
vi.mock("@apps/shared/hooks/queries/goalTargets", () => ({
  useGoalTargetsQuery: (_s: unknown, options?: unknown) => {
    h.goalOptionsSeen.push(options);
    return h.goalQuery;
  },
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

// getBestTimeForEntry は本題そのもの (プロダクションの唯一の定義元) なので、実装を差し替えずに
// 素通しする。LapTimeDisplay のみ軽量スタブに差し替える。
// 【PM 裁定2 (Phase C)】shared の素の実装 (@apps/shared/utils/bestTimeForEntry) を直接
// import すると、mobile 用に名前空間を前置するラッパー (apps/mobile/components/records/
// bestTimeForEntry.ts、`${BEST_TIME_LABEL_NAMESPACE}.${result.labelKey}` で
// "forms.recordLog.bestTimeXxx" 形式にしている) を迂回してしまい、バッジの label が
// 未翻訳の bare key で表示される偽の不具合を作り込んでしまう (Phase B の誤診の原因)。
// 実際に screens/CompetitionTabFormScreen.tsx が import しているのはこのラッパー版
// (`@/components/records` → `index.ts` が re-export) なので、モックも同じラッパーを使う。
vi.mock("@/components/records", async () => {
  const { getBestTimeForEntry } = await import("@/components/records/bestTimeForEntry");
  return {
    LapTimeDisplay: () => null,
    getBestTimeForEntry,
  };
});

// StyleChipSelector は本題 (種目選択 UI そのもの) ではないため、選択肢ボタンのみを持つ
// 最小スタブに差し替える (linkedRowStyleId.test.tsx と同一方式)。
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
const STYLE_FREE_50 = { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };
const STYLE_BREAST_50 = { id: 9, name_jp: "50m平泳ぎ", name: "50m Breaststroke", style: "Br", distance: 50 };
const ALL_STYLES = [STYLE_FREE_50, STYLE_BREAST_50];

const today = new Date();
const FUTURE_DATE = new Date(today.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);

interface BestTimeFixture {
  id: string;
  style_id: number;
  time: number;
  pool_type: number;
  is_relaying: boolean;
  style: { name_jp: string; distance: number };
  relayingTime?: { time: number };
}

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

function setupCommonMocks(bestTimes: BestTimeFixture[] = []) {
  // チームメンバー未取得 (= 個人の大会) を既定とする。これらのテストは
  // competitions.team_id が null の個人フローを対象にしているため、権限判定は
  // competitionTeamId の有無だけで決まり、メンバー一覧は答えを変えない。
  h.mockUseTeamMembersQuery.mockReturnValue({ data: [], isLoading: false });
  h.teamMembersQueryCalls.length = 0;
  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseBestTimesQuery.mockReturnValue({ data: bestTimes });
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
  h.mockStyleApiGetStyles.mockResolvedValue(ALL_STYLES);
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

type Utils = ReturnType<typeof render>;

/** 新規作成・未来日・エントリータブで render する。種目取得完了まで待つ。 */
async function renderEntryTab(bestTimes: BestTimeFixture[] = []): Promise<Utils> {
  setupCommonMocks(bestTimes);
  h.mockUseRoute.mockReturnValue({ params: { date: FUTURE_DATE, initialTab: "entry" } });
  const Wrapper = createQueryWrapper();
  const utils = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });
  await utils.findByTestId("entry-item-tabs");
  await waitFor(() =>
    expect((utils.queryByTestId("entry-style-1-current") as HTMLElement | null)?.textContent).toBe(
      String(STYLE_FREE_50.id),
    ),
  );
  return utils;
}


const GOAL_LABEL = ja.forms.recordLog.goalTargetLabel;
const goalText = (t: string) => `${GOAL_LABEL}: ${t}`;
const COMP_ID = "comp-1";
const PAST_DATE = "2020-01-01";

const goal = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  user_id: "user-1",
  competition_id: COMP_ID,
  style_id: STYLE_FREE_50.id,
  target_time: 28.5,
  start_time: 30,
  status: "active",
  ...over,
});

function setupEditMode(opts: { tab: "entry" | "record"; isRelaying?: boolean; best?: BestTimeFixture[]; noEntries?: boolean }) {
  setupCommonMocks(opts.best ?? []);
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: COMP_ID, date: opts.tab === "entry" ? FUTURE_DATE : PAST_DATE, end_date: null, title: "大会",
              place: "", pool_type: 0, note: "", team_id: null, image_paths: [],
            },
            error: null,
          })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
  h.mockUseAuth.mockReturnValue({
    supabase,
    user: { id: "user-1" },
    subscription: null,
    getAccessToken: vi.fn(async () => null),
  });
  h.mockEntryApiGetEntriesByCompetition.mockResolvedValue(
    opts.noEntries
      ? []
      : [{ id: "e1", user_id: "user-1", style_id: STYLE_FREE_50.id, entry_time: 30, note: null, is_relaying: false }],
  );
  h.mockRecordApiGetRecords.mockResolvedValue([
    {
      id: "r1", competition_id: COMP_ID, style_id: STYLE_FREE_50.id, time: 29, is_relaying: opts.isRelaying ?? false,
      split_times: [], note: null, reaction_time: null, video_path: null, video_thumbnail_path: null,
    },
  ]);
  h.mockUseRoute.mockReturnValue({
    params: { competitionId: COMP_ID, date: opts.tab === "entry" ? FUTURE_DATE : PAST_DATE, initialTab: opts.tab },
  });
}

async function renderEdit(
  tab: "entry" | "record",
  isRelaying = false,
  extra: { best?: BestTimeFixture[]; noEntries?: boolean } = {},
) {
  setupEditMode({ tab, isRelaying, ...extra });
  const utils = render(<CompetitionTabFormScreen />, { wrapper: createQueryWrapper() });
  // 既存データ (行) の復元完了を待つ: エントリー30.00 / 記録29.00 が入力欄に出る
  const expected = tab === "entry" ? "30.00" : "29.00";
  await waitFor(() => expect(utils.queryAllByDisplayValue(expected).length).toBeGreaterThan(0));
  return utils;
}
const bestFixture = (time: number): BestTimeFixture => ({
  id: "bt-1", style_id: STYLE_FREE_50.id, time, pool_type: 0, is_relaying: false,
  style: { name_jp: "50m自由形", distance: 50 },
});
const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const spanStarting = (utils: Utils, prefix: string): HTMLElement | undefined =>
  utils.queryAllByText((_c, el) => el?.tagName === "SPAN" && norm(el.textContent).startsWith(prefix))[0];
/** バッジ (View) = span の親。縦並びコンテナ = その親 (badgeColumn) */
const badgeOf = (span: HTMLElement) => span.parentElement as HTMLElement;
const columnOf = (span: HTMLElement) => badgeOf(span).parentElement as HTMLElement;
const goalBadges = (utils: Utils): string[] =>
  utils
    .queryAllByText((_c, el) => el?.tagName === "SPAN" && (el.textContent ?? "").replace(/\s+/g, " ").trim().startsWith(`${GOAL_LABEL}: `))
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());

describe("CompetitionTabFormScreen — 目標バッジ (M1 エントリー行)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.goalQuery = { data: [], isError: false, isPending: false };
    h.goalOptionsSeen = [];
  });

  it("保存済み大会: 本人・その大会・その種目の目標が「目標: 28.50」で出る (アンカー: モックが効いている)", async () => {
    h.goalQuery.data = [goal()];
    const utils = await renderEdit("entry");
    await waitFor(() => expect(goalBadges(utils)).toEqual([goalText("28.50")]));
  });

  it("目標が無ければ出ない (アンカー対: 同じ描画経路でデータ有りだけが表示を変える)", async () => {
    const utils = await renderEdit("entry");
    expect(goalBadges(utils)).toEqual([]);
  });

  it("cancelled / 別大会 / 別ユーザー / 大会削除済み (null) / 別種目では出ない。achieved は出る", async () => {
    h.goalQuery.data = [
      goal({ status: "cancelled" }),
      goal({ competition_id: "comp-OTHER", id: "g2" }),
      goal({ user_id: "someone-else", id: "g3" }),
      goal({ competition_id: null, id: "g4" }),
      goal({ style_id: STYLE_BREAST_50.id, id: "g5" }),
    ];
    const utils = await renderEdit("entry");
    expect(goalBadges(utils)).toEqual([]);
    utils.unmount();
    h.goalQuery.data = [goal({ status: "achieved", target_time: 27.5 })];
    const utils2 = await renderEdit("entry");
    await waitFor(() => expect(goalBadges(utils2)).toEqual([goalText("27.50")]));
  });

  it("新規作成 (大会 id なし・未保存) では、目標があっても出ない", async () => {
    h.goalQuery.data = [goal()];
    // 本人 (user-1) としてログイン済みにして、「未保存だから出ない」だけが表示を決める状態にする
    const utils = await renderEntryTab();
    utils.unmount();
    h.mockUseAuth.mockReturnValue({
      supabase: makeSupabase(),
      user: { id: "user-1" },
      subscription: null,
      getAccessToken: vi.fn(async () => "token"),
    });
    h.mockUseRoute.mockReturnValue({ params: { date: FUTURE_DATE, initialTab: "entry" } });
    const created = render(<CompetitionTabFormScreen />, { wrapper: createQueryWrapper() });
    await created.findByTestId("entry-item-tabs");
    await waitFor(() =>
      expect((created.queryByTestId("entry-style-1-current") as HTMLElement | null)?.textContent).toBe(
        String(STYLE_FREE_50.id),
      ),
    );
    expect(goalBadges(created)).toEqual([]);
  });

  it("目標フックが失敗 (data 無し) でも画面は描画され、バッジは出ない", async () => {
    h.goalQuery = { data: undefined, isError: true, isPending: false };
    const utils = await renderEdit("entry");
    expect(goalBadges(utils)).toEqual([]);
  });
});

describe("CompetitionTabFormScreen — 目標バッジ (M1' 記録行)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.goalQuery = { data: [], isError: false, isPending: false };
    h.goalOptionsSeen = [];
  });

  it("記録行 (引き継ぎなし) に出る", async () => {
    h.goalQuery.data = [goal()];
    const utils = await renderEdit("record", false);
    await waitFor(() => expect(goalBadges(utils)).toEqual([goalText("28.50")]));
  });

  it("引き継ぎあり (is_relaying=true) の記録行には、目標があっても出ない", async () => {
    h.goalQuery.data = [goal()];
    const utils = await renderEdit("record", true);
    expect(goalBadges(utils)).toEqual([]);
  });

  it("目標が無ければ記録行にも出ない / 別大会の目標は出ない", async () => {
    h.goalQuery.data = [goal({ competition_id: "comp-OTHER" })];
    const utils = await renderEdit("record", false);
    expect(goalBadges(utils)).toEqual([]);
  });
});

describe("CompetitionTabFormScreen — 目標バッジの位置 (badgeColumn)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.goalQuery = { data: [goal()], isError: false, isPending: false };
    h.goalOptionsSeen = [];
  });
  const BEST = ja.forms.recordLog.bestTimeLabel;

  for (const tab of ["entry", "record"] as const) {
    const label = tab === "entry" ? "M1 エントリー行" : "M1' 記録行";
    it(`${label}: ベストと目標は同じ縦並びコンテナ (badgeColumn) の子で、目標がベストの直後`, async () => {
      const utils = await renderEdit(tab, false, { best: [bestFixture(27)], noEntries: tab === "record" });
      await waitFor(() => expect(goalBadges(utils)).toHaveLength(1));
      const bestSpan = spanStarting(utils, `${BEST}: `)!;
      const goalSpan = spanStarting(utils, `${GOAL_LABEL}: `)!;
      expect(bestSpan).toBeDefined();
      const col = columnOf(goalSpan);
      expect(columnOf(bestSpan)).toBe(col);
      expect(col.style.gap).not.toBe("");
      expect(col.children).toHaveLength(2);
      expect(col.children[0]).toBe(badgeOf(bestSpan));
      expect(col.children[1]).toBe(badgeOf(goalSpan));
    });

    it(`${label}: ベストが無いとき、目標は同じ縦並びコンテナの先頭 (ベストの位置) に出る`, async () => {
      const utils = await renderEdit(tab, false, { best: [], noEntries: tab === "record" });
      await waitFor(() => expect(goalBadges(utils)).toHaveLength(1));
      const goalSpan = spanStarting(utils, `${GOAL_LABEL}: `)!;
      const col = columnOf(goalSpan);
      expect(col.style.gap).not.toBe("");
      expect(col.children).toHaveLength(1);
      expect(col.children[0]).toBe(badgeOf(goalSpan));
    });
  }

  it("M1': ベストもエントリータイムも無く目標だけのとき、バッジ行が消えず目標が出る (外側の表示条件に目標が含まれる)", async () => {
    const utils = await renderEdit("record", false, { best: [], noEntries: true });
    await waitFor(() => expect(goalBadges(utils)).toEqual([goalText("28.50")]));
    expect(spanStarting(utils, `${BEST}: `)).toBeUndefined();
  });
});
