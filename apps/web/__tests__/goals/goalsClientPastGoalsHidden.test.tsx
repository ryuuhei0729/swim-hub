/**
 * GoalsClient: 大会が終わった目標 (最終日 < 今日) は一覧に出さない。
 * 今日は Date の fake で固定 (2026-10-04)。
 * - 開催中の複数日大会・今日の大会・大会情報なしは出す。並びは大会日昇順 → 大会情報なし
 * - 最初に選ばれるのは表示される一覧の先頭 (過去の目標の詳細を出さない)
 * - 選択中の目標が一覧から消えたら一覧の先頭に移る
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GoalsClient from "../../app/[locale]/(authenticated)/goals/_client/GoalsClient";

const h = vi.hoisted(() => ({
  goals: [] as unknown[],
  detailIds: [] as (string | null)[],
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {} }) }));
vi.mock("@apps/shared/api/goals", () => ({ GoalAPI: class {} }));
vi.mock("@apps/shared/hooks/queries/goals", () => ({
  useGoalsQuery: () => ({ data: h.goals, error: null, invalidate: async () => {} }),
  useGoalDetailQuery: (_supabase: unknown, goalId: string | null) => {
    h.detailIds.push(goalId);
    return {
      data: goalId ? { id: goalId } : undefined,
      isLoading: false,
      error: null,
      invalidate: async () => {},
    };
  },
}));
vi.mock("../../app/[locale]/(authenticated)/goals/_components/GoalList", () => ({
  default: ({
    goals,
    selectedGoalId,
    onSelectGoal,
  }: {
    goals: { id: string }[];
    selectedGoalId: string | null;
    onSelectGoal: (id: string) => void;
  }) => (
    <ul data-testid="goal-list" data-selected={selectedGoalId ?? ""}>
      {goals.map((g) => (
        <li key={g.id}>
          <button type="button" onClick={() => onSelectGoal(g.id)}>
            {g.id}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("../../app/[locale]/(authenticated)/goals/_components/GoalDetail", () => ({
  default: ({ goal }: { goal: { id: string } }) => <div data-testid="goal-detail">{goal.id}</div>,
}));
vi.mock("../../app/[locale]/(authenticated)/goals/_components/GoalCreateModal", () => ({
  default: () => null,
}));
vi.mock("../../app/[locale]/(authenticated)/goals/_components/GoalEditModal", () => ({
  default: () => null,
}));

function goal(id: string, date: string | null, endDate: string | null = null) {
  return {
    id,
    created_at: "2026-01-01T00:00:00Z",
    competition: date ? { title: id, date, end_date: endDate } : null,
  };
}

const listIds = () =>
  Array.from(screen.getByTestId("goal-list").querySelectorAll("button")).map((b) => b.textContent);

function renderClient() {
  return render(<GoalsClient initialGoals={[]} initialCompetitions={[]} styles={[]} />);
}

describe("GoalsClient: 大会が終わった目標を出さない", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0)); // 2026-10-04 (ローカル)
    h.detailIds = [];
  });
  afterEach(() => vi.useRealTimers());

  it("昨日以前の大会の目標は出さず、開催中・今日・未来・大会情報なしを大会日昇順で出す", () => {
    h.goals = [
      goal("none", null),
      goal("future", "2026-11-01"),
      goal("yesterday", "2026-10-03"),
      goal("today", "2026-10-04"),
      goal("ended-multi", "2026-10-01", "2026-10-03"),
      goal("ongoing-multi", "2026-10-03", "2026-10-05"),
    ];
    renderClient();
    expect(listIds()).toEqual(["ongoing-multi", "today", "future", "none"]);
  });

  it("最初に選ばれるのは表示される一覧の先頭 (先頭が過去の目標でも、その詳細は取らない)", () => {
    h.goals = [goal("past", "2026-09-01"), goal("future", "2026-11-01")];
    renderClient();
    expect(screen.getByTestId("goal-list").dataset.selected).toBe("future");
    expect(screen.getByTestId("goal-detail").textContent).toBe("future");
    expect(h.detailIds).not.toContain("past");
  });

  it("選んだ目標が一覧から消えたら一覧の先頭に移る", () => {
    h.goals = [goal("a", "2026-11-01"), goal("b", "2026-12-01")];
    const { rerender } = renderClient();
    fireEvent.click(screen.getByText("b"));
    expect(screen.getByTestId("goal-detail").textContent).toBe("b");

    h.goals = [goal("a", "2026-11-01")];
    rerender(<GoalsClient initialGoals={[]} initialCompetitions={[]} styles={[]} />);
    expect(screen.getByTestId("goal-detail").textContent).toBe("a");
  });

  it("全部が過去なら空の一覧で、詳細は選択の案内", () => {
    h.goals = [goal("past", "2026-09-01")];
    renderClient();
    expect(listIds()).toEqual([]);
    expect(screen.getByText("goals.page.selectHint")).toBeInTheDocument();
  });
});
