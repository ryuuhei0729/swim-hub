/**
 * apps/web/__tests__/goals/goalListUseGoalsQueryIntegration.test.tsx
 *
 * goalsUiRegressions.test.tsx の GoalList テストは `competition: null` を手で
 * 組み立てて渡しているが、それとは別に、実際に `useGoalsQuery`
 * (apps/shared/hooks/queries/goals.ts) の select が返す結果をそのまま GoalList に
 * 渡す経路でも検証する。
 *
 * この統合テストは GoalAPI (getGoals/getSelectableCompetitions) だけをモックし、
 * useGoalsQuery の select ロジック自体は実物を通す。将来再び
 * 「useGoalsQuery 側は undefined を返すが GoalList 側は null しか見ない」ような
 * 噛み合わせ崩れが起きたときに、単体テストの往復では検出できずここで初めて
 * 検出できるようにするための唯一の統合テスト。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoalAPI } from "@apps/shared/api/goals";
import { useGoalsQuery } from "@apps/shared/hooks/queries/goals";
import GoalList from "../../app/[locale]/(authenticated)/goals/_components/GoalList";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: (namespace?: string) =>
      ((key: string) => (namespace ? `${namespace}.${key}` : key)) as unknown as ReturnType<
        typeof original.useTranslations
      >,
  };
});

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, subscription: null }),
}));

const mocks = vi.hoisted(() => ({
  getGoals: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  calculateGoalProgress: vi.fn(),
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    getGoals: mocks.getGoals,
    getSelectableCompetitions: mocks.getSelectableCompetitions,
    calculateGoalProgress: mocks.calculateGoalProgress,
    updateGoal: vi.fn().mockResolvedValue({}),
  })),
}));

function Harness() {
  // apps/web の GoalsClient.tsx が実際に使っているのと同じフック。
  // supabase の実体は使わないため空オブジェクトで十分 (GoalAPI 自体をモックしているため)。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isSuccess } = useGoalsQuery({} as any, { styles: [] });
  if (!isSuccess || !data) return <div data-testid="loading" />;
  return (
    <GoalList
      goals={data}
      selectedGoalId={null}
      onSelectGoal={() => {}}
      onDeleteGoal={async () => {}}
      onEditGoal={() => {}}
    />
  );
}

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe("GoalList × useGoalsQuery 統合 (実データ経路)", () => {
  beforeEach(() => {
    vi.mocked(GoalAPI).mockClear();
    mocks.getGoals.mockReset();
    mocks.getSelectableCompetitions.mockReset();
    mocks.calculateGoalProgress.mockReset().mockResolvedValue(null);
  });

  it("competition_id が指すレコードが getSelectableCompetitions() の結果に無い場合、GoalList は編集ボタンを出さず『大会情報なし』文言を表示する", async () => {
    mocks.getGoals.mockResolvedValue([
      {
        id: "goal-1",
        user_id: "user-1",
        competition_id: "comp-unresolvable",
        style_id: 1,
        target_time: 60,
        start_time: 70,
        status: "active",
        achieved_at: null,
        reflection_note: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ]);
    // 該当する competition_id を含まない (RLS で見えなくなった/削除された状態を模す)
    mocks.getSelectableCompetitions.mockResolvedValue([
      { id: "comp-other", title: "無関係な大会" },
    ]);

    renderWithQueryClient();

    await screen.findByText("goals.list.editUnavailableReason");
    expect(screen.queryByLabelText("goals.list.edit")).not.toBeInTheDocument();
    expect(screen.getByLabelText("goals.list.delete")).toBeInTheDocument();
    expect(screen.getByText("goals.list.competitionInfoUnavailable")).toBeInTheDocument();
  });

  it("[非退行] competition_id が解決できる場合は従来どおり編集ボタンが表示される", async () => {
    mocks.getGoals.mockResolvedValue([
      {
        id: "goal-2",
        user_id: "user-1",
        competition_id: "comp-1",
        style_id: 1,
        target_time: 60,
        start_time: 70,
        status: "active",
        achieved_at: null,
        reflection_note: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ]);
    mocks.getSelectableCompetitions.mockResolvedValue([{ id: "comp-1", title: "解決できる大会" }]);
    mocks.calculateGoalProgress.mockResolvedValue(50);

    renderWithQueryClient();

    await screen.findByLabelText("goals.list.edit");
    expect(screen.queryByText("goals.list.editUnavailableReason")).not.toBeInTheDocument();
  });
});
