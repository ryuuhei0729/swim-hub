/**
 * PracticeTabFormScreen — 「テンプレートから作成」と × のデータ消失ガード
 *
 * 背景 (UI レビュー照合で見つかった実害):
 *   - 「テンプレートから作成」は各メニューカードの中にあるのに、全メニューを
 *     テンプレート1件で置き換えていた。入力済みのタイムや他のメニューが確認なしで消え、
 *     編集中なら保存時に既存ログが DB から削除されていた。
 *   - メニューサブタブの × が確認なしで即削除していた。
 *
 * 期待: テンプレートは表示中のメニュー1件の設定欄だけを上書きし、タイム・既存ログ ID・
 * 他のメニューは残す (チーム代理入力 TeamPracticeLogBulkFormScreen と同じ)。
 *
 * 観測点: 保存時の updateLog / deletePracticeLog / replacePracticeTimes の回数と実引数。
 * モック構成は PracticeTabFormScreen.milestoneJudgmentOrder.test.tsx をそのまま流用し、
 * テンプレート選択モーダルだけを「押すと onSelect(TEMPLATE) する」ボタンに差し替えている
 * (モーダル自体はこのテストの検証対象外)。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, configure, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeWithLogs } from "@apps/shared/types";

configure({ testIdAttribute: "testID" });

const mocks = vi.hoisted(() => {
  function makeSupabase() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { image_paths: [] }, error: null }),
          }),
        }),
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
  }

  return {
    routeParams: {
      practiceId: undefined as string | undefined,
      date: undefined as string | undefined,
      teamId: undefined as string | undefined,
      initialTab: undefined as "practice" | "log" | undefined,
      origin: undefined as "teamAdmin" | undefined,
    },
    navigate: vi.fn(),
    goBack: vi.fn(),
    popTo: vi.fn(),
    popToTop: vi.fn(),
    setOptions: vi.fn(),
    getAccessToken: vi.fn(),
    getTeamScopedPracticeById: vi.fn(),
    getUniquePlaces: vi.fn(),
    resolveGalleryImages: vi.fn(),
    uploadImagesViaApi: vi.fn(),
    deleteImagesViaApi: vi.fn(),
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    createLogMutateAsync: vi.fn(),
    updateLogMutateAsync: vi.fn(),
    deletePracticeLog: vi.fn(),
    replacePracticeTimes: vi.fn(),
    judge: vi.fn(),
    calls: [] as string[],
    invalidateKeys: [] as unknown[],
    currentUserId: "user-1" as string,
    useTeamMembersQuery: vi.fn(),
    refetchTeamMembers: vi.fn(),
    useTeamMembersQueryCalls: [] as Array<string | undefined>,
    supabase: makeSupabase(),
  };
});

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn(() => ({ width: 375, height: 812 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Keyboard: { dismiss: vi.fn() },
    KeyboardAvoidingView: original.View,
    TextInput: ({
      onChangeText,
      value,
      editable,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      editable?: boolean;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    popTo: mocks.popTo,
    popToTop: mocks.popToTop,
    setOptions: mocks.setOptions,
    addListener: () => () => {},
  }),
  usePreventRemove: () => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    user: { id: mocks.currentUserId },
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamMembersQuery: (_supabase: unknown, teamId: string | undefined) => {
    mocks.useTeamMembersQueryCalls.push(teamId);
    // 実物の useTeamMembersQuery は data/isLoading/**isError**/**refetch** を返す。
    // テストが明示しなかったフィールドは既定値 (正常系) で埋める。undefined のまま
    // 返すと D12 で追加された isError 分岐が「たまたま falsy」で通ってしまい、
    // 退行を検出できないテストになる (大会側で同じ修正をしたのと同じ理由)。
    return { isError: false, refetch: mocks.refetchTeamMembers, ...mocks.useTeamMembersQuery(teamId) };
  },
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: () => ({ data: [], isLoading: false }),
  usePracticeTagsQuery: () => ({ data: [], isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeMutation: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: mocks.createLogMutateAsync, isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: mocks.updateLogMutateAsync, isPending: false }),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({
    profile: null,
    teams: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({ syncPractice: vi.fn(), syncCompetition: vi.fn() }),
}));

