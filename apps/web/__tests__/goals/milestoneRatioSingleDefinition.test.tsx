/**
 * apps/web/__tests__/goals/milestoneRatioSingleDefinition.test.tsx
 *
 * Sprint Contract v2 共有インターフェース: マイルストーン達成率は computeMilestoneRatio だけで計算する
 * (web 詳細 GoalDetail・管理者カード MemberGoalCard。インラインの式を残さない)。
 *
 * computeMilestoneRatio をセンチネル値を返すモックに差し替え、画面がその値をそのまま出すことを見る。
 * 式を画面側で再計算していれば、センチネルにならず赤になる。null (0件) のときは「未設定」で % もバーも出さない (D2)。
 * 振る舞い (実際の値) は goalsTimeDisplay.test.tsx / TeamAdminGoalsTab.test.tsx が固定している。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GoalWithMilestones, Milestone, Style } from "@apps/shared/types";
import type { TeamMemberGoal } from "@apps/shared/types/teamMemberGoals";

const h = vi.hoisted(() => ({ ratio: vi.fn() }));
vi.mock("@apps/shared/utils/milestoneRatio", () => ({ computeMilestoneRatio: h.ratio }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) =>
      ((key: string, values?: Record<string, unknown>) => {
        const full = namespace ? `${namespace}.${key}` : key;
        return values ? `${full}:${JSON.stringify(values)}` : full;
      }) as unknown as ReturnType<typeof original.useTranslations>,
    useLocale: () => "ja",
  };
});
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {}, subscription: null }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(function () {
    return { getGoalCurrentBestTime: vi.fn().mockResolvedValue(null), deleteMilestone: vi.fn() };
  }),
}));
vi.mock("../../app/[locale]/(authenticated)/goals/_components/MilestoneCreateModal", () => ({ default: () => null }));
vi.mock("../../app/[locale]/(authenticated)/goals/_components/MilestoneList", () => ({ default: () => null }));

import GoalDetail from "../../app/[locale]/(authenticated)/goals/_components/GoalDetail";
import MemberGoalCard from "@/components/team/member-goals/MemberGoalCard";

const fr50: Style = { id: 1, name_jp: "50m自由形", name: "50m Fr", style: "Fr", distance: 50 };
const milestones = [
  { id: "m1", goal_id: "goal-1", title: "a", type: "time", params: { distance: 50, target_time: 25, style: "Fr", swim_category: "Swim" }, deadline: null, status: "achieved", achieved_at: "2026-01-01T00:00:00Z", reflection_done: false, reflection_note: null, created_at: "", updated_at: "" },
  { id: "m2", goal_id: "goal-1", title: "b", type: "time", params: { distance: 50, target_time: 24, style: "Fr", swim_category: "Swim" }, deadline: null, status: "in_progress", achieved_at: null, reflection_done: false, reflection_note: null, created_at: "", updated_at: "" },
] as Milestone[];

function renderDetail() {
  const goal: GoalWithMilestones = {
    id: "goal-1", user_id: "u", competition_id: "c1", style_id: 1, target_time: 23.79, status: "active",
    achieved_at: null, reflection_note: null, created_at: "", updated_at: "",
    competition: { id: "c1", title: "大会", date: "2099-10-20", pool_type: 0 } as never,
    style: fr50, milestones,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <GoalDetail goal={goal} styles={[fr50]} onUpdate={async () => {}} onDelete={async () => {}} />
    </QueryClientProvider>,
  );
  return { ...view, goal };
}

function renderMemberCard() {
  const goal: TeamMemberGoal = {
    id: "g1", style_id: 1, target_time: 60, status: "active", achieved_at: null, created_at: "2026-01-01T00:00:00Z",
    competition_id: "c1", competition_title: "県大会", competition_date: "2099-05-01", competition_pool_type: 1,
    current_best_time: 65,
    milestones: milestones.map(({ id, title, type, params, deadline, status, achieved_at }) => ({ id, title, type, params, deadline, status, achieved_at })),
  };
  return { ...render(<MemberGoalCard goal={goal} styleLabel="50m自由形" />), goal };
}

beforeEach(() => {
  h.ratio.mockReset();
});

describe("GoalDetail (web 詳細) はマイルストーン達成率を computeMilestoneRatio で計算する", () => {
  it("センチネル 37 を返すと 37% とバー (幅 37%) を出し、目標のマイルストーンを渡している", () => {
    h.ratio.mockReturnValue(37);
    const { container, goal } = renderDetail();

    const row = screen.getByText("goals.detail.milestoneRatio").parentElement!;
    expect(row.textContent).toContain("37%");
    expect(row.textContent).not.toContain("50%");
    expect(h.ratio).toHaveBeenCalledWith(goal.milestones);
    const fill = container.querySelector<HTMLElement>(".bg-blue-600.h-2");
    expect(fill?.style.width).toBe("37%");
  });

  it("null を返すと「未設定」で、% もバーも出さない (マイルストーンが2件あっても関数の結果に従う)", () => {
    h.ratio.mockReturnValue(null);
    const { container } = renderDetail();

    const row = screen.getByText("goals.detail.milestoneRatio").parentElement!;
    expect(within(row).getByText("goals.detail.notSet")).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/%/);
    expect(container.querySelector(".bg-blue-600.h-2")).toBeNull();
  });
});

describe("MemberGoalCard (web 管理者カード) はマイルストーン達成率を computeMilestoneRatio で計算する", () => {
  it("センチネル 37 を返すと 37% と progressbar の値 37 を出し、目標のマイルストーンを渡している", () => {
    h.ratio.mockReturnValue(37);
    const { goal } = renderMemberCard();

    expect(screen.getByText("37%")).toBeInTheDocument();
    expect(screen.queryByText("50%")).toBeNull();
    // D8: 見出しと progressbar の aria-label は goals.detail.milestoneRatio
    expect(screen.getByRole("progressbar", { name: "goals.detail.milestoneRatio" })).toHaveAttribute("aria-valuenow", "37");
    expect(screen.getByText("goals.detail.milestoneRatio")).toBeInTheDocument();
    expect(screen.queryByText("goals.detail.achievement")).toBeNull();
    expect(h.ratio).toHaveBeenCalledWith(goal.milestones);
  });

  it("null を返すと「未設定」で、% も progressbar も出さない", () => {
    h.ratio.mockReturnValue(null);
    renderMemberCard();

    expect(screen.getByText("goals.detail.notSet")).toBeInTheDocument();
    expect(screen.getByRole("article").textContent).not.toMatch(/%/);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
