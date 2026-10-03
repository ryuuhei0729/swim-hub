/**
 * apps/web/__tests__/goals/milestoneModalTimeValidation.test.tsx
 *
 * マイルストーン作成/編集モーダルの submit 時、目標タイム欄 (type: "time" の
 * target_time / type: "reps_time" の target_average_time) が読み取れない
 * 入力のまま確定されていた場合に、保存 API を呼ばずエラー表示することを検証する。
 *
 * 背景: TimeSecondsInput は途中入力でパースできない値を親へ null で通知するが、
 * MilestoneParamsForm はその null を `target_time ?? 0` のように 0 へ変換して
 * state に保持する。0 は「意味の無い目標タイム」であり、そのまま保存すると
 * 達成判定が成立しない目標タイム 0 秒のマイルストーンが保存されてしまう。
 * `isMilestoneTimeValueValid` (apps/shared/types/goals.ts) による submit 前検証は
 * これを防ぐガード。
 *
 * トートロジー防止メモ: 「保存 API が呼ばれないこと」と「エラー文言が表示されること」を
 * 実際にモーダルを render・操作して確認する。isMilestoneTimeValueValid 自体の
 * 単体テストは apps/shared/__tests__/types/goals.test.ts が別途持つ。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GoalWithMilestones, Milestone, Style } from "@apps/shared/types";

// MilestoneCreateModal は常時マウントされる GoalSetCalculatorModal (isOpen=false でも
// 内部の useUserProfileQuery は実行される) を含むため QueryClientProvider が必要。
function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) => {
      const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
      // DatePicker (MilestoneForm の締切日欄) が t.raw("datePicker.weekdays") を
      // 曜日ラベル配列として使う。値の中身自体はここでは検証対象ではないため、
      // 長さ7のダミー配列を返す (map で使われるだけなので内容は問わない)。
      t.raw = (_key: string) => ["日", "月", "火", "水", "木", "金", "土"];
      return t as unknown as ReturnType<typeof original.useTranslations>;
    },
  };
});

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, subscription: null }),
}));

const mocks = vi.hoisted(() => ({
  createMilestone: vi.fn().mockResolvedValue({}),
  updateMilestone: vi.fn().mockResolvedValue({}),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    createMilestone: mocks.createMilestone,
    updateMilestone: mocks.updateMilestone,
  })),
}));

vi.mock("@swim-hub/shared/api", () => ({
  PracticeLogTemplateAPI: vi.fn().mockImplementation(() => ({
    createTemplate: vi.fn().mockResolvedValue({}),
  })),
}));

import MilestoneCreateModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal";
import MilestoneEditModal from "../../app/[locale]/(authenticated)/goals/_components/MilestoneEditModal";

const baseStyle: Style = { id: 1, name_jp: "自由形", name: "Freestyle", style: "Fr", distance: 100 };

const baseGoal: GoalWithMilestones = {
  id: "goal-1",
  user_id: "user-1",
  competition_id: null,
  style_id: 1,
  target_time: 60,
  start_time: 70,
  status: "active",
  achieved_at: null,
  reflection_note: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  competition: null,
  style: baseStyle,
  milestones: [],
};

const baseMilestone: Milestone = {
  id: "milestone-1",
  goal_id: "goal-1",
  title: "50m 目標",
  type: "time",
  params: { distance: 50, target_time: 30, style: "Fr", swim_category: "Swim" },
  deadline: null,
  status: "in_progress",
  achieved_at: null,
  reflection_done: false,
  reflection_note: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("MilestoneCreateModal — 目標タイム欄が読み取れない入力のまま submit した場合", () => {
  beforeEach(() => {
    mocks.createMilestone.mockClear();
  });

  it("目標タイム欄を '45.' (途中入力で確定していない値) のまま作成しようとすると、createMilestone は呼ばれずエラーが表示される", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <MilestoneCreateModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={async () => {}}
        goalId="goal-1"
        goal={baseGoal}
        styles={[baseStyle]}
        goalCompetitionDate=""
      />,
    );

    const targetTimeInput = screen.getByPlaceholderText("2.00.00");
    await user.clear(targetTimeInput);
    await user.type(targetTimeInput, "45.");

    await user.click(screen.getByRole("button", { name: "goals.milestoneCreate.submitButton" }));

    expect(mocks.createMilestone).not.toHaveBeenCalled();
    expect(await screen.findByText("goals.paramsForm.timeInvalid")).toBeInTheDocument();
  });

  it("[非退行] 目標タイム欄がデフォルト値 (正の数) のまま変更せず作成すると、createMilestone が呼ばれる", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <MilestoneCreateModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={async () => {}}
        goalId="goal-1"
        goal={baseGoal}
        styles={[baseStyle]}
        goalCompetitionDate=""
      />,
    );

    await user.click(screen.getByRole("button", { name: "goals.milestoneCreate.submitButton" }));

    expect(mocks.createMilestone).toHaveBeenCalledTimes(1);
  });
});

describe("MilestoneEditModal — 目標タイム欄が読み取れない入力のまま submit した場合", () => {
  beforeEach(() => {
    mocks.updateMilestone.mockClear();
  });

  it("目標タイム欄を '1:' (途中入力で確定していない値) のまま更新しようとすると、updateMilestone は呼ばれずエラーが表示される", async () => {
    const user = userEvent.setup();
    render(
      <MilestoneEditModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={async () => {}}
        milestone={baseMilestone}
        styles={[baseStyle]}
        goalCompetitionDate=""
      />,
    );

    const targetTimeInput = await screen.findByPlaceholderText("2.00.00");
    await user.clear(targetTimeInput);
    await user.type(targetTimeInput, "1:");

    await user.click(screen.getByRole("button", { name: "goals.milestoneEdit.submitButton" }));

    expect(mocks.updateMilestone).not.toHaveBeenCalled();
    expect(await screen.findByText("goals.paramsForm.timeInvalid")).toBeInTheDocument();
  });
});
