/**
 * TeamPracticeLogBulkFormScreen.tagModalRace.test.tsx
 *
 * PM 裁定 (2回目) を受けての実画面render版。詳細な経緯・設計判断は
 * screens/__tests__/PracticeLogFormScreen.tagModalRace.test.tsx のヘッダーコメントを参照。
 *
 * TeamPracticeLogBulkFormScreen は画面内の useEffect が直接
 * supabase.from(...).select(...).eq(...).single()/.order() を呼ぶため、react-query
 * フックのモックだけでは足りず、チェーン可能な Supabase クエリビルダーのモックが必要。
 *
 * また [V-6] (git diff で確認済み: tagModalMenuId と showTagSelectModal の分離により、
 * 新規作成したタグが対象メニューに反映されるようになった) をこの画面で実テストとして
 * 昇格させる (Phase A では it.todo だった)。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  routeParams: {
    practiceId: "practice-1",
    teamId: "team-1",
  },
  platform: { OS: "ios" as "ios" | "android" },
  tagsFixture: [] as PracticeTag[],
  membersFixture: [
    { user_id: "admin-1", role: "admin", users: { name: "管理者太郎" } },
    { user_id: "member-1", role: "member", users: { name: "部員次郎" } },
  ] as Array<{ user_id: string; role: string; users: { name: string } }>,
  navigate: vi.fn(),
  goBack: vi.fn(),
  createTagMutateAsync: vi.fn(),
  updateTagMutateAsync: vi.fn(),
  deleteTagMutateAsync: vi.fn(),
  getAccessToken: vi.fn(async () => null),
  // supabase.from(table) が返すチェーン可能クエリビルダーのレスポンス
  supabaseResponses: {
    practices: { data: { id: "practice-1", date: "2026-08-01", place: "市民プール" }, error: null },
    practice_logs: { data: [] as unknown[], error: null },
    team_attendance: { data: [] as unknown[], error: null },
  },
}));

/**
 * supabase.from(table).select(...).eq(...).eq(...).order(...).single() のような
 * チェーンを、どの段階で await/.then しても mocks.supabaseResponses[table] に
 * 解決するビルダーとして返す。
 */
function createChainableQueryBuilder(table: string) {
  const resolveValue = () =>
    mocks.supabaseResponses[table as keyof typeof mocks.supabaseResponses] ?? {
      data: null,
      error: null,
    };
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
    SafeAreaView: ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
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
    Platform: {
      get OS() {
        return mocks.platform.OS;
      },
      select: (obj: Record<string, unknown>) =>
        mocks.platform.OS === "ios" ? (obj.ios ?? obj.default) : (obj.android ?? obj.default),
    },
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  SafeAreaView: ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("div", props, children),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    addListener: () => () => {},
  }),
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
  useCreatePracticeTagMutation: () => ({ mutateAsync: mocks.createTagMutateAsync, isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: mocks.updateTagMutateAsync, isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: mocks.deleteTagMutateAsync, isPending: false }),
}));

// 動画/画像アップロードUIは本テストの検証対象外 (expo-image-picker 等の重い依存を避ける)。
// @/components/shared バレル経由での評価漏れを避けるためサブモジュール単位で差し替える。
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: () => null,
}));
vi.mock("@/components/shared/ImageUploader", () => ({
  ImageUploader: () => null,
}));

import { Alert } from "react-native";
import {
  __modalMountRegistry,
  __resetModalMountRegistry,
  type ModalMountEvent,
} from "../../__mocks__/react-native";
import { TeamPracticeLogBulkFormScreen } from "../TeamPracticeLogBulkFormScreen";

// =============================================================================
// 共通ヘルパー
// =============================================================================

type ModalKind = "select" | "manage" | "other";

function classifyModalKind(props: Record<string, unknown>): ModalKind {
  if (props.presentationStyle === "pageSheet") return "manage";
  if (props.transparent === true) return "select";
  return "other";
}

function flushAllTimers() {
  let guard = 0;
  while (vi.getTimerCount() > 0) {
    if (++guard > 1000) {
      throw new Error("[test setup] タイマーが1000回進めても終了しない (無限ループの疑い)");
    }
    act(() => {
      vi.advanceTimersToNextTimer();
    });
  }
}

function expectFullyUnmountedBeforeMounted(
  events: ModalMountEvent[],
  fromKind: ModalKind,
  toKind: ModalKind,
) {
  const fromUnmounts = events.filter(
    (e) => e.type === "unmount" && classifyModalKind(e.props) === fromKind,
  );
  const toMounts = events.filter((e) => e.type === "mount" && classifyModalKind(e.props) === toKind);

  expect(
    fromUnmounts.length,
    `${fromKind} の unmount イベントが記録されていない (events=${JSON.stringify(events)})`,
  ).toBeGreaterThan(0);
  expect(
    toMounts.length,
    `${toKind} の mount イベントが記録されていない (events=${JSON.stringify(events)})`,
  ).toBeGreaterThan(0);

  const lastFromUnmountSeq = Math.max(...fromUnmounts.map((e) => e.seq));
  const firstToMountSeq = Math.min(...toMounts.map((e) => e.seq));

  expect(
    lastFromUnmountSeq,
    `${fromKind} がまだマウントされている間 (unmount seq=${lastFromUnmountSeq}) に ` +
      `${toKind} がマウントされた (mount seq=${firstToMountSeq})。` +
      `2つの Modal が同時にマウントされている瞬間が存在する。events=${JSON.stringify(events)}`,
  ).toBeLessThan(firstToMountSeq);
}