vi.mock("@apps/shared/hooks/queries/practiceLogTemplates", () => ({
  usePracticeLogTemplatesQuery: () => ({ data: [], isLoading: false }),
  useUsePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    updateAllMilestoneStatuses = mocks.judge;
  },
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: class {
    getPracticeById = vi.fn();
    getTeamScopedPracticeById = mocks.getTeamScopedPracticeById;
    getUniquePlaces = mocks.getUniquePlaces;
    // D10-(2) の核心。既存ログ削除の呼び出し件数を実測するため hoisted mock に紐付ける。
    deletePracticeLog = mocks.deletePracticeLog;
    replacePracticeTimes = mocks.replacePracticeTimes;
  },
}));

vi.mock("@/utils/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/imageUpload")>("@/utils/imageUpload");
  return {
    ...actual,
    resolveGalleryImages: mocks.resolveGalleryImages,
    uploadImagesViaApi: mocks.uploadImagesViaApi,
    deleteImagesViaApi: mocks.deleteImagesViaApi,
  };
});

vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/ui/DatePickerField", () => ({ DatePickerField: () => null }));


const TEMPLATE = {
  id: "tpl-6601",
  user_id: "roster-owner-9904",
  name: "テンプレ6601",
  style: "Br",
  swim_category: "Kick" as const,
  distance: 50,
  rep_count: 8,
  set_count: 2,
  circle: 60,
  note: "TPL-NOTE-6601",
  tag_ids: [],
  is_favorite: false,
  use_count: 0,
  last_used_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/components/practices/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: ({
    visible,
    onSelect,
    onClose,
  }: {
    visible: boolean;
    onSelect: (t: typeof TEMPLATE) => void;
    onClose: () => void;
  }) =>
    visible ? (
      <button
        onClick={() => {
          onSelect(TEMPLATE);
          onClose();
        }}
      >
        テンプレートを選ぶ
      </button>
    ) : null,
}));

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

const PRACTICE_ID = "practice-9901";
const OWNER_ID = "roster-owner-9904";
const ADMIN_VIEWER_ID = "roster-admin-9903";
const LOG_ID_A = "plog-6602-alpha";
const LOG_ID_B = "plog-6603-bravo";

function makeLog(
  id: string,
  overrides: { distance: number; note: string; times?: Array<{ id: string; set_number: number; rep_number: number; time: number }> },
) {
  return {
    id,
    practice_id: PRACTICE_ID,
    style: "Fr",
    swim_category: "Swim",
    distance: overrides.distance,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    note: overrides.note,
    video_path: null,
    video_thumbnail_path: null,
    practice_times: overrides.times ?? [],
    practice_log_tags: [],
  };
}

const LOG_A_TIMES = [
  { id: "pt-6604", set_number: 1, rep_number: 1, time: 75.1 },
  { id: "pt-6605", set_number: 1, rep_number: 2, time: 76.2 },
];

function personalPractice(logs: unknown[]): PracticeWithLogs {
  return {
    id: PRACTICE_ID,
    user_id: OWNER_ID,
    team_id: null,
    date: "2026-05-20",
    title: "テンプレ適用検証練習",
    place: "検証プール",
    note: "",
    image_paths: [],
    created_at: "2026-05-20T00:00:00Z",
    updated_at: "2026-05-20T00:00:00Z",
    practice_logs: logs,
  } as unknown as PracticeWithLogs;
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PracticeTabFormScreen />
    </QueryClientProvider>,
  );
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("practice-tab-form-save"));
    await flushAsync();
  });
}

