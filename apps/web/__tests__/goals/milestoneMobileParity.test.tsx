/**
 * apps/web/__tests__/goals/milestoneMobileParity.test.tsx
 *
 * mobile (e142f4f2) に合わせて web に入れたマイルストーン機能の回帰ガード:
 *   - フォームのタブは 練習タイム目標 / サークルイン目標 / その他 (旧「タイム目標」を出さない)
 *   - 練習タイム目標は 1本×1セットなら「目標タイム」、それ以外は「平均目標タイム」。保存は reps_time
 *   - 旧 time 型のマイルストーンは練習タイム目標 (1本×1セット) として編集できる
 *   - その他: 内容 (title) 必須・params {} で保存。既存の「その他」も編集できる
 *   - 一覧の「完了にする」(即時) / 「未完了に戻す」(確認してから) → setMilestoneCompletion
 *   - テンプレート追加は 1本×1セットでは出さない。テンプレート作成だけ失敗した再保存で二重作成しない
 *   - 達成の確認ダイアログ: 候補を「達成！」で確定 / 「キャンセル」で取り下げ。枠外クリックでは閉じない
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GoalWithMilestones, Milestone, Style } from "@apps/shared/types";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) => {
      const t = (key: string, values?: Record<string, unknown>) =>
        (namespace ? `${namespace}.${key}` : key) + (values ? `|${JSON.stringify(values)}` : "");
      t.raw = () => ["日", "月", "火", "水", "木", "金", "土"];
      return t as unknown as ReturnType<typeof original.useTranslations>;
    },
    useLocale: () => "ja",
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/ja/dashboard" }));
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/hooks/queries/user", () => ({ useUserProfileQuery: () => ({ data: null, isLoading: false }) }));

const mocks = vi.hoisted(() => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  setMilestoneCompletion: vi.fn(),
  getPendingAchievementMilestones: vi.fn(),
  confirmMilestoneAchievement: vi.fn(),
  dismissMilestoneCandidate: vi.fn(),
  configureMilestoneJudgment: vi.fn(),
  createTemplate: vi.fn(),
}));
vi.mock("@apps/shared/api/goals", () => ({
  configureMilestoneJudgment: mocks.configureMilestoneJudgment,
  GoalAPI: vi.fn().mockImplementation(function () {
    return {
      createMilestone: mocks.createMilestone,
      updateMilestone: mocks.updateMilestone,
      deleteMilestone: mocks.deleteMilestone,
      setMilestoneCompletion: mocks.setMilestoneCompletion,
      getPendingAchievementMilestones: mocks.getPendingAchievementMilestones,
      confirmMilestoneAchievement: mocks.confirmMilestoneAchievement,
      dismissMilestoneCandidate: mocks.dismissMilestoneCandidate,
    };
  }),
}));
vi.mock("@swim-hub/shared/api", () => ({
  PracticeLogTemplateAPI: vi.fn().mockImplementation(function () {
    return { createTemplate: mocks.createTemplate };
  }),
}));
vi.mock("@/components/ui/DatePicker", () => ({
  default: () => <span data-testid="date-picker" />,
}));

import MilestoneCreateModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal";
import MilestoneEditModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneEditModal";
import MilestoneList from "../../app/[locale]/(authenticated)/goals/_components/MilestoneList";
import MilestoneAchievementPrompter from "../../components/goals/MilestoneAchievementPrompter";

const style: Style = { id: 1, name_jp: "100m自由形", name: "100Fr", style: "Fr", distance: 100 } as Style;
const goal = {
  id: "g1", user_id: "u1", competition_id: null, style_id: 1, target_time: 60, status: "active",
  achieved_at: null, reflection_note: null, created_at: "", updated_at: "", competition: null, style, milestones: [],
} as unknown as GoalWithMilestones;

const baseMilestone = {
  goal_id: "g1", deadline: null, status: "in_progress", achieved_at: null, reflection_done: false,
  reflection_note: null, created_at: "", updated_at: "", achievement_candidate: null, candidate_dismissed_at: null,
};
const otherMilestone = { ...baseMilestone, id: "m-other", title: "ベンチプレス100kg", type: "other", params: {} } as unknown as Milestone;
const legacyTimeMilestone = {
  ...baseMilestone, id: "m-time", title: "50m", type: "time",
  params: { distance: 50, target_time: 30, style: "Fr", swim_category: "Swim" },
} as unknown as Milestone;

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>);
const submit = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
  });
};

let spies: Array<{ mockRestore: () => void }> = [];
beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createMilestone.mockResolvedValue({ id: "created-1" });
  mocks.updateMilestone.mockResolvedValue({});
  mocks.setMilestoneCompletion.mockResolvedValue({});
  mocks.getPendingAchievementMilestones.mockResolvedValue([]);
  mocks.confirmMilestoneAchievement.mockResolvedValue({});
  mocks.dismissMilestoneCandidate.mockResolvedValue({});
  mocks.createTemplate.mockResolvedValue({});
  spies = [
    vi.spyOn(window, "alert").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  cleanup();
  spies.forEach((s) => s.mockRestore());
});

const openCreate = () =>
  wrap(
    <MilestoneCreateModal isOpen onClose={() => {}} onSuccess={async () => {}} goalId="g1" goal={goal} styles={[style]} goalCompetitionDate="" />,
  );

describe("マイルストーンフォーム: タブ", () => {
  it("練習タイム目標 / サークルイン目標 / その他 の3つで、旧タイム目標・練習平均タイム目標は出さない", () => {
    openCreate();
    const radios = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value);
    expect(radios).toEqual(["practice_time", "set", "other"]);
    expect(screen.queryByText("goals.milestoneForm.type.time.label")).toBeNull();
    expect(screen.queryByText("goals.milestoneForm.type.repsTime.label")).toBeNull();
    // 説明はホバーではなく常に表示する
    expect(screen.getByText("goals.milestoneForm.type.practiceTime.description")).toBeInTheDocument();
  });

  it("練習タイム目標は 1本×1セットで「目標タイム」、本数を増やすと「平均目標タイム」。どちらも reps_time で保存", async () => {
    const user = userEvent.setup();
    openCreate();
    expect(screen.getByText("goals.paramsForm.targetTimeLabel")).toBeInTheDocument();
    // 1本×1セットはテンプレートに追加できない (練習メニューにならない)
    expect(screen.queryByText("goals.milestoneCreate.addToTemplateLabel")).toBeNull();

    const reps = screen.getByLabelText("goals.paramsForm.repsLabel");
    await user.clear(reps);
    await user.type(reps, "4");
    expect(screen.getByText("goals.paramsForm.averageTimeLabel")).toBeInTheDocument();
    expect(screen.getByText("goals.milestoneCreate.addToTemplateLabel")).toBeInTheDocument();

    await submit();
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
    expect(mocks.createMilestone.mock.calls[0]![0]).toMatchObject({ goalId: "g1", type: "reps_time" });
    expect(mocks.createMilestone.mock.calls[0]![0].params).toMatchObject({ reps: 4, sets: 1 });
  });

  it("タイムトライアルのテンプレートは練習タイム目標の1本×1セット (目標タイムの101%) になる", async () => {
    const user = userEvent.setup();
    openCreate();
    await user.selectOptions(document.querySelector("select") as unknown as HTMLElement, "time_trial");
    await submit();
    expect(mocks.createMilestone.mock.calls[0]![0]).toMatchObject({
      type: "reps_time",
      params: { distance: 100, reps: 1, sets: 1, target_average_time: 60.6, style: "Fr" },
    });
  });
});

describe("その他タイプ", () => {
  it("内容が空なら保存せずエラー、入力すると title=内容・params={} で作成する", async () => {
    const user = userEvent.setup();
    openCreate();
    await user.click(screen.getByLabelText("goals.milestoneForm.type.other.label"));
    await submit();
    expect(mocks.createMilestone).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("goals.milestoneForm.otherContentRequired");

    await user.type(screen.getByLabelText("goals.milestoneForm.otherContentLabel"), "  ランニング毎日  ");
    expect(screen.queryByText("goals.milestoneForm.otherContentRequired")).toBeNull();
    await submit();
    expect(mocks.createMilestone).toHaveBeenCalledWith({
      goalId: "g1",
      title: "ランニング毎日",
      type: "other",
      params: {},
      deadline: null,
    });
  });

  it("既存の「その他」を編集できる (内容欄に title が入り、保存で updateMilestone)", async () => {
    const user = userEvent.setup();
    wrap(<MilestoneEditModal isOpen onClose={() => {}} onSuccess={async () => {}} milestone={otherMilestone} styles={[style]} goalCompetitionDate="" />);
    const content = (await screen.findByLabelText("goals.milestoneForm.otherContentLabel")) as HTMLTextAreaElement;
    expect(content.value).toBe("ベンチプレス100kg");
    await user.clear(content);
    await user.type(content, "ベンチプレス110kg");
    await submit();
    expect(mocks.updateMilestone).toHaveBeenCalledWith("m-other", {
      type: "other",
      title: "ベンチプレス110kg",
      params: {},
      deadline: null,
    });
  });
});

describe("旧タイム目標 (time 型) の編集", () => {
  it("練習タイム目標の1本×1セットとして開き、reps_time で保存する", async () => {
    wrap(<MilestoneEditModal isOpen onClose={() => {}} onSuccess={async () => {}} milestone={legacyTimeMilestone} styles={[style]} goalCompetitionDate="" />);
    await screen.findByText("goals.paramsForm.targetTimeLabel");
    expect((screen.getByDisplayValue("practice_time") as HTMLInputElement).checked).toBe(true);
    await submit();
    expect(mocks.updateMilestone).toHaveBeenCalledWith("m-time", {
      type: "reps_time",
      title: "50m",
      params: { distance: 50, reps: 1, sets: 1, target_average_time: 30, style: "Fr", swim_category: "Swim", circle: 0 },
      deadline: null,
    });
  });
});

describe("テンプレート作成だけ失敗した再保存", () => {
  it("マイルストーンを二重に作らず、作成済みの行を更新する", async () => {
    const user = userEvent.setup();
    openCreate();
    await user.click(screen.getByLabelText("goals.milestoneForm.type.set.label"));
    await user.click(screen.getByLabelText(/goals.milestoneCreate.addToTemplateLabel/));
    mocks.createTemplate.mockRejectedValueOnce(new Error("template failed"));
    await submit();
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);

    await submit();
    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
    expect(mocks.updateMilestone).toHaveBeenCalledWith("created-1", expect.objectContaining({ type: "set" }));
    expect(mocks.createTemplate).toHaveBeenCalledTimes(2);
  });
});

describe("一覧: 手動で完了にする / 未完了に戻す", () => {
  it("「完了にする」は確認なしで setMilestoneCompletion(milestone, true)", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<MilestoneList milestones={[otherMilestone]} styles={[style]} goalCompetitionDate="" onUpdate={onUpdate} />);
    // その他タイプも編集できる
    expect(screen.getByRole("button", { name: "goals.milestone.edit" })).toBeInTheDocument();
    await user.click(screen.getByTestId("milestone-mark-complete"));
    expect(mocks.setMilestoneCompletion).toHaveBeenCalledWith(otherMilestone, true);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it("「未完了に戻す」は確認ダイアログで確定したときだけ setMilestoneCompletion(milestone, false)", async () => {
    const achieved = { ...otherMilestone, status: "achieved", achieved_at: "2026-11-01T00:00:00Z" } as Milestone;
    const user = userEvent.setup();
    wrap(<MilestoneList milestones={[achieved]} styles={[style]} goalCompetitionDate="" onUpdate={async () => {}} />);
    await user.click(screen.getByTestId("milestone-mark-incomplete"));
    expect(screen.getByText("goals.milestone.markIncompleteConfirm")).toBeInTheDocument();
    expect(mocks.setMilestoneCompletion).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-dialog-confirm-button"));
    expect(mocks.setMilestoneCompletion).toHaveBeenCalledWith(achieved, false);
  });
});

describe("達成の確認ダイアログ (MilestoneAchievementPrompter)", () => {
  const candidate = {
    ...baseMilestone,
    id: "m-cand",
    title: "100m 1:00切り",
    type: "reps_time",
    params: { distance: 100, reps: 1, sets: 1, target_average_time: 60, style: "Fr", swim_category: "Swim", circle: 0 },
    achievement_candidate: { practice_log_id: "pl1", record_id: null, achieved_value: { time: 59.85 } },
  } as unknown as Milestone;

  it("読み込み時に判定を確認モード (autoAchieve: false) にする", async () => {
    vi.resetModules();
    await import("../../utils/milestoneJudgment");
    expect(mocks.configureMilestoneJudgment).toHaveBeenCalledWith({ autoAchieve: false });
  });

  it("候補が無ければ何も出さない", async () => {
    wrap(<MilestoneAchievementPrompter />);
    await waitFor(() => expect(mocks.getPendingAchievementMilestones).toHaveBeenCalled());
    expect(screen.queryByTestId("milestone-achievement-prompt")).toBeNull();
  });

  it("候補をタイトル・根拠のタイム付きで出し、「達成！」で confirmMilestoneAchievement", async () => {
    mocks.getPendingAchievementMilestones.mockResolvedValueOnce([candidate]).mockResolvedValue([]);
    const user = userEvent.setup();
    wrap(<MilestoneAchievementPrompter />);
    expect(await screen.findByText("goals.achievementPrompt.title")).toBeInTheDocument();
    expect(screen.getByText("100m 1:00切り")).toBeInTheDocument();
    expect(screen.getByText('goals.achievementPrompt.recordTime|{"time":"59.85"}')).toBeInTheDocument();

    await user.click(screen.getByTestId("milestone-achievement-confirm"));
    expect(mocks.confirmMilestoneAchievement).toHaveBeenCalledWith(candidate);
    expect(mocks.dismissMilestoneCandidate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("milestone-achievement-prompt")).toBeNull());
  });

  it("「キャンセル」で dismissMilestoneCandidate。枠外クリックや Esc では取り下げない", async () => {
    mocks.getPendingAchievementMilestones.mockResolvedValueOnce([candidate]).mockResolvedValue([]);
    const user = userEvent.setup();
    wrap(<MilestoneAchievementPrompter />);
    const dialog = await screen.findByTestId("milestone-achievement-prompt");

    fireEvent.click(dialog.firstElementChild!);
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("milestone-achievement-prompt")).toBeInTheDocument();
    expect(mocks.dismissMilestoneCandidate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("milestone-achievement-dismiss"));
    expect(mocks.dismissMilestoneCandidate).toHaveBeenCalledWith(candidate);
    expect(mocks.confirmMilestoneAchievement).not.toHaveBeenCalled();
  });

  it("確定に失敗したらダイアログを残してエラーを出す", async () => {
    mocks.getPendingAchievementMilestones.mockResolvedValue([candidate]);
    mocks.confirmMilestoneAchievement.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    wrap(<MilestoneAchievementPrompter />);
    await user.click(await screen.findByTestId("milestone-achievement-confirm"));
    expect(await screen.findByRole("alert")).toHaveTextContent("goals.milestone.completionFailed");
    expect(screen.getByTestId("milestone-achievement-prompt")).toBeInTheDocument();
  });
});
