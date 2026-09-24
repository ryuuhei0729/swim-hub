/**
 * TeamPracticeLogBulkFormScreen.uiParity.test.tsx
 *
 * QA Phase B (書き直し版)。個人側の練習ログ入力に UI を揃える対応の
 * Verification Checklist (V-1〜V-10, V-16, V-18, removeMenu の3分岐) を検証する。
 *
 * 【Reviewer Critical 対応: D-5 カバレッジ欠落】
 * teamPracticeLogBulk.templateMergeContract.test.ts は本番の handleTemplateSelect を
 * 一度も呼ばない独自再実装のテストであり、D-5 (テンプレート非破壊マージ) の
 * 回帰保護になっていなかった。本ファイル末尾の [V-10] セクションで、実画面を render し
 * 実際の「テンプレートから作成」ボタン→実物 PracticeLogTemplateSelectModal→
 * テンプレート選択という導線を fireEvent で駆動し、本番の handleTemplateSelect を
 * 通した結果 (保存 RPC ペイロード) だけを検証する統合テストを追加した。
 *
 * 【PM 実測に基づく書き直し】
 * Phase A 版は以下2種の誤りがあった (PM が __mocks__/react-native.ts と
 * vitest.setup.ts を直接読んで裏取り):
 *
 * 1. testID → data-testid 変換は TextInput にしか効かない (__mocks__/react-native.ts L158-172)。
 *    View/Pressable の testID (ItemTabs のタブコンテナ・+ボタン・DistanceChips のプリセット
 *    ボタン等) は getByTestId で引けない。→ テキスト内容 (チップのラベル文字列) か、
 *    Pressable がそのまま透過する accessibilityLabel 属性 (DOM 上は小文字
 *    `accessibilitylabel` になる) で引く。
 * 2. この試験ファイルが上書きしている react-native モックは TextInput の
 *    onChangeText → onChange 変換を持たない (importOriginal の TextInput をそのまま使っている)。
 *    そのため fireEvent.change は React state に届かず無言で空振りする。
 *    V-2/V-4 はこの空振りの結果、たまたま初期値とクランプ後の期待値が一致していただけで
 *    実装を検証できていなかった (偽 green)。
 *    → ステッパーの初期値は fixture (practice_logs の rep_count 等) で与え、
 *      -/+ ボタンの実クリックだけで検証する。
 *
 * NumberStepper/DistanceChips/ItemTabs は実物 (プロダクション本体) をそのまま使う。
 * 内部ロジックをテスト側で再実装しない。
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";
import type { PracticeLogTemplate } from "@apps/shared/types/practiceLogTemplate";

const mocks = vi.hoisted(() => ({
  routeParams: { practiceId: "practice-1", teamId: "team-1" },
  navigate: vi.fn(),
  goBack: vi.fn(),
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
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack, addListener: () => () => {} }),
  usePreventRemove: () => undefined,
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

/**
 * NumberStepper の中央 input (testID は TextInput に載るため getByTestId で引ける) から、
 * 同じ親 (View→div) 内の最初/最後の button を decrease/increase として取得する。
 * (Pressable の testID は data-testid に変換されない DOM モック仕様のため、
 *  構造上の位置で特定する。NumberStepper 自身の構造
 *  <div><button(decrease)/><input/><button(increase)/></div> に依存するが、
 *  これは共通コンポーネント自体の構造でありテストごとの決め打ちではない)
 */
