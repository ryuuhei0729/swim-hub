// =============================================================================
// screens/__tests__/GoalDetailScreen.states.test.tsx  (S2, S3, S4 一覧部, S9, Boundary, v4 L7)
// =============================================================================
// 壊したら赤: 目標なし時の白画面 / 削除失敗の握りつぶし / 生エラー表示 / 編集導線の出し分け(=== null) /
//   削除後の notFound フラッシュ (v4 L7: 修正前は赤でよい)
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  getGoalWithMilestones: vi.fn(),
  calculateGoalProgress: vi.fn(),
  deleteGoal: vi.fn(),
  deleteMilestone: vi.fn(),
  navigate: vi.fn(),
  goBack: vi.fn(),
  supabase: {},
}));

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: h.supabase, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    getGoalWithMilestones = h.getGoalWithMilestones;
    calculateGoalProgress = h.calculateGoalProgress;
    deleteGoal = h.deleteGoal;
    deleteMilestone = h.deleteMilestone;
  },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: h.navigate, goBack: h.goBack }),
  useRoute: () => ({ params: { goalId: "g1" } }),
}));
vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => ({ refreshing: false, handleRefresh: refresh }),
}));

import { Alert } from "react-native";
import { GoalDetailScreen } from "../GoalDetailScreen";

const style = { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 };
function ms(id: string, over: Record<string, unknown> = {}) {
  return {
    id, goal_id: "g1", title: `MS-${id}`, type: "time",
    params: { distance: 100, target_time: 83.45, style: "Fr", swim_category: "Swim" },
    deadline: null, status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null,
    created_at: "", updated_at: "", ...over,
  };
}
function goalFixture(over: Record<string, unknown> = {}) {
  return {
    id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, start_time: 70,
    status: "active", achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c1", title: "県大会", date: "2026-12-01", pool_type: 0, team_id: null },
    style, milestones: [ms("m1"), ms("m2", { status: "achieved", achieved_at: "2026-01-01" })], ...over,
  };
}

let qc: QueryClient;
function renderScreen() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><GoalDetailScreen /></QueryClientProvider>);
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 60)); }); };
const byLabel = (l: string) => Array.from(document.querySelectorAll(`[accessibilitylabel="${l}"]`)) as HTMLElement[];
const confirmDestructive = async (callIndex = 0) => {
  const buttons = vi.mocked(Alert.alert).mock.calls[callIndex]![2] as Array<{ style?: string; onPress?: () => Promise<void> }>;
  await act(async () => { await buttons.find((b) => b.style === "destructive")!.onPress!(); });
};

beforeEach(() => {
  h.getGoalWithMilestones.mockReset().mockResolvedValue(goalFixture());
  h.calculateGoalProgress.mockReset().mockResolvedValue(40);
  h.deleteGoal.mockReset().mockResolvedValue(undefined);
  h.deleteMilestone.mockReset().mockResolvedValue(undefined);
  h.navigate.mockReset();
  h.goBack.mockReset();
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("S9 状態表示 (詳細)", () => {
  it("ローディング: 取得中は Loading 表示", async () => {
    h.getGoalWithMilestones.mockImplementation(() => new Promise(() => {}));
    renderScreen();
    await flush();
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("エラー: 固定文言 + 再試行 (再試行で再取得)。生エラーは出ない", async () => {
    h.getGoalWithMilestones.mockRejectedValue(new Error("SECRET_RAW_DETAIL"));
    renderScreen();
    await flush();
    expect(screen.getByText("目標詳細の取得に失敗しました")).toBeTruthy();
    expect(document.body.textContent).not.toContain("SECRET_RAW_DETAIL");
    const before = h.getGoalWithMilestones.mock.calls.length;
    h.getGoalWithMilestones.mockResolvedValue(goalFixture());
    await act(async () => { fireEvent.click(screen.getByText("再試行")); });
    await flush();
    expect(h.getGoalWithMilestones.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByText("県大会")).toBeTruthy();
  });

  it("目標が見つからない (null / 別端末で削除済み): 固定文言 + 戻る。goBack が呼べる", async () => {
    h.getGoalWithMilestones.mockResolvedValue(null);
    renderScreen();
    await flush();
    expect(document.body.textContent).toContain("目標が見つかりませんでした");
    fireEvent.click(screen.getByText("戻る"));
    expect(h.goBack).toHaveBeenCalledTimes(1);
  });

  it("マイルストーン 0 件: 空状態", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFixture({ milestones: [] }));
    renderScreen();
    await flush();
    expect(screen.getByText("マイルストーンがありません")).toBeTruthy();
  });
});

describe("詳細の内容", () => {
  it("大会名・種目・目標タイム/初期タイム・達成率・マイルストーン達成数を表示", async () => {
    renderScreen();
    await flush();
    const text = document.body.textContent ?? "";
    expect(text).toContain("県大会");
    expect(text).toContain("1:00.00");
    expect(text).toContain("1:10.00");
    expect(text).toContain("40%");
    expect(text).toContain("(1/2)");
  });

  it("マイルストーン概要は ja で '100m × 1本: 1:23.45' (shared 整形・リテラル)", async () => {
    renderScreen();
    await flush();
    expect(screen.getAllByText("100m × 1本: 1:23.45").length).toBeGreaterThanOrEqual(1);
  });

  it("初期タイム未設定は '未設定'", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFixture({ start_time: null }));
    renderScreen();
    await flush();
    expect(screen.getAllByText("未設定").length).toBeGreaterThanOrEqual(1);
  });
});

