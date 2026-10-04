/**
 * PracticeTabFormScreen.milestoneJudgmentOrder.test.tsx
 *
 * D8 / S12 / Contract v2 A6: 練習ログ保存でのマイルストーン判定は
 *   - log create/update mutation に skipMilestoneUpdate:true を渡し (mutation の onSuccess では判定させない)
 *   - 全ログ・全タイムの保存 (replacePracticeTimes) が終わった後に **1回だけ** 走る
 *   - ログの追加/更新が無い保存では走らない
 *   - replacePracticeTimes が throw したら判定には到達しない (保存エラー扱い)
 * 順序は mocks.calls (イベントログ) の厳密一致で検証する。
 *
 * 壊したら赤:
 *   - skipMilestoneUpdate を渡し忘れる (現状バグの再現)        -> 引数 assert 赤
 *   - 判定を replacePracticeTimes 完了前に走らせる            -> calls 順 / deferred 検証 赤
 *   - ループ内で毎回判定する                                   -> 判定 1回 assert 赤
 *   - ログ変更なしでも判定する                                 -> 0 回 assert 赤
 * モック構成は PracticeTabFormScreen.teamAdminTabScope.test.tsx と同型。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, configure } from "@testing-library/react";
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

import { Alert } from "react-native";
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

// ---------------------------------------------------------------------------
// fixture (互いに部分文字列関係にならない固有値)
// ---------------------------------------------------------------------------
const PRACTICE_ID = "practice-9901";
const TEAM_ID = "team-9902";
const ADMIN_VIEWER_ID = "roster-admin-9903";
const OWNER_ID = "roster-owner-9904";
const LOG_ID_A = "plog-9905-alpha";
const LOG_ID_B = "plog-9906-bravo";


const PRACTICE_TITLE = "タブ絞り込み検証チーム練習";
const PRACTICE_PLACE = "検証用長水路プール";
const PRACTICE_NOTE = "D9タブ絞り込み検証用備考";

function makePracticeFixture(logs: unknown[] = []): PracticeWithLogs {
  return {
    id: PRACTICE_ID,
    user_id: OWNER_ID,
    team_id: TEAM_ID,
    date: "2026-05-20",
    title: PRACTICE_TITLE,
    place: PRACTICE_PLACE,
    note: PRACTICE_NOTE,
    image_paths: [],
    created_at: "2026-05-20T00:00:00Z",
    updated_at: "2026-05-20T00:00:00Z",
    practice_logs: logs,
  } as unknown as PracticeWithLogs;
}

function makeLog(id: string, distance: number) {
  return {
    id,
    practice_id: PRACTICE_ID,
    style: "Fr",
    swim_category: "Swim",
    distance,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    note: "",
    video_path: null,
    video_thumbnail_path: null,
    practice_times: [],
    practice_log_tags: [],
  };
}

/** 個人の練習 (team_id なし・所有者=開いているユーザー)。チーム練習の基本情報は管理者ビュー以外では編集不可のため */
function personalPractice(logs: unknown[] = []): PracticeWithLogs {
  return { ...makePracticeFixture(logs), team_id: null, user_id: OWNER_ID } as unknown as PracticeWithLogs;
}

function flushAsync(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}