function getStepperControls(testId: string) {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  const container = input.parentElement as HTMLElement;
  const buttons = container.querySelectorAll("button");
  return {
    input,
    decrease: buttons[0] as HTMLButtonElement,
    increase: buttons[buttons.length - 1] as HTMLButtonElement,
  };
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

function makeTemplate(overrides: Partial<PracticeLogTemplate> = {}): PracticeLogTemplate {
  return {
    id: "tpl-1",
    user_id: "admin-1",
    name: "テンプレA",
    style: "Fly",
    swim_category: "Kick",
    distance: 50,
    rep_count: 8,
    set_count: 3,
    circle: 105,
    note: "テンプレ備考",
    tag_ids: [],
    is_favorite: true,
    use_count: 0,
    last_used_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
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

// =============================================================================
// [V-1]〜[V-4] ステッパー/距離チップの境界値 (個人側と同一部品・同一 min/max/step)
// 初期値は fixture (practice_logs) で与え、-/+ の実クリックのみで検証する。
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-1〜V-4] 個人側と同一の NumberStepper/DistanceChips 境界値", () => {
  it("[V-1] 本数ステッパー: rep_count=1 で読み込むと、減らすボタンは disabled で 1 未満にならない", async () => {
    mocks.supabaseResponses.practice_logs = { data: [makeExistingLog({ rep_count: 1 })], error: null };
    await renderScreenAndWaitForLoad();
    const { input, decrease } = getStepperControls("practice-rep-count");
    expect(input.value).toBe("1");
    expect(decrease.disabled).toBe(true);
    fireEvent.click(decrease);
    expect(input.value).toBe("1");
  });

  it("[V-2] セット数ステッパー: set_count=1 で読み込むと、減らすボタンは disabled で 1 未満にならない", async () => {
    mocks.supabaseResponses.practice_logs = { data: [makeExistingLog({ set_count: 1 })], error: null };
    await renderScreenAndWaitForLoad();
    const { input, decrease } = getStepperControls("practice-set-count");
    expect(input.value).toBe("1");
    expect(decrease.disabled).toBe(true);
    fireEvent.click(decrease);
    expect(input.value).toBe("1");
  });

  it("[V-3] サークル秒ステッパー: circle=50 (0分50秒) で読み込み、+ で 59 にクランプされる (max=59,step=10)", async () => {
    mocks.supabaseResponses.practice_logs = { data: [makeExistingLog({ circle: 50 })], error: null };
    await renderScreenAndWaitForLoad();
    const { input, increase } = getStepperControls("practice-circle-sec");
    expect(input.value).toBe("50");
    fireEvent.click(increase);
    expect(input.value).toBe("59"); // 50+10=60 → max=59 にクランプ
    // 59 は max 到達済みなので、もう一段は disabled のはず
    expect(increase.disabled).toBe(true);
  });

  it("[V-4] サークル分ステッパー: circle=45 (0分45秒→circleMin=0) で読み込むと、減らすボタンは disabled で 0 未満にならない", async () => {
    mocks.supabaseResponses.practice_logs = { data: [makeExistingLog({ circle: 45 })], error: null };
    await renderScreenAndWaitForLoad();
    const { input, decrease } = getStepperControls("practice-circle-min");
    expect(input.value).toBe("0");
    expect(decrease.disabled).toBe(true);
    fireEvent.click(decrease);
    expect(input.value).toBe("0");
  });

  it("[V-5] 距離チップ: 25/50/100/200 のプリセットに加えて「その他」直接入力ができる", async () => {
    await renderScreenAndWaitForLoad();
    // testID は Pressable (プリセットチップ) には効かないため、チップのラベル文字列で引く
    fireEvent.click(screen.getByText("200"));
    // プリセット選択直後は独自 TextInput (旧実装) ではなく DistanceChips の管理下にある
    expect(screen.queryByTestId("practice-distance-input")).toBeNull();
    fireEvent.click(screen.getByText("その他"));
    expect(screen.getByTestId("practice-distance-input")).toBeTruthy();
  });
});

// =============================================================================
// [V-6] 既存の任意距離ログを編集で開いたときの後方互換 (データ消失防止)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-6] 任意距離 (プリセット外) の編集時後方互換", () => {
  it("distance=75 の既存ログを開くと DistanceChips が「その他」モードで 75 を保持する", async () => {
    mocks.supabaseResponses.practice_logs = { data: [makeExistingLog({ distance: 75 })], error: null };
    await renderScreenAndWaitForLoad();
    const distanceInput = screen.getByTestId("practice-distance-input") as HTMLInputElement;
    expect(distanceInput.value).toBe("75");
  });
});

