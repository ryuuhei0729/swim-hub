/**
 * TeamPracticeLogBulkFormScreen — 未保存の代理入力の破棄確認
 *
 * 背景 (UI レビュー照合で見つかった実害): フッターの「キャンセル」・スワイプ・ヘッダーの
 * 戻るで、全員分の代理入力タイムが確認なしに消えていた (usePreventRemove が無かった)。
 * 似た一括入力画面 (TeamEntryBulkFormScreen) と同じく、読み込み時から変更があれば
 * usePreventRemove で破棄確認を出し、保存成功後は確認なしで戻る。
 *
 * 観測点: usePreventRemove に渡った preventRemove の最新値、破棄確認 Alert、
 * navigation.dispatch / goBack の呼び出し。モック構成は
 * TeamPracticeLogBulkFormScreen.uiParity.test.tsx をそのまま流用している。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";
import type { PracticeLogTemplate } from "@apps/shared/types/practiceLogTemplate";
import { Alert } from "react-native";

const mocks = vi.hoisted(() => ({
  routeParams: { practiceId: "practice-1", teamId: "team-1" },
  navigate: vi.fn(),
  goBack: vi.fn(),
  dispatch: vi.fn(),
  // usePreventRemove に渡された preventRemove と callback (レンダーごと)
  preventRemoveArgs: [] as boolean[],
  preventRemoveCallback: null as null | ((e: { data: { action: unknown } }) => void),
  getAccessToken: vi.fn(async () => null),
  membersFixture: [] as Array<{ user_id: string; role: string; users: { name: string } }>,
  tagsFixture: [] as PracticeTag[],
  templatesFixture: [] as PracticeLogTemplate[],
  useTemplateMutateFn: vi.fn(),
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  // null = 即座に成功解決。関数を入れると rpc() がその関数の返す Promise を待つ
  // (保存中 (isSaving) の disabled 伝播を検証するために意図的に長引かせる用)
  rpcDeferred: null as (() => Promise<{ data: unknown; error: unknown }>) | null,
  supabaseResponses: {
    practices: { data: { id: "practice-1", date: "2026-08-01", place: "市民プール" }, error: null },
    practice_logs: { data: [] as unknown[], error: null },
    team_attendance: { data: [] as unknown[], error: null },
  } as Record<string, { data: unknown; error: unknown }>,
}));

function createChainableQueryBuilder(table: string) {
  const resolveValue = () => mocks.supabaseResponses[table] ?? { data: null, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: () => Promise.resolve(resolveValue()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolveValue()).then(resolve, reject),
  };
  return chain;
}

const mockSupabase = {
  from: (table: string) => createChainableQueryBuilder(table),
  rpc: (name: string, args: unknown) => {
    mocks.rpcCalls.push({ name, args });
    if (mocks.rpcDeferred) return mocks.rpcDeferred();
    return Promise.resolve({ data: { success: true, log_ids: ["log-1", "log-2"] }, error: null });
  },
};

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
    // 共通モックの TextInput は onChange を onChangeText へ渡さないため差し替える
    TextInput: ({
      onChangeText,
      value,
      ...props
    }: { onChangeText?: (text: string) => void; value?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("div", props, children),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    dispatch: mocks.dispatch,
    addListener: () => () => {},
  }),
  usePreventRemove: (
    preventRemove: boolean,
    callback: (e: { data: { action: unknown } }) => void,
  ) => {
    mocks.preventRemoveArgs.push(preventRemove);
    mocks.preventRemoveCallback = callback;
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mockSupabase,
    subscription: null,
    user: { id: "admin-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersFixture, isLoading: false }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticeTagsQuery: () => ({ data: mocks.tagsFixture, isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));

// PracticeLogTemplateSelectModal (実物) が内部で呼ぶクエリ/ミューテーションフックのみモックする。
// モーダル自体・handleTemplateSelect (画面本体) はどちらも実物のまま render する
// (D-5 のテンプレート非破壊マージは本番コードを実際に通して検証する必要があるため)。
vi.mock("@apps/shared/hooks/queries/practiceLogTemplates", () => ({
  usePracticeLogTemplatesQuery: () => ({
    data: mocks.templatesFixture,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUsePracticeLogTemplateMutation: () => ({ mutate: mocks.useTemplateMutateFn }),
}));

// MemberSelectModal は既存基盤の共有コンポーネント。実体を使わず、対象メニューへの
// 選択確定だけをテストから直接駆動できるスタブに差し替える (呼び出し引数=onConfirm経由の
// 選択結果はプロダクション側の confirmMemberSelection にそのまま渡り、捨てられない)。
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: { visible: boolean; onConfirm: (ids: string[]) => void }) => {
    if (!props.visible) return null;
    return React.createElement(
      "div",
      null,
      React.createElement(
        "button",
        { onClick: () => props.onConfirm(["member-1", "member-2"]) },
        "confirm-select-2",
      ),
    );
  },
}));

import { TeamPracticeLogBulkFormScreen } from "../TeamPracticeLogBulkFormScreen";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function renderScreenAndWaitForLoad() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(<TeamPracticeLogBulkFormScreen />, { wrapper: createWrapper(queryClient) });
  // 保存ボタンの出現 = 権限ゲート通過 + 初期ロード完了の確実な証拠
  await waitFor(() => {
    expect(screen.getByText("チーム練習ログを保存")).toBeTruthy();
  });
  return result;
}

/** ItemTabs の「+ (追加)」ボタンを accessibilityLabel="add item" で取得する
 *  (ItemTabs.tsx のハードコード文字列。testID は View/Pressable のため getByTestId 不可) */