describe("S2 目標編集導線", () => {
  it("competition あり: 編集ボタン -> GoalForm {goalId}", async () => {
    renderScreen();
    await flush();
    expect(byLabel("編集")).toHaveLength(3);
    fireEvent.click(byLabel("編集")[0]!);
    expect(h.navigate).toHaveBeenLastCalledWith("GoalForm", { goalId: "g1" });
  });

  it("competition===null: 編集ボタン無し + editUnavailableReason、削除ボタンは有り", async () => {
    h.getGoalWithMilestones.mockResolvedValue(goalFixture({ competition: null }));
    renderScreen();
    await flush();
    expect(screen.getAllByText("大会情報がないため編集できません").length).toBeGreaterThanOrEqual(1);
    // 編集ボタンはマイルストーン2件ぶんだけ (目標の編集ボタンが無い: competition あり時は 3 件)
    expect(byLabel("編集")).toHaveLength(2);
    fireEvent.click(byLabel("削除")[0]!);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, msg] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect([title, msg]).toEqual(["削除", "この目標を削除しますか？"]);
  });
});

describe("S3 目標削除", () => {
  const openGoalDelete = () => fireEvent.click(byLabel("削除")[0]!);

  it("確認ダイアログ。キャンセル側は deleteGoal を呼ばない", async () => {
    renderScreen();
    await flush();
    openGoalDelete();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(h.deleteGoal).not.toHaveBeenCalled();
  });

  it("OK -> deleteGoal('g1') 1回 -> goBack。成功後に一瞬でも '見つかりませんでした' を描画しない (v4 L7)", async () => {
    renderScreen();
    await flush();
    // 削除後の再取得は null を返す (サーバー側で消えた) ので、順序が悪いと notFound が出る
    h.getGoalWithMilestones.mockResolvedValue(null);
    openGoalDelete();
    await confirmDestructive();
    await flush();
    expect(h.deleteGoal).toHaveBeenCalledTimes(1);
    expect(h.deleteGoal).toHaveBeenCalledWith("g1");
    expect(h.goBack).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("目標が見つかりませんでした");
  });

  it("deleteGoal が throw (RLS 0行相当) -> 固定文言で通知、goBack しない、生エラー非表示", async () => {
    h.deleteGoal.mockRejectedValue(new Error("SECRET_RAW_RLS"));
    renderScreen();
    await flush();
    openGoalDelete();
    await confirmDestructive();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    const [t2, m2] = vi.mocked(Alert.alert).mock.calls[1]!;
    expect(m2).toBe("目標の削除に失敗しました");
    expect(String(t2) + String(m2)).not.toContain("SECRET_RAW_RLS");
    expect(h.goBack).not.toHaveBeenCalled();
  });
});

describe("S4 マイルストーン操作 (詳細内)", () => {
  it("追加 -> MilestoneForm {goalId}、編集 -> {goalId, milestoneId}", async () => {
    renderScreen();
    await flush();
    fireEvent.click(byLabel("追加")[0]!);
    expect(h.navigate).toHaveBeenLastCalledWith("MilestoneForm", { goalId: "g1" });
    const editMs = byLabel("編集").slice(-2);
    fireEvent.click(editMs[0]!);
    expect(h.navigate).toHaveBeenLastCalledWith("MilestoneForm", { goalId: "g1", milestoneId: "m1" });
  });

  it("マイルストーン削除: 確認 -> deleteMilestone('m1') -> 失敗は固定文言", async () => {
    renderScreen();
    await flush();
    const dels = byLabel("削除");
    fireEvent.click(dels[1]!); // [0] は目標の削除
    await confirmDestructive();
    expect(h.deleteMilestone).toHaveBeenCalledWith("m1");

    vi.mocked(Alert.alert).mockClear();
    h.deleteMilestone.mockRejectedValue(new Error("SECRET_RAW_MS"));
    fireEvent.click(byLabel("削除")[1]!);
    await confirmDestructive();
    const [, m] = vi.mocked(Alert.alert).mock.calls[1]!;
    expect(String(m)).not.toContain("SECRET_RAW_MS");
    expect(String(m)).toBe("マイルストーンの削除に失敗しました");
  });
});