function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const orig = queryClient.invalidateQueries.bind(queryClient);
  vi.spyOn(queryClient, "invalidateQueries").mockImplementation(((f: { queryKey?: unknown[] }) => {
    mocks.calls.push(`invalidate:${JSON.stringify(f?.queryKey)}`);
    mocks.invalidateKeys.push(f?.queryKey);
    return orig(f as never);
  }) as never);
  return render(
    <QueryClientProvider client={queryClient}>
      <PracticeTabFormScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.routeParams.practiceId = PRACTICE_ID;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = undefined;
  mocks.routeParams.origin = undefined;
  // 練習の所有者として開く (非所有者の個人フローは編集権限ゲートで保存できない)
  mocks.currentUserId = OWNER_ID;
  mocks.calls.length = 0;
  mocks.invalidateKeys.length = 0;

  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.popTo.mockReset();
  mocks.popToTop.mockReset();
  mocks.setOptions.mockReset();
  mocks.getTeamScopedPracticeById.mockReset().mockResolvedValue(personalPractice([]));
  mocks.getAccessToken.mockReset().mockResolvedValue("test-access-token");
  mocks.getUniquePlaces.mockReset().mockResolvedValue([]);
  mocks.resolveGalleryImages.mockReset().mockResolvedValue([]);
  mocks.uploadImagesViaApi.mockReset().mockResolvedValue([]);
  mocks.deleteImagesViaApi.mockReset().mockResolvedValue(undefined);
  mocks.createMutateAsync.mockReset().mockResolvedValue({ id: PRACTICE_ID });
  mocks.updateMutateAsync.mockReset().mockImplementation(async () => {
    mocks.calls.push("practice-update");
    return { id: PRACTICE_ID };
  });
  mocks.createLogMutateAsync.mockReset().mockImplementation(async () => {
    mocks.calls.push("log-create");
    return { id: "plog-new" };
  });
  mocks.updateLogMutateAsync.mockReset().mockImplementation(async (a: { id: string }) => {
    mocks.calls.push(`log-update:${a.id}`);
    return {};
  });
  mocks.deletePracticeLog.mockReset().mockResolvedValue(undefined);
  mocks.replacePracticeTimes.mockReset().mockImplementation(async (logId: string) => {
    mocks.calls.push(`times:start:${logId}`);
    mocks.calls.push(`times:end:${logId}`);
  });
  mocks.judge.mockReset().mockImplementation(async () => {
    mocks.calls.push("judge");
  });
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

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("practice-tab-form-save"));
    await flushAsync();
  });
}