beforeEach(() => {
  mocks.routeParams.practiceId = PRACTICE_ID;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = "log";
  mocks.routeParams.origin = undefined;
  mocks.currentUserId = OWNER_ID;

  mocks.goBack.mockReset();
  mocks.getTeamScopedPracticeById
    .mockReset()
    .mockResolvedValue(
      personalPractice([
        makeLog(LOG_ID_A, { distance: 100, note: "ALPHA-NOTE-6602", times: LOG_A_TIMES }),
        makeLog(LOG_ID_B, { distance: 200, note: "BRAVO-NOTE-6603" }),
      ]),
    );
  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.updateMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.createLogMutateAsync.mockReset().mockResolvedValue({ id: "plog-new" });
  mocks.updateLogMutateAsync.mockReset().mockResolvedValue({});
  mocks.deletePracticeLog.mockReset().mockResolvedValue(undefined);
  mocks.replacePracticeTimes.mockReset().mockResolvedValue(undefined);
  mocks.judge.mockReset().mockResolvedValue(undefined);
  mocks.useTeamMembersQuery.mockReset().mockReturnValue({
    data: [
      { user_id: ADMIN_VIEWER_ID, role: "admin" },
      { user_id: OWNER_ID, role: "user" },
    ],
    isLoading: false,
  });
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function updateLogCallFor(logId: string) {
  const call = mocks.updateLogMutateAsync.mock.calls.find(
    ([arg]) => (arg as { id: string }).id === logId,
  );
  return call?.[0] as { id: string; updates: Record<string, unknown> } | undefined;
}

describe("「テンプレートから作成」は表示中のメニューだけに適用する", () => {
  it("[TPL-1] メニュー2に適用して保存: 既存ログは1件も削除せず、メニュー2の設定だけがテンプレートになる", async () => {
    renderScreen();
    await screen.findByText("メニュー 2");

    fireEvent.click(screen.getByText("メニュー 2"));
    fireEvent.click(screen.getByText("テンプレートから作成"));
    fireEvent.click(await screen.findByText("テンプレートを選ぶ"));

    // メニュー1 は残っている (以前はテンプレート1件に置き換わり「メニュー 1」だけになっていた)
    await waitFor(() => expect(screen.getByText("メニュー 1")).toBeTruthy());
    expect(screen.getByText("メニュー 2")).toBeTruthy();

    await save();

    expect(mocks.deletePracticeLog).toHaveBeenCalledTimes(0);
    expect(mocks.createLogMutateAsync).toHaveBeenCalledTimes(0);
    expect(mocks.updateLogMutateAsync).toHaveBeenCalledTimes(2);

    expect(updateLogCallFor(LOG_ID_B)?.updates).toMatchObject({
      style: "Br",
      swim_category: "Kick",
      distance: 50,
      rep_count: 8,
      set_count: 2,
      circle: 60,
      note: "TPL-NOTE-6601",
    });
    expect(updateLogCallFor(LOG_ID_A)?.updates).toMatchObject({
      style: "Fr",
      distance: 100,
      rep_count: 4,
      note: "ALPHA-NOTE-6602",
    });
  });

  it("[TPL-2] タイムのあるメニュー1に適用しても、そのタイムは保存時に書き戻される (消えない)", async () => {
    renderScreen();
    await screen.findByText("メニュー 1");

    fireEvent.click(screen.getByText("テンプレートから作成"));
    fireEvent.click(await screen.findByText("テンプレートを選ぶ"));
    await save();

    expect(mocks.deletePracticeLog).toHaveBeenCalledTimes(0);
    expect(updateLogCallFor(LOG_ID_A)?.updates).toMatchObject({ style: "Br", distance: 50 });
    const timesCall = mocks.replacePracticeTimes.mock.calls.find(([logId]) => logId === LOG_ID_A);
    expect(timesCall?.[1]).toEqual([
      { set_number: 1, rep_number: 1, time: 75.1 },
      { set_number: 1, rep_number: 2, time: 76.2 },
    ]);
  });
});

describe("メニューサブタブの ×", () => {
  it("[TPL-3] 既存ログのメニューの × は確認を出し、キャンセルすれば消えず、保存しても削除しない", async () => {
    renderScreen();
    await screen.findByText("メニュー 2");

    fireEvent.click(screen.getByTestId("item-tab-remove-2"));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe("メニュー 2を削除しますか？");
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    act(() => buttons.find((b) => b.style === "cancel")?.onPress?.());

    expect(screen.getByText("メニュー 2")).toBeTruthy();
    await save();
    expect(mocks.deletePracticeLog).toHaveBeenCalledTimes(0);
  });
});
