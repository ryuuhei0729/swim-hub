/**
 * PracticeLogFormScreen.tagModalRace.test.tsx
 *
 * PM 裁定 (2回目): Phase A のハーネス実装 (components/shared/__tests__/
 * TagModalTransition.raceCondition.test.tsx) は3画面を一切 import せず、
 * テスト自身が setTimeout ベースの遷移ロジックを再実装していたため
 * 「バグのレプリカがバグっていること」しか証明できていなかった。本ファイルは
 * それを廃し、実際に PracticeLogFormScreen を import して render し、
 * 実装 (screens/PracticeLogFormScreen.tsx) が実際に持つ状態遷移を検証する。
 *
 * 実装の要点 (git diff で確認済み):
 *   - openTagCreateModal/openTagEditModal は setTimeout を使わず、
 *     pendingTagAction を記録して TagSelectModal を閉じるだけ。
 *   - TagSelectModal (SlideUpModal) が実際に閉じ終わったら onClosed
 *     (= handleTagSelectModalClosed) が呼ばれ、そこで初めて TagManageModal を開く。
 *   - TagManageModal 側も onClosed (= handleTagManageModalClosed) を持ち、
 *     閉じ終わったら TagSelectModal を再度開く。
 *
 * 検証する契約 (実装後):
 *   [V-2/V-3/V-7] TagSelectModal の Modal が完全にアンマウントされてから
 *     TagManageModal の Modal がマウントされる (新規作成経路・編集経路・連打)。
 *   [V-8] Android/iOS で TagManageModal の onClosed が正しく1回だけ発火する。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";

// -----------------------------------------------------------------------
// vi.hoisted: モックファクトリと本体の両方から同じ可変オブジェクトを参照するため
// (vi.mock ファクトリは巻き上げられるので通常の変数は参照できない)
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  routeParams: {
    practiceId: undefined as string | undefined,
    practiceLogId: undefined as string | undefined,
    returnTo: undefined as string | undefined,
    teamId: undefined as string | undefined,
  },
  platform: { OS: "ios" as "ios" | "android" },
  tagsFixture: [] as PracticeTag[],
  navigate: vi.fn(),
  goBack: vi.fn(),
  setOptions: vi.fn(),
  createTagMutateAsync: vi.fn(),
  updateTagMutateAsync: vi.fn(),
  deleteTagMutateAsync: vi.fn(),
  createLogMutateAsync: vi.fn(),
  updateLogMutateAsync: vi.fn(),
  getAccessToken: vi.fn(async () => null),
}));

// react-native の静的モックには Dimensions/Keyboard/KeyboardAvoidingView/SafeAreaView が
// 存在せず (共有モックには他画面が使わないため意図的に含めていない)、TextInput は
// onChangeText を DOM の onChange に橋渡ししないため、このファイル専用に補完する
// (既存の RecordFormScreen.standalone.test.tsx / PasswordChangeModal.test.tsx と同じ
// パターン。共有モックの Modal 計装 (__modalMountRegistry) は ...original でそのまま
// 透過させる)。Platform.OS は V-8 (iOS/Android 切替) のため getter 経由で可変にする。
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

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    setOptions: mocks.setOptions,
    addListener: () => () => {},
  }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {},
    subscription: null,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticeTagsQuery: () => ({ data: mocks.tagsFixture, isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: mocks.createTagMutateAsync, isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: mocks.updateTagMutateAsync, isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: mocks.deleteTagMutateAsync, isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: mocks.createLogMutateAsync, isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: mocks.updateLogMutateAsync, isPending: false }),
}));

// 動画/画像アップロードUIは本テストの検証対象外。@/components/shared のバレル
// (index.ts) は import 時に全サブモジュールを評価するため、PracticeLogFormScreen が
// 実際には使わない ImageUploader (expo-image-picker 依存) もこの経由で評価されて
// しまう。expo-image-picker は expo-modules-core の createPermissionHook 等
// 追加モックが必要になり本テストの関心から外れるため、サブモジュール単位で
// 薄いスタブに差し替える (TagSelectModal/TagManageModal は差し替えないため実体のまま)。
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
import { PracticeLogFormScreen } from "../PracticeLogFormScreen";

// =============================================================================
// 共通ヘルパー
// =============================================================================

type ModalKind = "select" | "manage" | "other";

function classifyModalKind(props: Record<string, unknown>): ModalKind {
  if (props.presentationStyle === "pageSheet") return "manage";
  if (props.transparent === true) return "select";
  return "other";
}

/**
 * 保留中のタイマーを1本ずつ、それぞれ別の act() で区切りながら進める。
 * (React 18+ の自動バッチングで複数タイマーの効果がまとめてコミットされ、
 * 中間状態の重なりを検出できなくなる罠を避けるため。詳細は旧ハーネス版の
 * コミットログ・QA 報告を参照)
 */
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
      <PracticeLogFormScreen />
    </QueryClientProvider>,
  );
}

/** メニューの TagChips (「タグを追加」) を押して TagSelectModal を開く。 */
function openTagSelectModalViaChips() {
  fireEvent.click(screen.getByText("タグを追加"));
}