describe("D8 / S12 — 練習ログ保存のマイルストーン判定順序", () => {
  it("[update] 既存ログ2件の編集保存: 各 log mutation に skipMilestoneUpdate:true、判定は全 times 保存後に1回だけ (judge の前に times:end が全て並ぶ)", async () => {
    mocks.getTeamScopedPracticeById.mockResolvedValue(
      personalPractice([makeLog(LOG_ID_A, 100), makeLog(LOG_ID_B, 200)]),
    );
    renderScreen();
    fireEvent.change(await screen.findByDisplayValue(PRACTICE_TITLE), { target: { value: "D8 update" } });
    await save();

    for (const call of mocks.updateLogMutateAsync.mock.calls) {
      expect((call[0] as { skipMilestoneUpdate?: boolean }).skipMilestoneUpdate).toBe(true);
    }
    expect(mocks.updateLogMutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.judge).toHaveBeenCalledTimes(1);
    expect(mocks.judge).toHaveBeenCalledWith(OWNER_ID);
    const judgeAt = mocks.calls.indexOf("judge");
    const lastTimesEnd = Math.max(...mocks.calls.map((c, i) => (c.startsWith("times:end:") ? i : -1)));
    expect(lastTimesEnd).toBeGreaterThanOrEqual(0);
    expect(judgeAt).toBeGreaterThan(lastTimesEnd);
    expect(mocks.calls.filter((c) => c.startsWith("times:end:"))).toHaveLength(2);
  });

  it("[create] 練習ログを新規追加: createLog に skipMilestoneUpdate:true、判定は times 保存後に1回、その後 goalKeys.all を invalidate", async () => {
    mocks.routeParams.initialTab = "log";
    mocks.getTeamScopedPracticeById.mockResolvedValue(personalPractice([]));
    renderScreen();
    // 既定メニュー (100m×4本) を編集して「ログに変更あり」にする (未編集のデフォルトログは opt-in で保存されない)
    const reps = await screen.findByTestId("practice-rep-count");
    fireEvent.change(reps, { target: { value: "5" } });
    await save();

    expect(mocks.createLogMutateAsync).toHaveBeenCalledTimes(1);
    expect((mocks.createLogMutateAsync.mock.calls[0]![0] as { skipMilestoneUpdate?: boolean }).skipMilestoneUpdate).toBe(true);
    expect(mocks.calls.filter((c) => c === "judge")).toHaveLength(1);
    const iCreate = mocks.calls.indexOf("log-create");
    const iEnd = mocks.calls.indexOf("times:end:plog-new");
    const iJudge = mocks.calls.indexOf("judge");
    const iInv = mocks.calls.findIndex((c, i) => i > iJudge && c === 'invalidate:["goals"]');
    expect(iCreate).toBeGreaterThanOrEqual(0);
    expect(iEnd).toBeGreaterThan(iCreate);
    expect(iJudge).toBeGreaterThan(iEnd);
    expect(iInv).toBeGreaterThan(iJudge);
  });

  it("replacePracticeTimes が未解決の間は判定が走らない (deferred)", async () => {
    mocks.getTeamScopedPracticeById.mockResolvedValue(personalPractice([makeLog(LOG_ID_A, 100)]));
    let release!: () => void;
    mocks.replacePracticeTimes.mockImplementation(
      (logId: string) => new Promise<void>((r) => { mocks.calls.push(`times:start:${logId}`); release = () => { mocks.calls.push(`times:end:${logId}`); r(); }; }),
    );
    renderScreen();
    fireEvent.change(await screen.findByDisplayValue(PRACTICE_TITLE), { target: { value: "D8 deferred" } });
    await act(async () => { fireEvent.click(screen.getByTestId("practice-tab-form-save")); await flushAsync(100); });
    expect(mocks.calls).toContain(`times:start:${LOG_ID_A}`);
    expect(mocks.judge).not.toHaveBeenCalled();
    await act(async () => { release(); await flushAsync(); });
    expect(mocks.judge).toHaveBeenCalledTimes(1);
    expect(mocks.calls.indexOf("judge")).toBeGreaterThan(mocks.calls.indexOf(`times:end:${LOG_ID_A}`));
  });

  it("[A6] replacePracticeTimes が throw -> 保存エラー扱いで判定は0回、画面は閉じない", async () => {
    mocks.getTeamScopedPracticeById.mockResolvedValue(personalPractice([makeLog(LOG_ID_A, 100)]));
    mocks.replacePracticeTimes.mockRejectedValue(new Error("times boom"));
    renderScreen();
    fireEvent.change(await screen.findByDisplayValue(PRACTICE_TITLE), { target: { value: "D8 throw" } });
    await save();
    expect(mocks.judge).not.toHaveBeenCalled();
    expect(mocks.goBack).not.toHaveBeenCalled();
    expect(vi.mocked(Alert.alert)).toHaveBeenCalled();
    // ダイアログ本文は固定文言 (toUserFacingMessage 経由) で、生エラー ('times boom') を含まない
    const alertText = JSON.stringify(vi.mocked(Alert.alert).mock.calls);
    expect(alertText).not.toContain("times boom");
    expect(alertText).toContain("保存に失敗");
  });

  it("[A6] ログに変更が無い保存 (既存ログ0件・メニュー未編集): 判定 0 回、goalKeys の invalidate も 0 回", async () => {
    renderScreen();
    fireEvent.change(await screen.findByDisplayValue(PRACTICE_TITLE), { target: { value: "D8 no logs" } });
    await save();
    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.createLogMutateAsync).not.toHaveBeenCalled();
    expect(mocks.updateLogMutateAsync).not.toHaveBeenCalled();
    expect(mocks.judge).not.toHaveBeenCalled();
    expect(mocks.calls.filter((c) => c === 'invalidate:["goals"]')).toHaveLength(0);
  });

  it("判定が reject (内部で握りつぶし) でも保存は成功し画面は閉じる", async () => {
    mocks.getTeamScopedPracticeById.mockResolvedValue(personalPractice([makeLog(LOG_ID_A, 100)]));
    mocks.judge.mockImplementation(async () => { mocks.calls.push("judge"); throw new Error("judge boom"); });
    renderScreen();
    fireEvent.change(await screen.findByDisplayValue(PRACTICE_TITLE), { target: { value: "D8 judge fail" } });
    await save();
    expect(mocks.judge).toHaveBeenCalledTimes(1);
    expect(mocks.goBack).toHaveBeenCalled();
  });
});
