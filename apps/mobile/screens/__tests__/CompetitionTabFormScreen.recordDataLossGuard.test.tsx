/**
 * CompetitionTabFormScreen — レースレコードのデータ消失ガード
 *
 * 背景 (UI レビュー照合で見つかった実害):
 *   1. 編集中に既存記録のタイムを消して保存すると、validRecords (styleId && time>0) から
 *      外れて diffRecordDraft の deletes に入り、確認なしで DB から削除されていた。
 *      タイムが空の新規記録に入れたスプリット・メモ等も黙って捨てられていた。
 *   2. 既存記録の途中スプリットを全部消して保存しても、replaceSplitTimes が
 *      「0 件なら呼ばない」ため DB に古いスプリットが残っていた。
 *   3. 記録サブタブの × が確認なしで即削除していた。
 *
 * 観測点: 保存系ミューテーションの呼び出し回数と実引数 (件数は厳密一致)。
 * モック構成は CompetitionTabFormScreen.teamAdminOriginEdit.test.tsx を土台にしている。
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";
import { createQueryWrapper } from "../../__tests__/helpers/testUtils";

configure({ testIdAttribute: "testID" });

const h = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
  navigationObject: {} as Record<string, unknown>,
  mockUseAuth: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockCreateRecordMutateAsync: vi.fn(),
  mockUpdateRecordMutateAsync: vi.fn(),
  mockDeleteRecordMutateAsync: vi.fn(),
  mockReplaceSplitTimesMutateAsync: vi.fn(),
  mockRecordApiGetRecords: vi.fn(),
  mockStyleApiGetStyles: vi.fn(),
}));

h.navigationObject = {
  navigate: vi.fn(),
  goBack: vi.fn(),
  popTo: vi.fn(),
  popToTop: vi.fn(),
  setOptions: vi.fn(),
};

vi.mock("@apps/shared/hooks/queries/goalTargets", () => ({
  useGoalTargetsQuery: () => ({ data: [], isError: false, isPending: false }),
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
    // 共通モックの TextInput は onChange を onChangeText へ渡さないため、入力変更を
    // 画面のハンドラ (handleRecordTimeChange 等) へ届ける版に差し替える
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
        ...(typeof testID === "string" ? { testID } : {}),
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
        onBlur: () => onBlur?.(),
      }),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: h.mockUseRoute,
  useNavigation: () => h.navigationObject,
  usePreventRemove: () => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: h.mockUseAuth,
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: h.mockUpdateMutateAsync }),
  useCreateRecordMutation: () => ({ mutateAsync: h.mockCreateRecordMutateAsync }),
  useUpdateRecordMutation: () => ({ mutateAsync: h.mockUpdateRecordMutateAsync }),
  useDeleteRecordMutation: () => ({ mutateAsync: h.mockDeleteRecordMutateAsync }),
  useReplaceSplitTimesMutation: () => ({ mutateAsync: h.mockReplaceSplitTimesMutateAsync }),
  useBestTimesQuery: () => ({ data: [] }),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({ profile: null }),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(function () {
    return {
      getEntriesByCompetition: vi.fn(async () => []),
      createTeamEntry: vi.fn(),
      createPersonalEntry: vi.fn(),
      updateEntry: vi.fn(),
      deleteEntry: vi.fn(),
    };
  }),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(function () {
    return { getRecords: h.mockRecordApiGetRecords };
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(function () {
    return { getStyles: h.mockStyleApiGetStyles };
  }),
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
const COMPETITION_ID = "comp-7301";
const USER_ID = "swimmer-7302";
const RECORD_WITH_SPLIT_ID = "rec-7303";
const RECORD_PLAIN_ID = "rec-7304";

const STYLE_100FR = { id: 2, name_jp: "100m自由形", name: "100m Freestyle", style: "Fr", distance: 100 };

const TODAY = new Date().toISOString().slice(0, 10);

const competitionRow = {
  id: COMPETITION_ID,
  date: TODAY,
  end_date: null as string | null,
  title: "データ消失ガード検証大会",
  place: "検証プール",
  pool_type: 1,
  note: "",
  image_paths: [] as string[],
  team_id: null as string | null,
  user_id: USER_ID,
};

/** 途中スプリット (50m 30.50) を持つ既存記録。タイム 1:01.23 */
const recordWithSplit = {
  id: RECORD_WITH_SPLIT_ID,
  competition_id: COMPETITION_ID,
  style_id: STYLE_100FR.id,
  time: 61.23,
  is_relaying: false,
  split_times: [{ id: "split-7305", record_id: RECORD_WITH_SPLIT_ID, distance: 50, split_time: 30.5 }],
  note: null,
  reaction_time: null,
  video_path: null,
  video_thumbnail_path: null,
};