// =============================================================================
// [V-7][V-8] ItemTabs サブタブ化: 単一アクティブ表示・入力保持
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-7][V-8] ItemTabs サブタブ切替と状態保持", () => {
  it("[V-7] メニューを追加すると2つ目のタブが現れ、非アクティブなメニューの入力欄は DOM に存在しない", async () => {
    mocks.supabaseResponses.practice_logs = { data: [makeExistingLog({ rep_count: 7 })], error: null };
    const { container } = await renderScreenAndWaitForLoad();

    // ItemTabs 自体がレンダリングされている証拠 (タブラベルの存在)
    expect(screen.getByText("メニュー 1")).toBeTruthy();
    const { input: repsOnMenu1 } = getStepperControls("practice-rep-count");
    expect(repsOnMenu1.value).toBe("7");

    // [V-16] accent="green" の証拠: アクティブタブのラベル文字色が ACCENT_GREEN (#065F46 = rgb(6, 95, 70))
    // であり、ACCENT_BLUE (#2563EB = rgb(37, 99, 235)) ではないこと。
    // (ItemTabs のタブ背景色はスタイル配列がネストしておりモックでは読めないが、
    //  ラベルの色は `[styles.tabText, isActive && {color: accentColor, ...}]` という
    //  1階層の配列のため正しく読める)
    const activeTabLabel = screen.getByText("メニュー 1");
    expect(activeTabLabel.style.color).toBe("rgb(6, 95, 70)");
    expect(activeTabLabel.style.color).not.toBe("rgb(37, 99, 235)");

    fireEvent.click(getAddMenuTabButton(container));
    await waitFor(() => {
      expect(screen.getByText("メニュー 2")).toBeTruthy();
    });

    // メニュー2に自動遷移していない実装もありうるため、明示的にタブ2へ切り替える
    fireEvent.click(screen.getByText("メニュー 2"));
    const { input: repsOnMenu2 } = getStepperControls("practice-rep-count");
    // 新規メニューのデフォルト本数 (4) であり、メニュー1の 7 が漏れていないこと
    expect(repsOnMenu2.value).not.toBe("7");

    // メニュー1の入力欄 (本数=7) はアクティブでないため DOM 上に存在しない
    // (getStepperControls は単一の testID しか見ないため、7 という値そのものが
    //  もう見えないことを確認する = 単一アクティブ描画であることの直接証拠)
    expect(screen.queryByDisplayValue("7")).toBeNull();
  });

  it("[V-8] タブを切り替えて戻っても、対象メンバー選択数 (selectedCount) が保持される", async () => {
    const { container } = await renderScreenAndWaitForLoad();

    fireEvent.click(getAddMenuTabButton(container));
    await waitFor(() => expect(screen.getByText("メニュー 2")).toBeTruthy());

    fireEvent.click(screen.getByText("メニュー 1"));
    fireEvent.click(screen.getByText("ユーザーを選択"));
    fireEvent.click(await screen.findByText("confirm-select-2"));
    await waitFor(() => expect(screen.getByText("2名選択中")).toBeTruthy());

    fireEvent.click(screen.getByText("メニュー 2"));
    expect(screen.queryByText("2名選択中")).toBeNull();

    fireEvent.click(screen.getByText("メニュー 1"));
    expect(screen.getByText("2名選択中")).toBeTruthy();
  });
});

// =============================================================================
// [V-9] 種目選択が保存 (RPC) に正しく反映される (ブラックボックス検証)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-9] 種目チップの選択が保存データに反映される", () => {
  it("種目チップで「背泳ぎ」を選び対象メンバーを選択して保存すると、RPC に style: 'Ba' が渡る", async () => {
    await renderScreenAndWaitForLoad();

    fireEvent.click(screen.getByText("背泳ぎ"));
    fireEvent.click(screen.getByText("ユーザーを選択"));
    fireEvent.click(await screen.findByText("confirm-select-2"));

    await act(async () => {
      fireEvent.click(screen.getByText("チーム練習ログを保存"));
    });

    await waitFor(() => {
      expect(mocks.rpcCalls.length).toBeGreaterThan(0);
    });
    const call = mocks.rpcCalls[0]!;
    expect(call.name).toBe("replace_practice_logs");
    const args = call.args as { p_logs_data: Array<{ style: string }> };
    expect(args.p_logs_data.length).toBeGreaterThan(0);
    for (const log of args.p_logs_data) {
      expect(log.style).toBe("Ba");
    }
  });
});

