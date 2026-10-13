// =============================================================================
// components/goals/__tests__/ReflectionModals.test.tsx  (S8, C1, L5)
// =============================================================================
// GoalReflectionModal / ReflectionModal (CenterModal)。GoalAPI は引数を assert。
// reflectionNote の期待文字列は ja のリテラル (翻訳済みラベルを保存する既存仕様)。
// 壊したら赤:
//   - mobile ReflectionModal の null 保存ガード (reflectionNote===null で保存させない) を外す -> '何も選ばず保存' ケース赤
//   - 達成/未達成の status 取り違え / reflectionNote の組み立て変更
//   - savingRef を外す -> 二重タップ赤
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ updateGoal: vi.fn(), updateMilestone: vi.fn() }));
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 1, fontScale: 1 }),
    TextInput: ({ onChangeText, value, editable, testID, ...props }: { onChangeText?: (t: string) => void; value?: string; editable?: boolean; testID?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text", ...props, "data-testid": testID, value, disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    updateGoal = h.updateGoal;
    updateMilestone = h.updateMilestone;
  },
}));

import { Alert } from "react-native";
import { GoalReflectionModal } from "../GoalReflectionModal";
import { ReflectionModal } from "../ReflectionModal";

const goal = (over: Record<string, unknown> = {}) => ({
  id: "g1", user_id: "u1", competition_id: "c1", style_id: 1, target_time: 60, start_time: 70, status: "active",
  achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
  competition: { id: "c1", title: "県大会", date: "2026-01-01", pool_type: 0, team_id: null },
  style: { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 },
  milestones: [{ id: "m1", status: "achieved" }, { id: "m2", status: "in_progress" }], ...over,
}) as never;
const milestone = (over: Record<string, unknown> = {}) => ({
  id: "m1", goal_id: "g1", title: "MSタイトル", type: "time",
  params: { distance: 100, target_time: 83.45, style: "Fr", swim_category: "Swim" },
  deadline: "2026-01-01", status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null,
  created_at: "", updated_at: "", ...over,
}) as never;

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const byLabel = (l: string) => Array.from(document.querySelectorAll(`[accessibilitylabel="${l}"]`)) as HTMLElement[];
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeEach(() => {
  h.updateGoal.mockReset().mockResolvedValue({});
  h.updateMilestone.mockReset().mockResolvedValue({});
  vi.mocked(Alert.alert).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("GoalReflectionModal", () => {
  function setup(g = goal()) {
    const onSkip = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    wrap(<GoalReflectionModal goal={g} onSkip={onSkip} onSaved={onSaved} />);
    return { onSkip, onSaved };
  }

  it("概要: 大会名・目標タイム・初期タイム・マイルストーン達成 1/2", () => {
    setup();
    const text = document.body.textContent ?? "";
    expect(text).toContain("県大会");
    expect(text).toContain("1:00.00");
    expect(text).toContain("1:10.00");
    expect(text).toContain("マイルストーン達成: 1/2");
  });

  it("大会情報なし (competition null) でも描画でき '大会情報なし' を表示", () => {
    setup(goal({ competition: null }));
    expect(document.body.textContent).toContain("大会情報なし");
  });

  it("『達成した！』-> updateGoal('g1', {status:'achieved'}) 1回、onSaved 1回", async () => {
    const { onSaved } = setup();
    await act(async () => { fireEvent.click(screen.getByText("達成した！")); });
    expect(h.updateGoal).toHaveBeenCalledTimes(1);
    expect(h.updateGoal).toHaveBeenCalledWith("g1", { status: "achieved" });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("『達成できなかった』-> 選択肢が出る。何も選ばず保存 -> status=cancelled / reflectionNote=null (目標は status が変わるので null 可)", async () => {
    setup();
    expect(screen.queryByText("振り返り（選択式）")).toBeNull();
    fireEvent.click(screen.getByText("達成できなかった"));
    expect(screen.getByText("振り返り（選択式）")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("保存")); });
    expect(h.updateGoal).toHaveBeenCalledWith("g1", { status: "cancelled", reflectionNote: null });
  });

  it("選択2件 + その他 + 自由記述: reflectionNote が翻訳済みラベルの改行連結 (選択順保持)", async () => {
    setup();
    fireEvent.click(screen.getByText("達成できなかった"));
    fireEvent.click(byLabel("練習量が足りなかった")[0]!);
    fireEvent.click(byLabel("目標タイムが高すぎた")[0]!);
    fireEvent.click(byLabel("その他")[0]!);
    fireEvent.change(byLabel("その他（自由記述）")[0]!, { target: { value: "怪我" } });
    await act(async () => { fireEvent.click(screen.getByText("保存")); });
    expect(h.updateGoal).toHaveBeenCalledWith("g1", {
      status: "cancelled",
      reflectionNote: "練習量が足りなかった\n目標タイムが高すぎた\nその他\nその他: 怪我",
    });
  });

  it("[v4 L5] 『その他』を外したら、入力済みの自由記述は reflectionNote に混入しない", async () => {
    setup();
    fireEvent.click(screen.getByText("達成できなかった"));
    fireEvent.click(byLabel("目標タイムが高すぎた")[0]!);
    fireEvent.click(byLabel("その他")[0]!);
    fireEvent.change(byLabel("その他（自由記述）")[0]!, { target: { value: "怪我" } });
    fireEvent.click(byLabel("その他")[0]!); // 外す
    await act(async () => { fireEvent.click(screen.getByText("保存")); });
    expect(h.updateGoal).toHaveBeenCalledWith("g1", { status: "cancelled", reflectionNote: "目標タイムが高すぎた" });
  });

  it("スキップ (入力欄表示後) -> onSkip のみ。updateGoal は呼ばれない", () => {
    const { onSkip } = setup();
    fireEvent.click(screen.getByText("達成できなかった"));
    fireEvent.click(screen.getByText("スキップ"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(h.updateGoal).not.toHaveBeenCalled();
  });

  it("[v6] 目標の振り返りモーダルに『目標管理を見る』リンクは無い (遷移先の目標タブに過去の目標は出ない)。マイルストーン側には残る", () => {
    setup();
    expect(screen.queryByText("目標管理を見る")).toBeNull();
    expect(document.querySelector('[accessibilityrole="link"]')).toBeNull();
  });

  it("二重タップで updateGoal は1回", async () => {
    let release!: () => void;
    h.updateGoal.mockImplementation(() => new Promise((r) => { release = () => r({}); }));
    setup();
    await act(async () => { fireEvent.click(screen.getByText("達成した！")); fireEvent.click(screen.getByText("達成した！")); });
    expect(h.updateGoal).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 20)); });
  });

  it("保存失敗: 固定文言のアラート、onSaved は呼ばれない (閉じない)、生エラー非表示", async () => {
    h.updateGoal.mockRejectedValue(new Error("SECRET_RAW"));
    const { onSaved } = setup();
    await act(async () => { fireEvent.click(screen.getByText("達成した！")); });
    await tick();
    expect(onSaved).not.toHaveBeenCalled();
    const [, msg] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(msg).toBe("目標の更新に失敗しました");
    expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain("SECRET_RAW");
  });
});

