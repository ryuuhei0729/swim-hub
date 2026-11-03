// =============================================================================
// MilestoneAchievementPrompter — 達成の確認ダイアログ
// =============================================================================
//  - 達成候補があれば「もしかしてマイルストーンを達成しましたか？」を出し、本文はタイトル・要約・記録
//  - 「達成！」で confirmMilestoneAchievement、「キャンセル」で dismissMilestoneCandidate
//  - 答えるまで次のダイアログを重ねない。答えたら取り直して次の候補を出す
//  - Android の枠外タップで閉じない (cancelable: false)
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Milestone } from "@apps/shared/types";

const h = vi.hoisted(() => ({
  pending: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    getPendingAchievementMilestones = h.pending;
    confirmMilestoneAchievement = h.confirm;
    dismissMilestoneCandidate = h.dismiss;
  },
}));

import { Alert } from "react-native";
import { MilestoneAchievementPrompter } from "../MilestoneAchievementPrompter";

function ms(over: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1", goal_id: "g1", title: "50m: 30.00", type: "reps_time",
    params: { distance: 50, reps: 1, sets: 1, target_average_time: 30, style: "Fr", swim_category: "Swim", circle: 0 },
    deadline: null, status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null,
    achievement_candidate: { practice_log_id: "l1", record_id: null, achieved_value: { time: 29.85, target_time: 30 }, detected_at: "" },
    candidate_dismissed_at: null, created_at: "", updated_at: "", ...over,
  } as Milestone;
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
};
type Button = { text: string; style?: string; onPress?: () => void };
const alertCall = (i = 0) => vi.mocked(Alert.alert).mock.calls[i]!;
const press = async (label: string, i = 0) => {
  const buttons = alertCall(i)[2] as Button[];
  await act(async () => { buttons.find((b) => b.text === label)!.onPress!(); });
  await flush();
};

function renderPrompter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}><MilestoneAchievementPrompter /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(Alert.alert).mockClear();
  h.pending.mockReset();
  h.confirm.mockReset().mockResolvedValue({});
  h.dismiss.mockReset().mockResolvedValue({});
});
afterEach(() => cleanup());

describe("MilestoneAchievementPrompter", () => {
  it("候補が無ければ何も出さない", async () => {
    h.pending.mockResolvedValue([]);
    renderPrompter();
    await flush();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("候補があればタイトル + 記録を本文に出し、閉じられない (cancelable: false)", async () => {
    h.pending.mockResolvedValue([ms({ title: "練習で30秒切り" })]);
    renderPrompter();
    await flush();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons, options] = alertCall();
    expect(title).toBe("もしかしてマイルストーンを達成しましたか？");
    expect(message).toBe("練習で30秒切り\n50m: 30.00\n記録: 29.85");
    expect((buttons as Button[]).map((b) => b.text)).toEqual(["キャンセル", "達成！"]);
    expect(options).toEqual({ cancelable: false });
  });

  it("その他タイプはタイトルだけ (要約を重ねない)", async () => {
    h.pending.mockResolvedValue([ms({ type: "other", title: "ベンチプレス100kg×2", params: {}, achievement_candidate: { practice_log_id: null, record_id: null, achieved_value: {}, detected_at: "" } })]);
    renderPrompter();
    await flush();
    expect(alertCall()[1]).toBe("ベンチプレス100kg×2");
  });

  it("「達成！」で confirmMilestoneAchievement、答えたら次の候補を出す", async () => {
    h.pending.mockResolvedValueOnce([ms(), ms({ id: "m2" })]).mockResolvedValue([ms({ id: "m2" })]);
    renderPrompter();
    await flush();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await press("達成！");
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
    expect(h.dismiss).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    await press("キャンセル", 1);
    expect(h.dismiss).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
  });

  it("保存に失敗したら固定文言のエラーを出す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.pending.mockResolvedValueOnce([ms()]).mockResolvedValue([]);
    h.confirm.mockRejectedValue(new Error("SECRET"));
    renderPrompter();
    await flush();
    await press("達成！");
    expect(Alert.alert).toHaveBeenCalledWith(expect.any(String), "マイルストーンの更新に失敗しました");
  });
});
