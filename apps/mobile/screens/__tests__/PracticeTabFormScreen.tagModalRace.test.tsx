/**
 * PracticeTabFormScreen.tagModalRace.test.tsx
 *
 * PM 裁定 (2回目) を受けての実画面render版。詳細な経緯・設計判断は
 * screens/__tests__/PracticeLogFormScreen.tagModalRace.test.tsx のヘッダーコメントを参照
 * (このファイルは同じ設計をそのまま PracticeTabFormScreen に適用したもの)。
 *
 * PracticeTabFormScreen はタブ (practice/log) を持つため、route.params.initialTab
 * で最初から "log" タブを開いた状態にする (FormTabBar の UI 操作は不要)。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  routeParams: {
    practiceId: undefined as string | undefined,
    date: undefined as string | undefined,
    teamId: undefined as string | undefined,
    initialTab: "log" as "practice" | "log",
  },
  platform: { OS: "ios" as "ios" | "android" },
  tagsFixture: [] as PracticeTag[],
  navigate: vi.fn(),
  goBack: vi.fn(),
  setOptions: vi.fn(),
  createTagMutateAsync: vi.fn(),
  updateTagMutateAsync: vi.fn(),
  deleteTagMutateAsync: vi.fn(),
  getAccessToken: vi.fn(async () => null),
}));

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
    setOptions: mocks.setOptions,
    addListener: () => () => {},
  }),
  usePreventRemove: () => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {},
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: () => ({ data: [], isLoading: false }),
  usePracticeTagsQuery: () => ({ data: mocks.tagsFixture, isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: mocks.createTagMutateAsync, isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: mocks.updateTagMutateAsync, isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: mocks.deleteTagMutateAsync, isPending: false }),
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@apps/shared/hooks/queries/user", () => ({
  useUserQuery: () => ({ profile: null, teams: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useIOSCalendarSync", () => ({
  useIOSCalendarSync: () => ({
    syncPractice: vi.fn(),
    syncCompetition: vi.fn(),
  }),
}));

vi.mock("@apps/shared/hooks/queries/practiceLogTemplates", () => ({
  usePracticeLogTemplatesQuery: () => ({ data: [], isLoading: false }),
  useUsePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// 画像/動画アップロードUIは本テストの検証対象外 (expo-image-picker 等の重い依存を避ける)。
// TagSelectModal/TagManageModal は @/components/shared のバレル経由でも実体のまま。
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
import { PracticeTabFormScreen } from "../PracticeTabFormScreen";

// =============================================================================
// 共通ヘルパー (PracticeLogFormScreen.tagModalRace.test.tsx と同一設計)
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

function openTagSelectModalViaChips() {
  fireEvent.click(screen.getByText("タグを追加"));
}

function clickCreateNewTagButton() {
  fireEvent.click(screen.getByText("新しいタグを作成"));
}

function clickTagManageModalCancelButton() {
  const cancelButtons = screen.getAllByText("キャンセル");
  fireEvent.click(cancelButtons[cancelButtons.length - 1]);
}

beforeEach(() => {
  __resetModalMountRegistry();
  vi.useFakeTimers();
  mocks.routeParams.practiceId = undefined;
  mocks.routeParams.date = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.routeParams.initialTab = "log";
  mocks.platform.OS = "ios";
  mocks.tagsFixture = [];
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// [V-1, V-2] 新規作成経路 (実画面)
// =============================================================================

describe("PracticeTabFormScreen [V-1, V-2] 新規作成経路: 実画面で TagSelectModal → 新しいタグを作成 → TagManageModal", () => {
  it("TagSelectModal が完全にアンマウントされてから TagManageModal がマウントされる", () => {
    renderScreen();

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

describe("PracticeTabFormScreen [V-3] 編集経路: 実画面で三点リーダー → 編集 → TagManageModal", () => {
  it("編集経路でも同時マウントしない", () => {
    mocks.tagsFixture = [makeTag()];
    renderScreen();

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

describe("PracticeTabFormScreen [V-7] 連打耐性: 実画面で「新しいタグを作成」を素早く2回タップ", () => {
  it("TagManageModal は1回だけマウントされ、同時マウントも起きない", () => {
    renderScreen();

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
// [V-4] 復路 (実画面。JS state レベル)
// =============================================================================

describe("PracticeTabFormScreen [V-4] 復路: 実画面で TagManageModal を閉じる → TagSelectModal が再オープンされる", () => {
  it("TagManageModal の visible が false になってから TagSelectModal が再度 visible になる (Android)", () => {
    mocks.platform.OS = "android";
    renderScreen();

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

describe("PracticeTabFormScreen [V-8] TagManageModal の onClosed が iOS/Android 両方で1回だけ発火する", () => {
  it("[Android] Cancel クリックの act() 内で即座に onClosed が発火し、TagSelectModal が再オープンされる", () => {
    mocks.platform.OS = "android";
    renderScreen();

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

  it("[iOS] visible=false だけでは onClosed は発火せず、ネイティブの onDismiss 発火後に初めて TagSelectModal が再オープンされる", () => {
    mocks.platform.OS = "ios";
    renderScreen();

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

    act(() => {
      onDismiss();
    });
    flushAllTimers();
    const selectMountsAfterDuplicate = __modalMountRegistry.events.filter(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "select",
    );
    expect(selectMountsAfterDuplicate.length).toBe(2);
  });
});