describe("ReflectionModal (マイルストーン)", () => {
  function setup(m = milestone()) {
    const onSkip = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onGoToGoals = vi.fn();
    wrap(<ReflectionModal milestone={m} onSkip={onSkip} onSaved={onSaved} onGoToGoals={onGoToGoals} />);
    return { onSkip, onSaved, onGoToGoals };
  }
  const saveBtn = () => screen.getByText("保存").closest("button") as HTMLButtonElement;

  it("概要文は formatTimeBest 形式 ('100m × 1本: 1:23.45')。旧 web の '83.45秒' ではない", () => {
    setup();
    expect(screen.getByText("100m × 1本: 1:23.45")).toBeTruthy();
    expect(document.body.textContent).not.toContain("83.45秒");
  });

  it("[C1/e] 何も選ばず保存: ボタンは disabled、押しても updateMilestone は呼ばれない (reflection_done が立たず再表示され続けるのを防ぐ)", async () => {
    const { onSaved } = setup();
    expect(saveBtn().disabled).toBe(true);
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(h.updateMilestone).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("1つ選ぶと有効: updateMilestone('m1', {reflectionNote: 'ラベル'}) 1回、onSaved 1回", async () => {
    const { onSaved } = setup();
    fireEvent.click(byLabel("目標が高すぎた")[0]!);
    expect(saveBtn().disabled).toBe(false);
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(h.updateMilestone).toHaveBeenCalledTimes(1);
    expect(h.updateMilestone).toHaveBeenCalledWith("m1", { reflectionNote: "目標が高すぎた" });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("『その他』のみ選択 + 自由記述: 'その他\\nその他: 怪我'", async () => {
    setup();
    fireEvent.click(byLabel("その他")[0]!);
    fireEvent.change(byLabel("その他（自由記述）")[0]!, { target: { value: "怪我" } });
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(h.updateMilestone).toHaveBeenCalledWith("m1", { reflectionNote: "その他\nその他: 怪我" });
  });

  it("[v4 L5] 『その他』を外すと自由記述は混入しない。他に選択が無ければ再び保存不可", async () => {
    setup();
    fireEvent.click(byLabel("その他")[0]!);
    fireEvent.change(byLabel("その他（自由記述）")[0]!, { target: { value: "怪我" } });
    fireEvent.click(byLabel("その他")[0]!);
    expect(saveBtn().disabled).toBe(true);
    fireEvent.click(byLabel("コンディション不良")[0]!);
    await act(async () => { fireEvent.click(saveBtn()); });
    expect(h.updateMilestone).toHaveBeenCalledWith("m1", { reflectionNote: "コンディション不良" });
  });

  it("[v6] マイルストーンのモーダルには『目標管理を見る』が残り、押すと onGoToGoals", () => {
    const { onGoToGoals } = setup();
    fireEvent.click(screen.getByText("目標管理を見る"));
    expect(onGoToGoals).toHaveBeenCalledTimes(1);
  });

  it("スキップ -> onSkip のみ。常に押せる (disabled でない)", () => {
    const { onSkip } = setup();
    const skip = screen.getByText("スキップ").closest("button") as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(h.updateMilestone).not.toHaveBeenCalled();
  });

  it("二重タップで updateMilestone は1回。失敗時は固定文言アラート + onSaved 無し", async () => {
    let release!: () => void;
    h.updateMilestone.mockImplementation(() => new Promise((r) => { release = () => r({}); }));
    setup();
    fireEvent.click(byLabel("コンディション不良")[0]!);
    await act(async () => { fireEvent.click(saveBtn()); fireEvent.click(saveBtn()); });
    expect(h.updateMilestone).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 20)); });

    cleanup();
    h.updateMilestone.mockReset().mockRejectedValue(new Error("SECRET_RAW"));
    const { onSaved } = setup();
    fireEvent.click(byLabel("コンディション不良")[0]!);
    await act(async () => { fireEvent.click(saveBtn()); });
    await tick();
    expect(onSaved).not.toHaveBeenCalled();
    expect(vi.mocked(Alert.alert).mock.calls[0]![1]).toBe("内省メモの保存に失敗しました");
  });
});