function getAddMenuTabButton(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[accessibilitylabel="add item"]');
  if (!el) throw new Error("ItemTabs の追加ボタン (accessibilityLabel=add item) が見つからない");
  return el as HTMLElement;
}

/** ItemTabs の「× (削除)」ボタンを DOM 出現順で取得する
 *  (accessibilityLabel="remove item" は全タブ共通のハードコード文字列で index 別に
 *   区別できないため、DOM 上の並び順 = タブの表示順であることを利用する) */
function getRemoveTabButtons(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[accessibilitylabel="remove item"]')) as HTMLElement[];
}

function makeExistingLog(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "log-1",
    user_id: "member-1",
    style: "Fr",
    swim_category: "Swim",
    distance: 100,
    rep_count: 4,
    set_count: 1,
    circle: 90,
    note: "",
    practice_log_tags: [],
    practice_times: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.routeParams.practiceId = "practice-1";
  mocks.routeParams.teamId = "team-1";
  mocks.rpcCalls.length = 0;
  mocks.rpcDeferred = null;
  mocks.tagsFixture = [];
  mocks.templatesFixture = [];
  mocks.useTemplateMutateFn = vi.fn();
  mocks.membersFixture = [
    { user_id: "admin-1", role: "admin", users: { name: "管理者太郎" } },
    { user_id: "member-1", role: "member", users: { name: "部員次郎" } },
    { user_id: "member-2", role: "member", users: { name: "部員三郎" } },
  ];
  mocks.supabaseResponses.practices = {
    data: { id: "practice-1", date: "2026-08-01", place: "市民プール" },
    error: null,
  };
  mocks.supabaseResponses.practice_logs = { data: [], error: null };
  mocks.supabaseResponses.team_attendance = { data: [], error: null };
});


function latestPreventRemove(): boolean | undefined {
  return mocks.preventRemoveArgs[mocks.preventRemoveArgs.length - 1];
}

beforeEach(() => {
  mocks.goBack.mockReset();
  mocks.dispatch.mockReset();
  mocks.preventRemoveArgs.length = 0;
  mocks.preventRemoveCallback = null;
  vi.mocked(Alert.alert).mockClear();
  mocks.supabaseResponses.practice_logs = {
    data: [makeExistingLog({ id: "log-a", user_id: "member-1", note: "DG-NOTE-A" })],
    error: null,
  };
});

describe("TeamPracticeLogBulkFormScreen 未保存の代理入力の破棄確認", () => {
  it("[DG-1] 読み込んだまま何も変えていなければ、戻るのを止めない", async () => {
    await renderScreenAndWaitForLoad();
    expect(latestPreventRemove()).toBe(false);
  });

  it("[DG-2] 入力を変えたら戻るのを止め、確認で「破棄」を選んだときだけ元の遷移を実行する", async () => {
    await renderScreenAndWaitForLoad();
    fireEvent.change(screen.getByDisplayValue("DG-NOTE-A"), { target: { value: "DG-NOTE-A2" } });

    await waitFor(() => expect(latestPreventRemove()).toBe(true));

    const action = { type: "GO_BACK" };
    act(() => mocks.preventRemoveCallback?.({ data: { action } }));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(title).toBe("入力内容が保存されていません");
    const typedButtons = buttons as Array<{ style?: string; onPress?: () => void }>;

    // キャンセルでは遷移しない
    act(() => typedButtons.find((b) => b.style === "cancel")?.onPress?.());
    expect(mocks.dispatch).not.toHaveBeenCalled();

    // 破棄で元の遷移アクションを実行する
    act(() => typedButtons.find((b) => b.style === "destructive")?.onPress?.());
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(action);
  });

  it("[DG-3] 入力を元の値に戻したら、戻るのを止めない", async () => {
    await renderScreenAndWaitForLoad();
    const input = screen.getByDisplayValue("DG-NOTE-A");
    fireEvent.change(input, { target: { value: "DG-NOTE-A2" } });
    await waitFor(() => expect(latestPreventRemove()).toBe(true));
    fireEvent.change(screen.getByDisplayValue("DG-NOTE-A2"), { target: { value: "DG-NOTE-A" } });
    await waitFor(() => expect(latestPreventRemove()).toBe(false));
  });

  it("[DG-4] 変更して保存に成功したら、確認なしで1回だけ戻る", async () => {
    await renderScreenAndWaitForLoad();
    fireEvent.change(screen.getByDisplayValue("DG-NOTE-A"), { target: { value: "DG-NOTE-A2" } });
    await waitFor(() => expect(latestPreventRemove()).toBe(true));

    fireEvent.click(screen.getByText("チーム練習ログを保存"));

    await waitFor(() => expect(mocks.goBack).toHaveBeenCalledTimes(1));
    // goBack の時点で preventRemove は解除済み (保存直後に破棄確認が出ない)
    expect(latestPreventRemove()).toBe(false);
    expect(mocks.rpcCalls).toHaveLength(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("[DG-5] + で足した空のメニューの × は確認なしで消える", async () => {
    const { container } = await renderScreenAndWaitForLoad();
    fireEvent.click(getAddMenuTabButton(container));
    await waitFor(() => expect(screen.getByText("メニュー 2")).toBeTruthy());

    const removeButtons = getRemoveTabButtons(container);
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[1]!);

    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("メニュー 2")).toBeNull());
  });
});