/** スプリットを持たない既存記録。タイム 59.87 */
const recordPlain = {
  id: RECORD_PLAIN_ID,
  competition_id: COMPETITION_ID,
  style_id: STYLE_100FR.id,
  time: 59.87,
  is_relaying: false,
  split_times: [],
  note: null,
  reaction_time: null,
  video_path: null,
  video_thumbnail_path: null,
};

function makeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => {
            if (table === "competitions" && cols === "*") return { data: competitionRow, error: null };
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

async function renderEditScreenOnRecordTab() {
  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(),
    user: { id: USER_ID },
    subscription: null,
    getAccessToken: vi.fn(async () => "test-access-token"),
  });
  h.mockUseRoute.mockReturnValue({
    params: { competitionId: COMPETITION_ID, date: TODAY },
  });
  const Wrapper = createQueryWrapper();
  const utils = render(<CompetitionTabFormScreen />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByDisplayValue(competitionRow.title)).toBeTruthy());
  fireEvent.click(screen.getByText("レースレコード"));
  return utils;
}

function pressSave() {
  fireEvent.click(screen.getByText("保存して終了"));
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.mockStyleApiGetStyles.mockResolvedValue([STYLE_100FR]);
  h.mockUpdateMutateAsync.mockResolvedValue({ id: COMPETITION_ID });
  h.mockCreateRecordMutateAsync.mockResolvedValue({ id: "rec-new-7306" });
  h.mockUpdateRecordMutateAsync.mockResolvedValue({});
  h.mockDeleteRecordMutateAsync.mockResolvedValue(undefined);
  h.mockReplaceSplitTimesMutateAsync.mockResolvedValue(undefined);
});

describe("既存記録のタイムを消して保存", () => {
  it("[RDL-1] 保存を止めて「タイムを入力してください」を出し、記録を DB から削除しない", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordPlain]);
    await renderEditScreenOnRecordTab();

    fireEvent.change(await screen.findByDisplayValue("59.87"), { target: { value: "" } });
    pressSave();

    expect(await screen.findByText("タイムを入力してください")).toBeTruthy();
    await flushAsync();
    expect(h.mockDeleteRecordMutateAsync).toHaveBeenCalledTimes(0);
    expect(h.mockUpdateRecordMutateAsync).toHaveBeenCalledTimes(0);
    expect(h.mockUpdateMutateAsync).toHaveBeenCalledTimes(0);
  });

  it("[RDL-2] エラーのある記録が表示中でなくても、その記録のタブを開いてエラーを見せる", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordPlain, recordWithSplit]);
    await renderEditScreenOnRecordTab();

    // 記録 1 (59.87) のタイムを消してから、記録 2 を表示した状態で保存する
    fireEvent.change(await screen.findByDisplayValue("59.87"), { target: { value: "" } });
    fireEvent.click(screen.getByText("記録 2"));
    expect(await screen.findByDisplayValue("1:01.23")).toBeTruthy();
    pressSave();

    expect(await screen.findByText("タイムを入力してください")).toBeTruthy();
    // 記録 1 の入力欄 (タイムが空) が表示されている = 記録 1 に切り替わった
    expect(screen.queryByDisplayValue("1:01.23")).toBeNull();
    expect(h.mockDeleteRecordMutateAsync).toHaveBeenCalledTimes(0);
  });
});

