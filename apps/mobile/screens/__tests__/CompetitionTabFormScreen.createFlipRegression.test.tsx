/**
 * CompetitionTabFormScreen.createFlipRegression.test.tsx
 *
 * Sprint Contract v3 [BC-2] / D3 — 「新規作成側 (handleAdd) にも origin を付ける」ことの
 * 再発防止テスト。`PracticeTabFormScreen.createFlipRegression.test.tsx` の大会版。
 *
 * ■ 再発シナリオ
 *   `CompetitionTabFormScreen.tsx`
 *     const [resolvedCompetitionId, setResolvedCompetitionId] = useState(initialCompetitionId);
 *     const isEditMode = !!resolvedCompetitionId;
 *   保存時、親 INSERT 成功直後に `setResolvedCompetitionId(newCompetition.id)` が走る。
 *   つまり `isEditMode` は route params ではなく **state 由来**で、新規作成の保存中に
 *   false→true へ転落しうる。直後の子処理 (画像アップロード) が失敗すると画面は閉じずに
 *   残り、`isEditMode` だけが true になる。
 *   このとき route params に `origin: "teamAdmin"` が無いと
 *   `canEditCompetitionDetails` が `origin === "teamAdmin" && admin` で false に転落し、
 *   作った直後の大会が自分の目の前でグレーアウトする。続けて編集して再保存しても
 *   `if (canEditCompetitionDetails)` ガードで親 UPDATE が**無言で破棄される**。
 *
 * ■ 検証内容 (「保存できた」ではなく mutateAsync の実引数まで見る)
 *   1. 管理者ビューの「追加」相当 (origin: "teamAdmin" + teamId、competitionId 無し) で開く
 *   2. 画像を1枚追加して保存 → 親 INSERT は成功するが画像アップロードが失敗し画面が残る
 *   3. flip 後も大会名入力欄が disabled にならず、制限バナーも出ない
 *   4. 再編集して保存 → updateCompetitionMutation に編集後の値が乗る
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
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
  mockRecordApiGetRecords: vi.fn(),
  mockStyleApiGetStyles: vi.fn(),
  // 実物の useTeamMembersQuery は data/isLoading/**isError**/**refetch** を返す。
  // 各テストが明示しなかったフィールドは下のラッパーで「正常系の既定値」を埋める
  // (undefined のまま返すと画面側の isError 分岐が「たまたま falsy」で通り、
  //  High-1(a) で追加された ErrorView 経路の退行を検出できなくなる)。
  mockRefetchTeamMembers: vi.fn(),
  teamMembersQueryCalls: [] as Array<string | undefined>,
  mockUseTeamMembersQuery: vi.fn(),
  mockUploadImagesViaApi: vi.fn(),
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
  usePreventRemove: h.mockUsePreventRemove,
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
    createTeamEntry: vi.fn(),
    createPersonalEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
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

// 画像を1枚追加するボタンだけを持つスタブ (fixture は固定)
const NEW_IMAGE_FIXTURE = {
  uri: "file://bc2-flip-regression.jpg",
  base64: "base64-bc2-flip-regression",
  fileExtension: "jpg",
};

vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: ({
    onImagesChange,
  }: {
    onImagesChange: (
      newFiles: { uri: string; base64: string; fileExtension: string }[],
      deletedIds: string[],
    ) => void;
  }) => <button onClick={() => onImagesChange([NEW_IMAGE_FIXTURE], [])}>画像を1枚追加</button>,
}));
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
  uploadImagesViaApi: (...args: unknown[]) => h.mockUploadImagesViaApi(...args),
  deleteImages: vi.fn(async () => {}),
  resolveGalleryImages: vi.fn(async () => []),
  mergeImagePaths: vi.fn((saved: string[]) => saved),
}));
vi.mock("@/utils/videoUpload", () => ({ uploadVideo: vi.fn(async () => {}) }));

import { Alert } from "react-native";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

const TEAM_ID = "team-8702";
const ADMIN_VIEWER_ID = "roster-admin-8701";
const NEW_COMPETITION_ID = "comp-8703-created";
const TODAY = format(new Date(), "yyyy-MM-dd");
const EDIT_RESTRICTED_MESSAGE = "この大会の情報はチーム管理者のみ編集できます";

/** 親 INSERT で「DB に入った」行。flip 後の再取得はこれを返す */
let createdRow: Record<string, unknown> | null = null;

function makeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: ADMIN_VIEWER_ID } }, error: null })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn((_col: string, id: string) => ({
          single: vi.fn(async () => {
            if (table === "competitions" && createdRow && id === NEW_COMPETITION_ID) {
              if (cols === "pool_type") {
                return { data: { pool_type: createdRow.pool_type }, error: null };
              }
              return { data: createdRow, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function titleInput(): HTMLInputElement {
  return screen.getByPlaceholderText("例: 全国大会, 対抗戦, タイムトライアル") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  createdRow = null;

  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(),
    user: { id: ADMIN_VIEWER_ID },
    subscription: null,
    getAccessToken: vi.fn(async () => "test-access-token"),
  });
  // 管理者ビューの「追加」相当: competitionId 無し + teamId + origin
  h.mockUseRoute.mockReturnValue({
    params: { date: TODAY, teamId: TEAM_ID, origin: "teamAdmin" },
  });
  h.mockUseTeamMembersQuery.mockReturnValue({
    data: [{ user_id: ADMIN_VIEWER_ID, role: "admin" }],
    isLoading: false,
  });
  h.mockUseUserQuery.mockReturnValue({ profile: null });
  h.mockUseBestTimesQuery.mockReturnValue({ data: [] });
  h.mockUsePreventRemove.mockImplementation(() => {});
  h.mockStyleApiGetStyles.mockResolvedValue([
    { id: 1, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
  ]);
  h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]);
  h.mockRecordApiGetRecords.mockResolvedValue([]);
  h.mockCreateMutateAsync.mockImplementation(async (formData: Record<string, unknown>) => {
    createdRow = {
      id: NEW_COMPETITION_ID,
      end_date: null,
      image_paths: [],
      ...formData,
    };
    return { id: NEW_COMPETITION_ID, ...formData };
  });
  h.mockUpdateMutateAsync.mockResolvedValue({ id: NEW_COMPETITION_ID });
  vi.mocked(Alert.alert).mockClear();
});

describe("CompetitionTabFormScreen — [BC-2] 新規作成中に isEditMode が flip しても編集可能なまま (D3)", () => {
  it("新規作成 → 画像アップロード失敗で isEditMode が flip → 基本情報は編集可能のまま → 再編集して保存すると UPDATE に編集後の値が乗る", async () => {
    // 1回目: 画像アップロードが失敗する (親 INSERT は成功済み = flip 済みの状態を作る)
    h.mockUploadImagesViaApi.mockRejectedValueOnce(new Error("network hiccup"));

    const Wrapper = createQueryWrapper();
    render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

    fireEvent.change(titleInput(), { target: { value: "BC2管理者追加フロー初回大会名" } });
    fireEvent.click(screen.getByText("画像を1枚追加"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("competition-tab-form-save"));
      await flushAsync();
    });

    // 親 INSERT は成功している = resolvedCompetitionId が flip 済み
    expect(h.mockCreateMutateAsync).toHaveBeenCalledTimes(1);
    const [createdFormData] = h.mockCreateMutateAsync.mock.calls[0] as [Record<string, unknown>];
    expect(createdFormData.team_id).toBe(TEAM_ID);
    // 画面は閉じていない (戻り先へ遷移していない)
    expect(h.mockGoBack).toHaveBeenCalledTimes(0);
    expect(h.mockPopTo).toHaveBeenCalledTimes(0);
    expect(vi.mocked(Alert.alert)).toHaveBeenCalled();

    // flip 後の再取得 (init effect が resolvedCompetitionId 変化で再実行される) を待つ
    await waitFor(() =>
      expect(screen.getByDisplayValue("BC2管理者追加フロー初回大会名")).toBeTruthy(),
    );

    // [BC-2 の核心] flip 後も基本情報が disabled になっていない (origin が残っている)
    expect(titleInput().disabled).toBe(false);
    expect(screen.queryByText(EDIT_RESTRICTED_MESSAGE)).toBeNull();

    // 2回目: 画像アップロードは成功させる
    h.mockUploadImagesViaApi.mockResolvedValue([{ path: "competition/8703/retry.jpg" }]);

    fireEvent.change(titleInput(), { target: { value: "BC2flip後の再編集大会名" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("competition-tab-form-save"));
      await flushAsync();
    });

    // 「保存できた」ではなく、UPDATE の実引数に編集後の値が乗っていることを見る
    // (canEditCompetitionDetails が false に落ちていると無言スキップされ、ここが赤くなる)
    const matching = h.mockUpdateMutateAsync.mock.calls.find((call: unknown[]) => {
      const arg = call[0] as { id: string; updates: Record<string, unknown> };
      return arg.id === NEW_COMPETITION_ID && arg.updates.title === "BC2flip後の再編集大会名";
    });
    expect(
      matching,
      "flip 後の再保存で updateCompetitionMutation に編集後の title が渡っていない " +
        "(= canEditCompetitionDetails が false に落ちて無言スキップされている疑い)",
    ).toBeTruthy();
  });

  it("[BC-2 対照] origin を渡さないと、flip 後に基本情報がグレーアウトし再保存の UPDATE が無言で捨てられる", async () => {
    // D3 が無かった場合 (handleAdd が origin を渡さない) に何が起きるかを固定する対照。
    // このケースが「編集可能のまま」になったら、origin 以外の何かで許可が出ている =
    // 上のケースが origin の効果を検証できていないことになる。
    h.mockUseRoute.mockReturnValue({ params: { date: TODAY, teamId: TEAM_ID } });
    h.mockUploadImagesViaApi.mockRejectedValueOnce(new Error("network hiccup"));

    const Wrapper = createQueryWrapper();
    render(<CompetitionTabFormScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId("competition-tab-form-save")).toBeTruthy());

    fireEvent.change(titleInput(), { target: { value: "BC2対照初回大会名" } });
    fireEvent.click(screen.getByText("画像を1枚追加"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("competition-tab-form-save"));
      await flushAsync();
    });

    expect(h.mockCreateMutateAsync).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.getByDisplayValue("BC2対照初回大会名")).toBeTruthy());

    // origin が無いので flip 後に編集不可へ転落する (これが D3 が防いでいる事故)
    expect(titleInput().disabled).toBe(true);
    expect(screen.getByText(EDIT_RESTRICTED_MESSAGE)).toBeTruthy();
  });
});