// =============================================================================
// [V-18] 保存中 (isSaving) は入力操作が無効化される (個人側 isSaving||!canEditPracticeLogs 相当)
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-18] 保存中の入力無効化", () => {
  it("保存 RPC が未解決の間、本数ステッパーの操作ボタンが disabled になる", async () => {
    let resolveRpc: (v: { data: unknown; error: unknown }) => void = () => {};
    mocks.rpcDeferred = () =>
      new Promise((resolve) => {
        resolveRpc = resolve;
      });

    await renderScreenAndWaitForLoad();
    fireEvent.click(screen.getByText("ユーザーを選択"));
    fireEvent.click(await screen.findByText("confirm-select-2"));

    fireEvent.click(screen.getByText("チーム練習ログを保存"));

    await waitFor(() => {
      expect(mocks.rpcCalls.length).toBeGreaterThan(0);
    });

    const { decrease, increase } = getStepperControls("practice-rep-count");
    expect(decrease.disabled).toBe(true);
    expect(increase.disabled).toBe(true);

    // 後片付け: 保留中の RPC を解決してから終了する (act 外に unresolved promise を残さない)
    await act(async () => {
      resolveRpc({ data: { success: true, log_ids: ["log-1", "log-2"] }, error: null });
    });
  });
});

// =============================================================================
// ミューテーション実証 (プロダクションコードは一切改変しない)
//
// V-1〜V-4 は NumberStepper 自体 (プロダクション実物・未変更) の min/max/step クランプを
// 検証しているのではなく、「TeamPracticeLogBulkFormScreen が NumberStepper に渡す
// min/max/step の値」を検証している。もし画面側がここで期待する値と異なる
// min/max/step を渡していたら (=実装バグ) 上記アサーションが red になることを、
// 同じ NumberStepper 実物コンポーネントに意図的に間違った props を与えて実証する
// (TeamPracticeLogBulkFormScreen.tsx 自体は一切変更しない)。
// =============================================================================

import { NumberStepper } from "@/components/ui/NumberStepper";

describe("[ミューテーション実証] NumberStepper への min/max/step 誤配線の検出力", () => {
  it("min=1 のはずが誤って min=0 を渡すと、value=1 で decrease が disabled にならない (V-1/V-2 のガードが機能する根拠)", () => {
    function Wrong() {
      const [v, setV] = React.useState<number | "">(1);
      return <NumberStepper value={v} onChange={setV} min={0} step={1} testID="wrong-min" />;
    }
    render(<Wrong />);
    const input = screen.getByTestId("wrong-min") as HTMLInputElement;
    const decrease = (input.parentElement as HTMLElement).querySelectorAll("button")[0] as HTMLButtonElement;
    // 正しい実装 (min=1) なら disabled=true のはずだが、min=0 の誤配線では disabled=false になる。
    // V-1/V-2 の `expect(decrease.disabled).toBe(true)` は、この誤配線が起きていれば red になる。
    expect(decrease.disabled).toBe(false);
    fireEvent.click(decrease);
    expect(input.value).toBe("0"); // min=1 の契約なら起こり得ない値まで減ってしまう
  });

  it("max=59,step=10 のはずが誤って max=99,step=1 を渡すと、50→+ が 59 ではなく 51 になる (V-3 のガードが機能する根拠)", () => {
    function Wrong() {
      const [v, setV] = React.useState<number | "">(50);
      return <NumberStepper value={v} onChange={setV} min={0} max={99} step={1} testID="wrong-max" />;
    }
    render(<Wrong />);
    const input = screen.getByTestId("wrong-max") as HTMLInputElement;
    const increase = (input.parentElement as HTMLElement).querySelectorAll("button")[1] as HTMLButtonElement;
    fireEvent.click(increase);
    // 正しい実装 (max=59,step=10) なら "59" になるはずだが、誤配線では "51" になる。
    // V-3 の `expect(input.value).toBe("59")` は、この誤配線が起きていれば red になる。
    expect(input.value).toBe("51");
    expect(input.value).not.toBe("59");
  });
});