describe("既存記録の途中スプリットを全部消して保存", () => {
  it("[RDL-3] 空配列で replaceSplitTimes を呼び、DB のスプリットを消す", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordWithSplit]);
    await renderEditScreenOnRecordTab();

    fireEvent.change(await screen.findByDisplayValue("30.50"), { target: { value: "" } });
    pressSave();

    await waitFor(() => expect(h.mockUpdateRecordMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.mockReplaceSplitTimesMutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mockReplaceSplitTimesMutateAsync).toHaveBeenCalledWith({
      recordId: RECORD_WITH_SPLIT_ID,
      splitTimes: [],
    });
    expect(h.mockDeleteRecordMutateAsync).toHaveBeenCalledTimes(0);
  });

  it("[RDL-4] 対照: スプリットを触らなければ既存スプリットのまま書き戻す", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordWithSplit]);
    await renderEditScreenOnRecordTab();
    await screen.findByDisplayValue("30.50");

    pressSave();

    await waitFor(() => expect(h.mockReplaceSplitTimesMutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mockReplaceSplitTimesMutateAsync).toHaveBeenCalledWith({
      recordId: RECORD_WITH_SPLIT_ID,
      splitTimes: [{ distance: 50, split_time: 30.5 }],
    });
  });

  it("[RDL-5] 対照: 読み込み時にスプリットが無く今も無い記録では replaceSplitTimes を呼ばない", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordPlain]);
    await renderEditScreenOnRecordTab();
    await screen.findByDisplayValue("59.87");

    pressSave();

    await waitFor(() => expect(h.mockUpdateRecordMutateAsync).toHaveBeenCalledTimes(1));
    await flushAsync();
    expect(h.mockReplaceSplitTimesMutateAsync).toHaveBeenCalledTimes(0);
  });
});

describe("最終地点のスプリット行 (タイムから自動で作る行)", () => {
  it("[RDL-7] タイムを消すと、古いタイムを表示していた最終地点の行も消える", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordPlain]);
    await renderEditScreenOnRecordTab();

    // タイムを入れ直すと、最終地点 (100m) のスプリット行が同じ値で作られる
    fireEvent.change(await screen.findByDisplayValue("59.87"), { target: { value: "1:01.00" } });
    await waitFor(() => expect(screen.getAllByDisplayValue("1:01.00")).toHaveLength(2));

    // タイム欄で消す (同じ値を表示している最終地点の行ではなく)
    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "" } });

    await waitFor(() => expect(screen.queryAllByDisplayValue("1:01.00")).toHaveLength(0));
  });
});

describe("記録サブタブの ×", () => {
  it("[RDL-6] 既存記録の × は確認を出し、確定するまで消さない。確定して保存したときだけ DB から削除する", async () => {
    h.mockRecordApiGetRecords.mockResolvedValue([recordPlain, recordWithSplit]);
    const utils = await renderEditScreenOnRecordTab();
    await screen.findByDisplayValue("59.87");

    fireEvent.click(utils.getByTestId("item-tab-remove-2"));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe("記録 2を削除しますか？");
    // 確定前はタブが残っている
    expect(screen.getByText("記録 2")).toBeTruthy();

    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    act(() => buttons.find((b) => b.style === "destructive")?.onPress?.());
    await waitFor(() => expect(screen.queryByText("記録 2")).toBeNull());

    pressSave();
    await waitFor(() => expect(h.mockDeleteRecordMutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mockDeleteRecordMutateAsync).toHaveBeenCalledWith(RECORD_WITH_SPLIT_ID);
  });
});
