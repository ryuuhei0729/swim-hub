/**
 * CompetitionTabFormScreen テスト (Reviewer Critical 修正の QA 検証)
 *
 * 背景: 編集モードの handleSave が無条件に updateCompetitionMutation を呼んでいたため、
 * competitions の UPDATE RLS (user_id = auth.uid() OR is_team_admin(team_id, auth.uid()))
 * を満たさない「チーム大会の非オーナー・非管理者」が保存すると 0 行 → 例外 → catch に落ち、
 * エントリー/レコードの保存にすら到達できなかった。
 *
 * 修正: canEditCompetitionDetails (新規作成/個人大会/オーナー本人/チーム管理者 のみ true) を
 * 導入し、false のときは大会 UPDATE ブロックをスキップしてレコード保存へ進む。
 *
 * 検証観点 (Sprint Contract):
 *   [C-01] 非管理者がチーム大会を保存 → updateCompetitionMutation は呼ばれず、
 *          レコード保存 (updateRecordMutation) は完走する
 *   [C-02] 大会 UPDATE スキップ後も savedCompetitionId 経由の後続処理が正常に完走する
 *          (例外が発生せず navigation.goBack が呼ばれる)
 *   [C-03] 大会オーナー本人 / チーム管理者は従来どおり大会情報を更新できる (非退行)
 *   [C-04] チームメンバー取得中は「読み取り専用 UI」を早出しせず、ローディング表示のままにする
 *   [C-05] 個人大会 (team_id なし) は従来どおり誰でも編集できる (非退行)
 *
 * 注意 (テストの限界):
 *   これは RLS の実挙動 (実際に 0 行になり例外が飛ぶこと) を再現するものではない。
 *   ここで検証しているのは「クライアント側の canEditCompetitionDetails 判定によって
 *   updateCompetitionMutation の呼び出し自体が発生するかどうか」であり、
 *   Supabase 側のモックは常に成功を返すため、RLS 拒否そのものの回帰検知はできない。
 */

import React from "react";
import { render, fireEvent, waitFor, configure } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQueryWrapper } from "../helpers/testUtils";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";

// React Native の Pressable/View 等は `testID` (RN 規約) を渡すが、jsdom はこれを
// `data-testid` ではなく `testid` 属性として反映する。RTL のデフォルトは
// `data-testid` を探すため、このファイルに限定して属性名を切り替える。
configure({ testIdAttribute: "testID" });

// ---------------------------------------------------------------------------
// hoisted モック用のスパイ・状態
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  mockUseRoute: vi.fn(),
  mockNavigate: vi.fn(),
  mockGoBack: vi.fn(),
  mockSetOptions: vi.fn(),
  mockUsePreventRemove: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseTeamMembersQuery: vi.fn(),
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

// ---------------------------------------------------------------------------
// react-native: 共有モックに KeyboardAvoidingView を補う
// (apps/mobile/__mocks__/react-native.ts は未対応。CompetitionTabFormScreen が
//  直接 import しているため、このファイル内だけの上書きで解決する)
// ---------------------------------------------------------------------------
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

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: h.mockUseTeamMembersQuery,
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
  LoadingSpinner: ({ message }: { message?: string }) =>
    React.createElement("div", { testID: "loading-spinner" }, message),
}));

vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/TimeInputHelp", () => ({ TimeInputHelp: () => null }));
vi.mock("@/components/forms/FormTabBar", () => ({ FormTabBar: () => null }));
vi.mock("@/components/forms/ItemTabs", () => ({ ItemTabs: () => null }));
vi.mock("@/components/forms/StyleChipSelector", () => ({ StyleChipSelector: () => null }));
vi.mock("@/components/records", () => ({
  LapTimeDisplay: () => null,
  getBestTimeForEntry: () => null,
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
interface CompetitionRow {
  id: string;
  date: string;
  end_date: string | null;
  title: string | null;
  place: string | null;
  pool_type: number;
  note: string | null;
  image_paths: string[];
  user_id: string;
  team_id: string | null;
}

const RECORD_ROW = {
  id: "rec-1",
  competition_id: "comp-1",
  style_id: 1,
  time: 65.43,
  is_relaying: false,
  split_times: [] as { distance: number; split_time: number }[],
  note: "",
  reaction_time: null as number | null,
  video_path: null as string | null,
  video_thumbnail_path: null as string | null,
};

const STYLE_ROW = {
  id: 1,
  name_jp: "100m自由形",
  name: "100m Freestyle",
  style: "free",
  distance: 100,
};

function makeCompetitionRow(overrides: Partial<CompetitionRow> = {}): CompetitionRow {
  return {
    id: "comp-1",
    date: "2024-01-01", // 過去日 (レコードタブのみ表示させ、エントリータブの複雑な操作を避ける)
    end_date: null,
    title: "テスト大会",
    place: "テストプール",
    pool_type: 0,
    note: "",
    image_paths: [],
    user_id: "owner-1",
    team_id: "team-1",
    ...overrides,
  };
}

function makeSupabase(competitionRow: CompetitionRow): SupabaseClient {
  const supabase = {
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
  };
  return supabase as unknown as SupabaseClient;
}

interface RenderScenarioOptions {
  userId: string;
  competitionRow: CompetitionRow;
  members: Array<{ user_id: string; role: "admin" | "user" }>;
  membersLoading?: boolean;
}

async function renderScenario({
  userId,
  competitionRow,
  members,
  membersLoading = false,
}: RenderScenarioOptions) {
  h.mockUseAuth.mockReturnValue({
    supabase: makeSupabase(competitionRow),
    user: { id: userId },
    subscription: null,
    getAccessToken: vi.fn(async () => "test-token"),
  });
  h.mockUseTeamMembersQuery.mockReturnValue({
    data: membersLoading ? undefined : members,
    isLoading: membersLoading,
  });
  h.mockUseRoute.mockReturnValue({ params: { competitionId: competitionRow.id } });

  const Wrapper = createQueryWrapper();
  return render(<CompetitionTabFormScreen />, { wrapper: Wrapper });
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------
describe("CompetitionTabFormScreen — 編集権限ガード (canEditCompetitionDetails)", () => {
  let updateCompetitionMutateAsync: ReturnType<typeof vi.fn>;
  let updateRecordMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    updateCompetitionMutateAsync = vi.fn(async (args: { id: string; updates: unknown }) => ({
      id: args.id,
      ...(args.updates as Record<string, unknown>),
    }));
    updateRecordMutateAsync = vi.fn(async () => ({}));

    h.mockUseCreateCompetitionMutation.mockReturnValue({ mutateAsync: vi.fn() });
    h.mockUseUpdateCompetitionMutation.mockReturnValue({
      mutateAsync: updateCompetitionMutateAsync,
    });
    h.mockUseCreateRecordMutation.mockReturnValue({
      mutateAsync: vi.fn(async () => ({ id: "new-rec" })),
    });
    h.mockUseUpdateRecordMutation.mockReturnValue({ mutateAsync: updateRecordMutateAsync });
    h.mockUseDeleteRecordMutation.mockReturnValue({ mutateAsync: vi.fn(async () => {}) });
    h.mockUseReplaceSplitTimesMutation.mockReturnValue({ mutateAsync: vi.fn(async () => {}) });
    h.mockUseBestTimesQuery.mockReturnValue({ data: [] });
    h.mockUseUserQuery.mockReturnValue({ profile: null });
    h.mockUsePreventRemove.mockImplementation(() => {});

    h.mockStyleApiGetStyles.mockResolvedValue([STYLE_ROW]);
    h.mockEntryApiGetEntriesByCompetition.mockResolvedValue([]);
    h.mockRecordApiGetRecords.mockResolvedValue([RECORD_ROW]);
  });

  // -------------------------------------------------------------------------
  // [C-01] 非管理者・非オーナーはチーム大会の UPDATE をスキップしてレコード保存は完走する
  // -------------------------------------------------------------------------
  it("[C-01] 非管理者が保存すると updateCompetitionMutation は呼ばれず、レコード保存 (updateRecordMutation) は呼ばれる", async () => {
    const competitionRow = makeCompetitionRow({ user_id: "owner-1", team_id: "team-1" });
    const { findByTestId, findByText } = await renderScenario({
      userId: "user-1",
      competitionRow,
      members: [
        { user_id: "user-1", role: "user" },
        { user_id: "owner-1", role: "admin" },
      ],
    });

    // 非管理者向けの案内バナーが表示されること (C-07 の一部: 読み取り専用の告知)
    await findByText("この大会の情報はチーム管理者のみ編集できます");

    const saveButton = await findByTestId("competition-tab-form-save");
    fireEvent.click(saveButton);

    // [C-02] スキップ後も後続処理が例外を出さず完走し、画面が閉じる (navigation.goBack)
    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalled());

    expect(updateCompetitionMutateAsync).not.toHaveBeenCalled();
    expect(updateRecordMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rec-1" }),
    );
  });

  // -------------------------------------------------------------------------
  // [C-03a] 大会オーナー本人は従来どおり編集できる (非退行)
  // -------------------------------------------------------------------------
  it("[C-03a] 大会オーナー本人が保存すると updateCompetitionMutation が呼ばれる", async () => {
    const competitionRow = makeCompetitionRow({ user_id: "owner-1", team_id: "team-1" });
    const { findByTestId, queryByText } = await renderScenario({
      userId: "owner-1",
      competitionRow,
      // オーナー自身は role が admin でなくても編集できることを確認する
      members: [{ user_id: "owner-1", role: "user" }],
    });

    expect(queryByText("この大会の情報はチーム管理者のみ編集できます")).toBeNull();

    const saveButton = await findByTestId("competition-tab-form-save");
    fireEvent.click(saveButton);

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalled());
    expect(updateCompetitionMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "comp-1" }),
    );
  });

  // -------------------------------------------------------------------------
  // [C-03b] チーム管理者は従来どおり編集できる (非退行)
  // -------------------------------------------------------------------------
  it("[C-03b] チーム管理者 (オーナーではない) が保存すると updateCompetitionMutation が呼ばれる", async () => {
    const competitionRow = makeCompetitionRow({ user_id: "owner-1", team_id: "team-1" });
    const { findByTestId, queryByText } = await renderScenario({
      userId: "admin-1",
      competitionRow,
      members: [
        { user_id: "admin-1", role: "admin" },
        { user_id: "owner-1", role: "admin" },
      ],
    });

    expect(queryByText("この大会の情報はチーム管理者のみ編集できます")).toBeNull();

    const saveButton = await findByTestId("competition-tab-form-save");
    fireEvent.click(saveButton);

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalled());
    expect(updateCompetitionMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "comp-1" }),
    );
  });

  // -------------------------------------------------------------------------
  // [C-05] 個人大会 (team_id なし) は従来どおり編集できる (非退行)
  // -------------------------------------------------------------------------
  it("[C-05] 個人大会 (team_id なし) は編集できる", async () => {
    const competitionRow = makeCompetitionRow({ user_id: "user-1", team_id: null });
    const { findByTestId, queryByText } = await renderScenario({
      userId: "user-1",
      competitionRow,
      members: [],
    });

    expect(queryByText("この大会の情報はチーム管理者のみ編集できます")).toBeNull();

    const saveButton = await findByTestId("competition-tab-form-save");
    fireEvent.click(saveButton);

    await waitFor(() => expect(h.mockGoBack).toHaveBeenCalled());
    expect(updateCompetitionMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "comp-1" }),
    );
  });

  // -------------------------------------------------------------------------
  // [C-04] チームメンバー取得中は読み取り専用 UI を早出しせず、ローディング表示のままにする
  // -------------------------------------------------------------------------
  it("[C-04] チームメンバー取得中はローディング表示のままで、案内バナーも保存ボタンも出ない", async () => {
    const competitionRow = makeCompetitionRow({ user_id: "owner-1", team_id: "team-1" });
    const { findByTestId, queryByTestId, queryByText } = await renderScenario({
      userId: "user-1",
      competitionRow,
      members: [],
      membersLoading: true,
    });

    // ローディング表示のまま
    await findByTestId("loading-spinner");
    // 管理者が一時的に読み取り専用に倒れて見えてしまう退行が無いこと
    expect(queryByText("この大会の情報はチーム管理者のみ編集できます")).toBeNull();
    expect(queryByTestId("competition-tab-form-save")).toBeNull();

    expect(updateCompetitionMutateAsync).not.toHaveBeenCalled();
    expect(updateRecordMutateAsync).not.toHaveBeenCalled();
  });
});