function makeTag(overrides: Partial<PracticeTag> = {}): PracticeTag {
  return {
    id: "tag-1",
    user_id: "user-1",
    name: "既存タグ",
    color: "#111111",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

/**
 * 画面初期化 useEffect (supabase.from().select()...) の Promise.all 解決を待ってから
 * render する。testing-library の waitFor は内部で real timer ベースにポーリングする
 * ため、vi.useFakeTimers() を先に有効化していると (setTimeout 自体が偽物になり)
 * 永久にポーリングされずタイムアウトする。そのため初期ロード完了 (real timers) を
 * 待ってから、タグモーダルの遷移検証に必要な fake timers に切り替える。
 */
async function renderScreenAndWaitForLoad() {
  vi.useRealTimers();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TeamPracticeLogBulkFormScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByText("タグを追加")).toBeTruthy();
  });
  vi.useFakeTimers();
  return result;
}

function openTagSelectModalViaChips() {
  fireEvent.click(screen.getByText("タグを追加"));
}

function clickCreateNewTagButton() {
  fireEvent.click(screen.getByText("新しいタグを作成"));
}

function clickTagManageModalCancelButton() {
  const cancelButtons = screen.getAllByText("キャンセル");
  fireEvent.click(cancelButtons[cancelButtons.length - 1]!); // getAllByText は1件以上見つからなければ throw するため末尾要素は必ず存在する
}

beforeEach(() => {
  __resetModalMountRegistry();
  mocks.routeParams.practiceId = "practice-1";
  mocks.routeParams.teamId = "team-1";
  mocks.platform.OS = "ios";
  mocks.tagsFixture = [];
  mocks.membersFixture = [
    { user_id: "admin-1", role: "admin", users: { name: "管理者太郎" } },
    { user_id: "member-1", role: "member", users: { name: "部員次郎" } },
  ];
  mocks.supabaseResponses.practices = {
    data: { id: "practice-1", date: "2026-08-01", place: "市民プール" },
    error: null,
  };
  mocks.supabaseResponses.practice_logs = { data: [], error: null };
  mocks.supabaseResponses.team_attendance = { data: [], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// [V-1, V-2] 新規作成経路 (実画面)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-1, V-2] 新規作成経路: 実画面で TagSelectModal → 新しいタグを作成 → TagManageModal", () => {
  it("TagSelectModal が完全にアンマウントされてから TagManageModal がマウントされる", async () => {
    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    flushAllTimers();

    expect(screen.getByText("新しいタグ")).toBeTruthy();
    expectFullyUnmountedBeforeMounted(__modalMountRegistry.events, "select", "manage");
  });
});

// =============================================================================
// [V-3] 編集経路 (実画面)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-3] 編集経路: 実画面で三点リーダー → 編集 → TagManageModal", () => {
  it("編集経路でも同時マウントしない", async () => {
    mocks.tagsFixture = [makeTag()];
    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();

    const moreIcon = screen.getByTestId("icon-more-vertical");
    const moreButton = moreIcon.closest("button");
    if (!moreButton) throw new Error("[test setup] 三点リーダーの button が見つからない");
    fireEvent.click(moreButton);

    const alertMock = Alert.alert as unknown as ReturnType<typeof vi.fn>;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
    const buttons = lastCall?.[2] as Array<{ text: string; onPress?: () => void }> | undefined;
    const editButton = buttons?.find((b) => b.text === "編集");
    if (!editButton?.onPress) {
      throw new Error("[test setup] Alert.alert の呼び出しから「編集」ボタンが見つからない");
    }
    act(() => {
      editButton.onPress?.();
    });

    flushAllTimers();

    expect(screen.getByText("タグを編集")).toBeTruthy();
    expectFullyUnmountedBeforeMounted(__modalMountRegistry.events, "select", "manage");
  });
});

// =============================================================================
// [V-7] 連打耐性 (実画面)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-7] 連打耐性: 実画面で「新しいタグを作成」を素早く2回タップ", () => {
  it("TagManageModal は1回だけマウントされ、同時マウントも起きない", async () => {
    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    clickCreateNewTagButton();
    flushAllTimers();

    expect(screen.getByText("新しいタグ")).toBeTruthy();

    const manageMounts = __modalMountRegistry.events.filter(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "manage",
    );
    expect(manageMounts.length, "TagManageModal が複数回マウントされている (二重オープン)").toBe(1);
    expectFullyUnmountedBeforeMounted(__modalMountRegistry.events, "select", "manage");
  });
});

