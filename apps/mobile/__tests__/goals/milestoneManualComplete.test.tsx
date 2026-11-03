// =============================================================================
// __tests__/goals/milestoneManualComplete.test.tsx
// =============================================================================
// マイルストーンの手動完了 (2026-11-03 追加) と「その他」タイプの表示を固定する。
//  - 未達成には「完了にする」、達成済みには「未完了に戻す」を出す (どのタイプでも)
//  - 完了はワンタップで GoalAPI.setMilestoneCompletion(milestone, true)
//  - 未完了に戻すは確認ダイアログを経てから (milestone, false)
//  - 「その他」はタイトル = 内容なので、要約文を重ねて出さない
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalWithMilestones, Milestone } from "@apps/shared/types";

const h = vi.hoisted(() => ({
  getGoalCurrentBestTime: vi.fn(),
  getGoalWithMilestones: vi.fn(),
  setMilestoneCompletion: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    getGoalCurrentBestTime = h.getGoalCurrentBestTime;
    getGoalWithMilestones = h.getGoalWithMilestones;
    setMilestoneCompletion = h.setMilestoneCompletion;
    deleteGoal = vi.fn();
    deleteMilestone = vi.fn();
  },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
  useRoute: () => ({ params: { goalId: "goal-1" } }),
}));
vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: (refresh: () => Promise<unknown>) => ({ refreshing: false, handleRefresh: refresh }),
}));

import { Alert } from "react-native";
import { MilestoneList } from "@/components/goals/MilestoneList";
import { GoalDetailScreen } from "@/screens/GoalDetailScreen";

function milestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: "ms-1", goal_id: "goal-1", title: "練習タイム：25秒台", type: "time",
    params: { distance: 50, target_time: 25.99, style: "Fr", swim_category: "Swim" },
    deadline: null, status: "in_progress", achieved_at: null,
    reflection_done: false, reflection_note: null, created_at: "", updated_at: "",
    ...over,
  } as Milestone;
}
const otherMilestone = (over: Partial<Milestone> = {}) =>
  milestone({ id: "ms-o", type: "other", title: "ベンチプレス100kg×2", params: {}, ...over });

function detailGoal(milestones: Milestone[]): GoalWithMilestones {
  return {
    id: "goal-1", user_id: "u1", competition_id: null, style_id: 1, target_time: 23.79,
    status: "active", achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: null,
    style: { id: 1, name_jp: "50m自由形", name: "50m Fr", style: "Fr", distance: 50 } as never,
    milestones,
  } as GoalWithMilestones;
}
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
async function renderDetail(milestones: Milestone[]) {
  h.getGoalWithMilestones.mockResolvedValue(detailGoal(milestones));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={qc}><GoalDetailScreen /></QueryClientProvider>);
  await flush();
}
const byLabel = (l: string) => Array.from(document.querySelectorAll(`[accessibilitylabel="${l}"]`)) as HTMLElement[];

beforeEach(() => {
  h.getGoalCurrentBestTime.mockReset().mockResolvedValue(null);
  h.getGoalWithMilestones.mockReset();
  h.setMilestoneCompletion.mockReset().mockResolvedValue({});
  vi.mocked(Alert.alert).mockClear();
});
afterEach(() => cleanup());

describe("MilestoneList: 手動完了ボタン", () => {
  it("未達成 (未着手・進行中・期限切れ・その他) は『完了にする』、達成済みは『未完了に戻す』", () => {
    const onToggle = vi.fn();
    render(
      <MilestoneList
        milestones={[
          milestone({ id: "a", status: "not_started" }),
          milestone({ id: "b", status: "in_progress" }),
          milestone({ id: "c", status: "expired" }),
          otherMilestone(),
          milestone({ id: "d", status: "achieved", achieved_at: "2026-11-01T00:00:00Z" }),
        ]}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggleComplete={onToggle}
      />,
    );
    expect(byLabel("完了にする")).toHaveLength(4);
    expect(byLabel("未完了に戻す")).toHaveLength(1);
    fireEvent.click(byLabel("完了にする")[3]!);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "ms-o" }), true);
    fireEvent.click(byLabel("未完了に戻す")[0]!);
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "d" }), false);
  });

  it("その他タイプはタイトル (内容) だけを出し、要約文を重ねない", () => {
    render(
      <MilestoneList milestones={[otherMilestone()]} onEdit={() => {}} onDelete={() => {}} onToggleComplete={() => {}} />,
    );
    expect(screen.getAllByText("ベンチプレス100kg×2")).toHaveLength(1);
  });
});

describe("MilestoneList: ステータスアイコン (web getStatusIcon と同じ対応)", () => {
  it.each([
    ["achieved", "達成", "icon-check-circle", "#16A34A"],
    ["in_progress", "進行中", "icon-clock", "#2563EB"],
    ["expired", "期限切れ", "icon-alert-triangle", "#CA8A04"],
    ["not_started", "未着手", "icon-clock", "#9CA3AF"],
  ] as const)("%s は『%s』ラベル付きで %s (%s) を出す", (status, label, iconTestId, color) => {
    render(
      <MilestoneList
        milestones={[milestone({ id: "s", status })]}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggleComplete={() => {}}
      />,
    );
    const [indicator] = byLabel(label);
    expect(indicator).toBeDefined();
    const icon = indicator!.querySelector(`[data-testid="${iconTestId}"]`);
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("color")).toBe(color);
  });
});

describe("GoalDetailScreen: 手動完了の保存", () => {
  it("『完了にする』は確認なしで setMilestoneCompletion(milestone, true)", async () => {
    await renderDetail([otherMilestone()]);
    await act(async () => { fireEvent.click(byLabel("完了にする")[0]!); });
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(h.setMilestoneCompletion).toHaveBeenCalledTimes(1);
    expect(h.setMilestoneCompletion).toHaveBeenCalledWith(expect.objectContaining({ id: "ms-o" }), true);
  });

  it("『未完了に戻す』は確認ダイアログの OK 後に setMilestoneCompletion(milestone, false)", async () => {
    await renderDetail([otherMilestone({ status: "achieved", achieved_at: "2026-11-01T00:00:00Z" })]);
    fireEvent.click(byLabel("未完了に戻す")[0]!);
    expect(h.setMilestoneCompletion).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{ style?: string; onPress?: () => void }>;
    await act(async () => { buttons.find((b) => b.style !== "cancel")!.onPress!(); });
    await flush();
    expect(h.setMilestoneCompletion).toHaveBeenCalledWith(expect.objectContaining({ id: "ms-o" }), false);
  });

  it("保存失敗は固定文言のエラーダイアログ", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.setMilestoneCompletion.mockRejectedValue(new Error("SECRET"));
    await renderDetail([otherMilestone()]);
    await act(async () => { fireEvent.click(byLabel("完了にする")[0]!); });
    await flush();
    expect(Alert.alert).toHaveBeenCalledWith(expect.any(String), "マイルストーンの更新に失敗しました");
  });
});