// =============================================================================
// [V-10] テンプレート非破壊マージ — 実 handleTemplateSelect を通す統合テスト
//
// Reviewer Critical 対応: teamPracticeLogBulk.templateMergeContract.test.ts は
// 独自再実装 (applyTemplateToMenuAt) をテストしており、本番の handleTemplateSelect を
// 一度も呼んでいなかった (D-5 の回帰保護ゼロ)。ここでは実画面を render し、
// 実際に「テンプレートから作成」ボタン→実物 PracticeLogTemplateSelectModal→
// テンプレート選択、という導線を fireEvent で実際に駆動し、本番の handleTemplateSelect
// (TeamPracticeLogBulkFormScreen.tsx) を通した結果だけを検証する。
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [V-10] テンプレート非破壊マージ (実 handleTemplateSelect 経由)", () => {
  it("メニュー1にテンプレートを適用しても、メニュー1自身のtimes/targetUserIdsとメニュー2は保存時に無傷", async () => {
    // 2つのログをグループの異なるキー (style/distance/reps/sets が違う) にして
    // buildMenusFromLogs に2枚のメニューを生成させる。それぞれ times も持たせる。
    mocks.supabaseResponses.practice_logs = {
      data: [
        {
          id: "log-a",
          user_id: "member-1",
          style: "Fr",
          swim_category: "Swim",
          distance: 100,
          rep_count: 4,
          set_count: 1,
          circle: 90,
          note: "menuA-note",
          practice_log_tags: [],
          practice_times: [{ id: "t-a", set_number: 1, rep_number: 1, time: 58.12 }],
        },
        {
          id: "log-b",
          user_id: "member-2",
          style: "Ba",
          swim_category: "Swim",
          distance: 200,
          rep_count: 6,
          set_count: 2,
          circle: 150,
          note: "menuB-note",
          practice_log_tags: [],
          practice_times: [{ id: "t-b", set_number: 1, rep_number: 1, time: 130.5 }],
        },
      ],
      error: null,
    };
    mocks.templatesFixture = [makeTemplate()];

    await renderScreenAndWaitForLoad();
    // 読み込み直後はメニュー1 (menuA: member-1) がアクティブのはず
    expect(screen.getByText("背泳ぎ")).toBeTruthy(); // メニュー2は非アクティブでも種目リスト自体は共通チップなので確認不要

    // メニュー1に対してテンプレートを適用する
    fireEvent.click(screen.getByText("テンプレートから作成"));
    fireEvent.click(await screen.findByText("テンプレA")); // makeTemplate().name

    // ---- UI レベルの検証 (保存前・タブ切替を挟んだ実 DOM 確認) ----
    // V-7 で得た教訓 (「非アクティブメニューが DOM に無い」ことは何も証明しない) を踏まえ、
    // タブを実際に切り替えて2枚目の内容が無傷であることを目視相当で確認する。
    // メニュー数がまだ2枚のまま (1枚に潰れていない) であることも先に確認する。
    expect(screen.getByText("メニュー 2")).toBeTruthy();
    expect(screen.queryByText("メニュー 3")).toBeNull();

    // メニュー1 (アクティブのまま): テンプレートの種目/カテゴリがチップの選択状態に反映されている
    expect(screen.getByText("バタフライ").closest("button")!.style.backgroundColor).toBe(
      "rgb(37, 99, 235)",
    );
    expect(screen.getByText("Kick").closest("button")!.style.backgroundColor).toBe(
      "rgb(37, 99, 235)",
    );

    // メニュー2に切り替えて、フィールド・メンバー選択が無傷であることを DOM で直接確認する
    fireEvent.click(screen.getByText("メニュー 2"));
    expect(screen.getByDisplayValue("menuB-note")).toBeTruthy();
    expect(screen.getByText("背泳ぎ").closest("button")!.style.backgroundColor).toBe(
      "rgb(37, 99, 235)",
    );
    expect(screen.getByText("Swim").closest("button")!.style.backgroundColor).toBe(
      "rgb(37, 99, 235)",
    );
    // メニュー2の対象メンバーは buildMenusFromLogs により log-b の user_id (member-2) の
    // 1名のみで初期化されている (target選択UI自体は Out of Scope につき変更なし)
    expect(screen.getByText("1名選択中")).toBeTruthy();

    // メニュー1に戻す (保存前の状態はどちらのタブがアクティブでも handleSubmit は
    // menus 配列全体を走査するため結果に影響しないが、UI 確認の締めとして戻しておく)
    fireEvent.click(screen.getByText("メニュー 1"));

    // ---- 保存して RPC ペイロードで最終結果を検証する (状態モデルそのものの検証) ----
    await act(async () => {
      fireEvent.click(screen.getByText("チーム練習ログを保存"));
    });
    await waitFor(() => expect(mocks.rpcCalls.length).toBeGreaterThan(0));

    const args = mocks.rpcCalls[0]!.args as {
      p_logs_data: Array<{
        user_id: string;
        style: string;
        distance: number;
        rep_count: number;
        set_count: number;
        practice_times: Array<{ time: number }>;
      }>;
    };

    const member1Log = args.p_logs_data.find((l) => l.user_id === "member-1");
    const member2Log = args.p_logs_data.find((l) => l.user_id === "member-2");

    // メニュー1 (member-1): テンプレートのフィールドで上書きされている
    expect(member1Log).toBeTruthy();
    expect(member1Log!.style).toBe("Fly");
    expect(member1Log!.distance).toBe(50);
    expect(member1Log!.rep_count).toBe(8);
    expect(member1Log!.set_count).toBe(3);
    // メニュー1自身の targetUserIds (=member-1 が消えていない) と times (58.12) が保持されている
    expect(member1Log!.practice_times).toEqual([{ time: 58.12 }].map((t) => expect.objectContaining(t)));

    // メニュー2 (member-2): 一切変更されていない (他メニュー無傷)
    expect(member2Log).toBeTruthy();
    expect(member2Log!.style).toBe("Ba");
    expect(member2Log!.distance).toBe(200);
    expect(member2Log!.rep_count).toBe(6);
    expect(member2Log!.set_count).toBe(2);
    expect(member2Log!.practice_times).toEqual([{ time: 130.5 }].map((t) => expect.objectContaining(t)));
  });

  // ---- ミューテーション実証について (論証。実行不可の理由を明記) ----
  //
  // 上のテストは実物の handleTemplateSelect を通しているため、原理的には
  // 「もし実装が個人側と同型の setMenus([templateMenu]) (丸ごと置換) だったら」を
  // 実際に実行して確かめるのが理想だが、プロダクションコードの改変は禁止されているため
  // TeamPracticeLogBulkFormScreen.tsx を書き換えて実行することはできない。
  // **実行によるミューテーション実証は構成上不可能** (これを「できた」とは書かない)。
  //
  // 代わりにコードトレースで論証する:
  // 個人側と同型の丸ごと置換を適用した場合、setMenus は templateMenu 1件だけの配列になり、
  // その templateMenu は (a) targetUserIds を持たない/空になる (b) times が空になる。
  // その場合 handleSubmit の `for (const menu of menus) { for (member of members.filter(...)) }`
  // は menus.length===1 のテンプレートメニューのみを走査するため、
  // 上のテストの `member2Log` (メニュー2 = member-2 の対象ユーザー) は
  // p_logs_data に一切現れなくなる (`args.p_logs_data.find(...) === undefined`)。
  // つまり `expect(member2Log).toBeTruthy()` が red になる。
  // 同様に member1Log 側も times が [] になるため
  // `expect(member1Log!.practice_times).toEqual(...)` (58.12 を含む) も red になる。
  // → 上のテスト本体 (実行済み・green) が、D-5 の回帰 (丸ごと置換への先祖返り) を
  //   検出できることの論証。これ自体は追加の it() を持たない (トートロジーな
  //   「常に true」テストを増やさないため、ドキュメントコメントのみで示す)。
});