/**
 * TagManageModal の「キャンセル」ボタンをクリックする。
 * PracticeLogFormScreen 自体のフォーム下部にも同じ文言の「キャンセル」ボタンが
 * あるため (screens/PracticeLogFormScreen.tsx:881)、テキストだけでは一意に
 * 特定できない。TagManageModal は画面本体のボタン群より後に描画されるため、
 * DOM 順で最後の「キャンセル」が TagManageModal 側だと判定する。
 */
function clickTagManageModalCancelButton() {
  const cancelButtons = screen.getAllByText("キャンセル");
  fireEvent.click(cancelButtons[cancelButtons.length - 1]!); // getAllByText は1件以上見つからなければ throw するため末尾要素は必ず存在する
}

function clickCreateNewTagButton() {
  fireEvent.click(screen.getByText("新しいタグを作成"));
}

beforeEach(() => {
  __resetModalMountRegistry();
  vi.useFakeTimers();
  mocks.routeParams.practiceId = undefined;
  mocks.routeParams.practiceLogId = undefined;
  mocks.routeParams.returnTo = undefined;
  mocks.routeParams.teamId = undefined;
  mocks.platform.OS = "ios";
  mocks.tagsFixture = [];
  mocks.navigate.mockReset();
  mocks.goBack.mockReset();
  mocks.createTagMutateAsync.mockReset();
  mocks.updateTagMutateAsync.mockReset();
  mocks.deleteTagMutateAsync.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// [V-1, V-2] 新規作成経路 (実画面)
// =============================================================================

describe("PracticeLogFormScreen [V-1, V-2] 新規作成経路: 実画面で TagSelectModal → 新しいタグを作成 → TagManageModal", () => {
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

describe("PracticeLogFormScreen [V-3] 編集経路: 実画面で三点リーダー → 編集 → TagManageModal", () => {
  it("編集経路でも同時マウントしない", () => {
    mocks.tagsFixture = [makeTag()];
    renderScreen();

    openTagSelectModalViaChips();

    const moreIcon = screen.getByTestId("icon-more-vertical");
    const moreButton = moreIcon.closest("button");
    if (!moreButton) throw new Error("[test setup] 三点リーダーの button が見つからない");
    fireEvent.click(moreButton);

    // Alert.alert (mock) の直近の呼び出しから「編集」ボタンの onPress を取得して実行する
    // (実機では OS のアラートで「編集」をタップする操作に相当)
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

describe("PracticeLogFormScreen [V-7] 連打耐性: 実画面で「新しいタグを作成」を素早く2回タップ", () => {
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

describe("PracticeLogFormScreen [V-4] 復路: 実画面で TagManageModal を閉じる → TagSelectModal が再オープンされる", () => {
  it("TagManageModal の visible が false になってから TagSelectModal が再度 visible になる (Android: onClosed は視認即時発火)", () => {
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

describe("PracticeLogFormScreen [V-8] TagManageModal の onClosed が iOS/Android 両方で1回だけ発火する", () => {
  it("[Android] visible=false になった瞬間に onClosed が発火し (onDismiss 不要)、TagSelectModal が再オープンされる", () => {
    mocks.platform.OS = "android";
    renderScreen();

    openTagSelectModalViaChips();
    clickCreateNewTagButton();
    flushAllTimers();
    expect(screen.getByText("新しいタグ")).toBeTruthy();

    // Android は onDismiss を一切使わない (RN の既知の仕様上 Android では発火しない) ため、
    // ここで onDismiss を手動発火せずに Cancel を押すだけで再オープンされることを確認する。
    // TagManageModal.tsx の Android 分岐は visible=false と同じ commit 内 (useEffect) で
    // 即座に onClosed を発火する設計のため、iOS と異なりタイマーを挟まずとも
    // Cancel クリックの act() だけで再オープンまで完了する。
    clickTagManageModalCancelButton();
    flushAllTimers();
    expect(screen.getByText("タグを選択")).toBeTruthy();

    const selectMounts = __modalMountRegistry.events.filter(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "select",
    );
    // 初回オープン(1) + 復路の再オープン(1) の合計2回のみ (onClosed が2回以上発火して
    // TagSelectModal が余分に開き直されていない)
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

    // iOS は onDismiss (ネイティブの閉じアニメーション完了通知) が来るまで
    // onClosed が発火しない設計のため、visible=false になっただけでは再オープンされない。
    expect(screen.queryByText("タグを選択")).toBeNull();

    // ネイティブの onDismiss が (非同期に) 発火したことをシミュレートする
    act(() => {
      onDismiss();
    });
    flushAllTimers();

    expect(screen.getByText("タグを選択")).toBeTruthy();

    const selectMounts = __modalMountRegistry.events.filter(
      (e) => e.type === "mount" && classifyModalKind(e.props) === "select",
    );
    expect(selectMounts.length, `select の mount 回数が想定と異なる: ${JSON.stringify(selectMounts)}`).toBe(2);

    // onDismiss を万一2回発火させても (RN の既知の不具合や重複呼び出しを想定)、
    // 再オープンが多重に起きない (setShowTagSelectModal(true) は既に true への更新で冪等)
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
