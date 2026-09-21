/**
 * CompetitionTabFormScreen — エントリータブ「ベストタイムを流用」ボタン (Sprint Contract v2)
 *
 * スコープ: Deliverable D3 (app-developer)。Sprint Contract §5 SC4 (ダッシュボード経由・
 * チーム画面経由の両方) に対応する。PM 実測により両経路ともこの1画面に集約済みのため、
 * 画面レベルでは経路を区別しない。
 *
 * UI 契約 (Sprint Contract §4 mobile / メモリ規約):
 * - ボタンは Pressable。ラベル Text = 訳文 (competition.entries.bestTimePrefillButton)
 * - 【メモリ規約: RNモックtestIDはTextInputのみ】Pressable/Text/View は testID で引けない。
 *   ボタン・警告は getByRole("button", { name }) / getByText で引く。
 * - エントリータイム入力欄 (TextInput) は getByPlaceholderText("2.00.00") で引く。
 *
 * ハーネス: entryValidationAndDuplicate.test.tsx / linkedRowStyleId.test.tsx とほぼ同一構成。
 */

import React from "react";
import { render, fireEvent, waitFor, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

configure({ testIdAttribute: "testID" });

const h = vi.hoisted(() => ({
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

// TextInput の onChangeText/onBlur を DOM の onChange/onBlur に結線し直す
// (entryValidationAndDuplicate.test.tsx と同じ方式。共有モック自体は変更しない)。
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

function makeBestTime(overrides: Partial<BestTimeFixture>): BestTimeFixture {
  return {
    id: "bt-1",
    style_id: STYLE_FREE_50.id,
    time: 28.5,
    pool_type: 0,
    is_relaying: false,
    style: { name_jp: "50m自由形", distance: 50 },
    ...overrides,
  };
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

function prefillButton(utils: Utils): HTMLElement {
  return utils.getByRole("button", { name: "ベストタイムを流用" });
}

function timeInput(utils: Utils): HTMLInputElement {
  return utils.getByPlaceholderText("2.00.00") as HTMLInputElement;
}

describe("CompetitionTabFormScreen — ベストタイムを流用ボタン [M1]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[SC4] entryBestTime が存在する行でボタンを押すと、入力欄の値が formatTimeBest(entryBestTime.time) と一致する", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 28.5 })]);

    const button = prefillButton(utils);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    expect(timeInput(utils).value).toBe("28.50");
  });

  it("[SC5][境界: styleId 空] 種目未選択の行ではボタンが disabled (押しても入力欄が変化しない)", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 28.5 })]);

    fireEvent.click(await utils.findByTestId("entry-style-1-clear"));

    const button = prefillButton(utils);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(timeInput(utils).value).toBe("");
  });

  it("[SC5][境界: ベストタイム0件] bestTimes=[] のときバッジが表示されず、ボタンが disabled", async () => {
    const utils = await renderEntryTab([]);

    expect(utils.queryByText(/^ベストタイム[:(]/)).toBeNull();
    const button = prefillButton(utils);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  // 【裁定8 (Sprint Contract v3)】records.time は numeric(10,2) NOT NULL だが
  // CHECK(time > 0) が無いため time=0 の記録が DB 制約上排除されない。
  it("[裁定8][境界: ベストタイム time=0] bestTimes に time=0 の記録がある場合もボタンが disabled", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 0 })]);

    const button = prefillButton(utils);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("[SC6 中核][境界: 他水路のみ] 同水路の記録が無く他水路の非リレーのみ存在する fixture で、バッジ値とボタン押下後の入力欄の値が完全一致する", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 31.2, pool_type: 1 })]);

    // バッジの label は @/components/records (apps/mobile/components/records/
    // bestTimeForEntry.ts) が shared の labelKey に "forms.recordLog." を前置した
    // フルキーを返すため、t() が正しく訳文を返す (裁定1の前提: バッジが出所を明示する)。
    await utils.findByText("ベストタイム(長水路): 31.20");

    fireEvent.click(prefillButton(utils));
    expect(timeInput(utils).value).toBe("31.20");
  });

  it("[SC7] ボタン押下直後は未編集警告テキストが表示され、入力欄を書き換えると消える", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 28.5 })]);

    fireEvent.click(prefillButton(utils));
    expect(utils.getByText("ベストタイム自動入力")).toBeTruthy();

    fireEvent.change(timeInput(utils), { target: { value: "40.00" } });
    expect(utils.queryByText("ベストタイム自動入力")).toBeNull();
  });

  it("[SC6 非可逆値での確認] time=68.04 で、押下直後の入力欄表示値とバッジ値が厳密一致 (toBe。toBeCloseTo禁止) する", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 68.04 })]);

    await utils.findByText("ベストタイム: 1:08.04");

    fireEvent.click(prefillButton(utils));
    expect(timeInput(utils).value).toBe("1:08.04");
  });

  it("[SC12/裁定2改訂(v2)・ラッチ実証] 押下→警告あり→1文字入力→警告消滅→プリフィル値と同じ文字列を打ち直す→警告は復活しない", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 28.5 })]);

    fireEvent.click(prefillButton(utils));
    expect(utils.getByText("ベストタイム自動入力")).toBeTruthy();

    const input = timeInput(utils);
    fireEvent.change(input, { target: { value: "28.5X" } });
    expect(utils.queryByText("ベストタイム自動入力")).toBeNull();

    fireEvent.change(input, { target: { value: "28.50" } });
    expect(utils.queryByText("ベストタイム自動入力")).toBeNull();
  });

  it("[SC8/裁定2] StyleChipSelector で種目を変更すると未編集警告が消える", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 28.5 })]);

    fireEvent.click(prefillButton(utils));
    expect(utils.getByText("ベストタイム自動入力")).toBeTruthy();

    fireEvent.click(await utils.findByTestId(`entry-style-1-option-${STYLE_BREAST_50.id}`));
    expect(utils.queryByText("ベストタイム自動入力")).toBeNull();
  });

  it("[§6 境界 v2 新設: 水路切替] 押下後、水路を切り替えると未編集警告が消える", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 28.5, pool_type: 0 })]);

    fireEvent.click(prefillButton(utils));
    expect(utils.getByText("ベストタイム自動入力")).toBeTruthy();

    // プール種別 Pressable は「大会」基本タブ側にあるため、いったんタブを切り替える
    fireEvent.click(await utils.findByText("大会"));
    fireEvent.click(await utils.findByText("長水路 (50m)"));

    fireEvent.click(await utils.findByText("エントリー"));
    await utils.findByTestId("entry-item-tabs");
    expect(utils.queryByText("ベストタイム自動入力")).toBeNull();
  });

  it("[境界: リレー行] isRelaying=true (Switch ON) の行でボタンを押すと、isRelaying=true 優先順位に従った値が入る", async () => {
    const utils = await renderEntryTab([
      makeBestTime({ time: 30, pool_type: 0, is_relaying: false, relayingTime: { time: 29 } }),
    ]);

    fireEvent.click(await utils.findByTestId("entry-style-1-relay"));
    await waitFor(() =>
      expect(utils.getByTestId("entry-style-1-relay").getAttribute("data-value")).toBe("true"),
    );

    await utils.findByText("ベストタイム(引継): 29.00");

    fireEvent.click(prefillButton(utils));
    expect(timeInput(utils).value).toBe("29.00");
  });

  it("[境界: 複数エントリー行] ItemTabs で2行目に切り替えてボタンを押しても、1行目の入力欄の値は変化しない", async () => {
    const utils = await renderEntryTab([
      makeBestTime({ id: "bt-fr", time: 28.5, style: { name_jp: "50m自由形", distance: 50 } }),
      makeBestTime({
        id: "bt-br",
        time: 40.1,
        style_id: STYLE_BREAST_50.id,
        style: { name_jp: "50m平泳ぎ", distance: 50 },
      }),
    ]);

    fireEvent.click(prefillButton(utils));
    expect(timeInput(utils).value).toBe("28.50");

    fireEvent.click(utils.getByTestId("item-tab-add"));
    await waitFor(() =>
      expect((utils.queryByTestId("entry-style-2-current") as HTMLElement | null)?.textContent).toBe(
        String(STYLE_FREE_50.id),
      ),
    );
    fireEvent.click(utils.getByTestId(`entry-style-2-option-${STYLE_BREAST_50.id}`));
    await waitFor(() =>
      expect((utils.queryByTestId("entry-style-2-current") as HTMLElement | null)?.textContent).toBe(
        String(STYLE_BREAST_50.id),
      ),
    );

    fireEvent.click(prefillButton(utils));
    expect(timeInput(utils).value).toBe("40.10");

    fireEvent.click(utils.getByTestId("item-tab-1"));
    expect(timeInput(utils).value).toBe("28.50");
  });

  // ---------------------------------------------------------------------------
  // 【PM 追加指示・Reviewer 検出 → 修正A で解消済み】mobile 固有だった非対称性バグ:
  // 修正前は applyEntryBestTimePrefill が entryTimeDisplayValue しか渡していなかったため、
  // updateEntry の再パース分岐 (`"entryTimeDisplayValue" in updates` で無条件に
  // entryTime = parseTimeFlexible(...) へ上書き) が発火し、entry.entryTime が
  // parseTimeFlexible("1:08.04") = 68.03999999999999 になっていた (バッジの生値 68.04 とズレる)。
  // 表示は formatTimeBest の丸めで "1:08.04" に揃うため、入力欄の表示値だけを assert する
  // テストではこの穴を検出できない構造だった。
  // 【修正A (app-developer)】applyEntryBestTimePrefill が entryTime を直接渡すように変更し、
  // updateEntry 側は「entryTime が明示的に渡された場合はその代入をガードする」形に修正済み。
  // PM 実測 (`vitest run .../CompetitionTabFormScreen.bestTimePrefill.test.tsx` → 12 passed) 済み。
  // このテストは保存時に entryApi へ渡る entry_time の生値を厳密一致 (toBe。toBeCloseTo 禁止)
  // で検証し、回帰を検出するガードとして残す。
  // ---------------------------------------------------------------------------
  it("[裁定1/SC6・mobile固有バグの回帰防止] 押下→保存すると、entryApi に渡る entry_time はバッジの生値 68.04 と厳密一致する", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 68.04 })]);

    fireEvent.click(prefillButton(utils));
    expect(timeInput(utils).value).toBe("1:08.04");

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(1));
    const payload = h.mockEntryApiCreatePersonalEntry.mock.calls[0]![0] as { entry_time: number };
    expect(payload.entry_time).toBe(68.04);
  });

  // ---------------------------------------------------------------------------
  // 【PM 裁定6 (Sprint Contract v3) / Reviewer 指摘のカバレッジ穴】
  // mobile にも blur を経由するテストが無かった。「プリフィル押下 → タイム欄を編集せず
  // blur → 保存」の経路を追加する。handleEntryTimeBlur は `parseTimeFlexible(表示文字列)` で
  // entry.entryTime を再計算するため、JS state レベルでは 68.04 と 1 ULP ずれることがあるが
  // (PM 裁定6: 直さない。手入力にも等しく起きるアプリ共通の挙動のため)、
  // `records.time` は `numeric(10,2) NOT NULL`
  // (supabase/migrations/20251201014342_initial_schema.sql:764) のため、
  // DB へ渡る永続化値は丸められて 68.04 と一致する。
  // ---------------------------------------------------------------------------
  it("[裁定1/SC6 (b)・blur経路] 押下→タイム欄を編集せず blur→保存しても、entryApi に渡る entry_time は numeric(10,2) 換算で 68.04 と一致する", async () => {
    const utils = await renderEntryTab([makeBestTime({ time: 68.04 })]);

    fireEvent.click(prefillButton(utils));
    const input = timeInput(utils);
    expect(input.value).toBe("1:08.04");

    fireEvent.blur(input);

    fireEvent.click(await utils.findByTestId("competition-tab-form-save"));

    await waitFor(() => expect(h.mockEntryApiCreatePersonalEntry).toHaveBeenCalledTimes(1));
    const payload = h.mockEntryApiCreatePersonalEntry.mock.calls[0]![0] as { entry_time: number };
    // numeric(10,2) の丸め (小数第2位) を Math.round で再現し、DB 到達後の値が
    // 68.04 と一致することを確認する。
    expect(Math.round(payload.entry_time * 100) / 100).toBe(68.04);
  });
});