// =============================================================================
// [Warning対応] ItemTabs の × (メニュー削除) の回帰テスト
// removeMenu (TeamPracticeLogBulkFormScreen.tsx) の3分岐を実際に × クリックで駆動する。
// =============================================================================

describe("TeamPracticeLogBulkFormScreen [removeMenu] メニュー削除の3分岐", () => {
  it("メニューが1枚のときは × ボタン自体が表示されない (最後の1件は削除できない)", async () => {
    const { container } = await renderScreenAndWaitForLoad();
    expect(getRemoveTabButtons(container)).toHaveLength(0);
  });

  it("アクティブより前のメニューを削除すると、アクティブ自身は変わらず表示位置だけ詰まる", async () => {
    mocks.supabaseResponses.practice_logs = {
      data: [
        makeExistingLog({ id: "log-a", user_id: "member-1", style: "Fr", distance: 100, note: "MENU-A" }),
        makeExistingLog({ id: "log-b", user_id: "member-2", style: "Ba", distance: 200, note: "MENU-B" }),
        makeExistingLog({ id: "log-c", user_id: "admin-1", style: "Br", distance: 50, note: "MENU-C" }),
      ],
      error: null,
    };
    const { container } = await renderScreenAndWaitForLoad();

    // アクティブを「メニュー 2」(MENU-B) にする
    fireEvent.click(screen.getByText("メニュー 2"));
    expect(screen.getByDisplayValue("MENU-B")).toBeTruthy();

    // 「メニュー 1」(MENU-A、アクティブより前) を削除する
    const removeButtons = getRemoveTabButtons(container);
    expect(removeButtons).toHaveLength(3);
    fireEvent.click(removeButtons[0]!);

    // タブは2枚になり、位置0 (表示上「メニュー 1」) に MENU-B の内容がアクティブのまま表示される
    await waitFor(() => {
      expect(screen.queryByText("メニュー 3")).toBeNull();
    });
    expect(screen.getByDisplayValue("MENU-B")).toBeTruthy();
    expect(screen.queryByDisplayValue("MENU-A")).toBeNull();
  });

  it("アクティブ自身 (末尾) を削除すると、activeIndexが1つ前のメニューにクランプされる", async () => {
    mocks.supabaseResponses.practice_logs = {
      data: [
        makeExistingLog({ id: "log-a", user_id: "member-1", style: "Fr", distance: 100, note: "MENU-A" }),
        makeExistingLog({ id: "log-b", user_id: "member-2", style: "Ba", distance: 200, note: "MENU-B" }),
        makeExistingLog({ id: "log-c", user_id: "admin-1", style: "Br", distance: 50, note: "MENU-C" }),
      ],
      error: null,
    };
    const { container } = await renderScreenAndWaitForLoad();

    // アクティブを末尾「メニュー 3」(MENU-C) にする
    fireEvent.click(screen.getByText("メニュー 3"));
    expect(screen.getByDisplayValue("MENU-C")).toBeTruthy();

    // アクティブ自身 (末尾) を削除する
    const removeButtons = getRemoveTabButtons(container);
    fireEvent.click(removeButtons[2]!);

    // 残り2枚のうち、1つ前 (MENU-B) にクランプされてアクティブ表示される
    await waitFor(() => {
      expect(screen.queryByText("メニュー 3")).toBeNull();
    });
    expect(screen.getByDisplayValue("MENU-B")).toBeTruthy();
    expect(screen.queryByDisplayValue("MENU-C")).toBeNull();
  });
});