// =============================================================================
// [V-4] 復路 (実画面)
// PM 裁定: 以前の TeamPracticeLogBulkFormScreen は Log/Tab と異なり復路を実装して
// いなかったが、git diff で確認した限り本 Sprint で統一された
// (handleTagManageModalClosed が setShowTagSelectModal(true) を呼ぶ)。
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-4] 復路: 実画面で TagManageModal を閉じる → TagSelectModal が再オープンされる", () => {
  it("TagManageModal の visible が false になってから TagSelectModal が再度 visible になる (Android)", async () => {
    mocks.platform.OS = "android";
    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    flushAllTimers();
    expect(screen.getByText("新しいタグ")).toBeTruthy();

    const forwardEvents = __modalMountRegistry.events;
    const forwardDoneSeq = forwardEvents[forwardEvents.length - 1]?.seq ?? 0;

    clickTagManageModalCancelButton();
    flushAllTimers();

    expect(screen.getByText("タグを選択")).toBeTruthy();

    const eventsAfterForward = __modalMountRegistry.events.filter((e) => e.seq > forwardDoneSeq);
    expectFullyUnmountedBeforeMounted(eventsAfterForward, "manage", "select");
  });
});

// =============================================================================
// [V-8] Android/iOS で TagManageModal.onClosed が1回だけ発火する (実画面)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-8] TagManageModal の onClosed が iOS/Android 両方で1回だけ発火する", () => {
  it("[Android] Cancel クリックの act() 内で即座に onClosed が発火し、TagSelectModal が再オープンされる", async () => {
    mocks.platform.OS = "android";
    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    flushAllTimers();
    expect(screen.getByText("新しいタグ")).toBeTruthy();

    clickTagManageModalCancelButton();
    flushAllTimers();
    expect(screen.getByText("タグを選択")).toBeTruthy();

    const selectMounts = __modalMountRegistry.events.filter(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "select",
    );
    expect(selectMounts.length, `select の mount 回数が想定と異なる: ${JSON.stringify(selectMounts)}`).toBe(2);
  });

  it("[iOS] visible=false だけでは onClosed は発火せず、ネイティブの onDismiss 発火後に初めて TagSelectModal が再オープンされる", async () => {
    mocks.platform.OS = "ios";
    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    flushAllTimers();
    expect(screen.getByText("新しいタグ")).toBeTruthy();

    const manageMountEvent = __modalMountRegistry.events.find(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "manage",
    );
    if (!manageMountEvent) throw new Error("[test setup] manage の mount イベントが見つからない");
    const onDismiss = manageMountEvent.props.onDismiss as (() => void) | undefined;
    if (typeof onDismiss !== "function") {
      throw new Error("[test setup] TagManageModal の <Modal> に onDismiss が渡されていない");
    }

    clickTagManageModalCancelButton();
    flushAllTimers();
    expect(screen.queryByText("タグを選択")).toBeNull();

    act(() => {
      onDismiss();
    });
    flushAllTimers();

    expect(screen.getByText("タグを選択")).toBeTruthy();

    const selectMounts = __modalMountRegistry.events.filter(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "select",
    );
    expect(selectMounts.length, `select の mount 回数が想定と異なる: ${JSON.stringify(selectMounts)}`).toBe(2);
  });
});

// =============================================================================
// [V-6] タグ作成成功後、作成したタグが対象メニューの選択済みタグとして反映される
// Phase A では it.todo だったが、git diff で tagModalMenuId/showTagSelectModal の
// 分離修正を確認できたため実テストへ昇格する。
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-6] タグ作成成功後、対象メニューに反映される", () => {
  it("新規作成したタグが対象メニューの選択済みタグの一覧に反映される", async () => {
    // Android にしておく (iOS は onDismiss を手動発火しないと復路が進まないため、
    // 本テストの主眼である「作成したタグの反映」から関心を逸らさないための簡略化。
    // iOS/Android の onClosed 発火経路自体は [V-8] で個別に検証済み)。
    mocks.platform.OS = "android";
    const newTag = makeTag({ id: "new-tag", name: "新規タグ" });
    mocks.createTagMutateAsync.mockResolvedValue(newTag);

    await renderScreenAndWaitForLoad();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    flushAllTimers();
    expect(screen.getByText("新しいタグ")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("例: インターバル"), {
      target: { value: "新規タグ" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("保存"));
      // handleSaveTag 内の await createTagMutation.mutateAsync(...) の解決を待つ
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    });
    flushAllTimers();

    expect(mocks.createTagMutateAsync).toHaveBeenCalledWith({ name: "新規タグ", color: expect.any(String) });

    // 復路で TagSelectModal が再オープンされ、選択中タグとして「新規タグ」が反映されている
    expect(screen.getByText("タグを選択")).toBeTruthy();
    expect(screen.getByText("1件選択中")).toBeTruthy();
  });
});
