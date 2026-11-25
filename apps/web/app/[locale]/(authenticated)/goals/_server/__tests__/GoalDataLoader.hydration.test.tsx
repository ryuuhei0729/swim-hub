/**
 * GoalDataLoader — 目標一覧の prefetch と SSR/CSR のキー一致
 *
 *  - サーバーは goalKeys.list() に { goals, competitions } を prefetch する
 *  - クライアントの useGoalsQuery が同じキー・同じ形のデータを使う (ハイドレートしたデータで
 *    表示でき、クライアントで取り直さない) ことを、実際にハイドレートして確認する
 *  - prefetch の失敗はラベル付きでログに残り、成功として dehydrate されない
 */
import React, { type ReactElement } from "react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { goalKeys, useGoalsQuery } from "@apps/shared/hooks/queries/goals";
import { renderWithQueryClient } from "@/__tests__/helpers/dashboardQueryTestUtils";

const mocks = vi.hoisted(() => ({
  updateAllMilestoneStatuses: vi.fn(),
  getGoals: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  getStyles: vi.fn(),
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  createAuthenticatedServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/data-loaders/common", () => ({
  getStyles: mocks.getStyles,
}));

vi.mock("@apps/shared/api/goals", () => ({
  configureMilestoneJudgment: vi.fn(),
  GoalAPI: vi.fn().mockImplementation(function () {
    return {
      updateAllMilestoneStatuses: mocks.updateAllMilestoneStatuses,
      getGoals: mocks.getGoals,
      getSelectableCompetitions: mocks.getSelectableCompetitions,
    };
  }),
}));

vi.mock("../../_client/GoalsClient", () => ({
  __esModule: true,
  default: () => null,
}));

import GoalDataLoader, { GOALS_LIST_QUERY_KEY } from "../GoalDataLoader";

type LoaderElement = ReactElement<{ state: DehydratedState }>;

const GoalsProbe = ({ onData }: { onData: (ids: string[] | undefined) => void }) => {
  const { data } = useGoalsQuery({} as unknown as SupabaseClient, { styles: [] });
  onData(data?.map((g) => g.id));
  return null;
};

describe("GoalDataLoader — 目標一覧の prefetch と SSR/CSR のキー一致", () => {
  beforeEach(() => {
    mocks.updateAllMilestoneStatuses.mockReset().mockResolvedValue(undefined);
    mocks.getGoals.mockReset().mockResolvedValue([{ id: "goal-1", competition_id: "c-1" }]);
    mocks.getSelectableCompetitions
      .mockReset()
      .mockResolvedValue([{ id: "c-1", title: "大会", date: "2099-01-01" }]);
    mocks.getStyles.mockReset().mockResolvedValue([]);
  });

  it("prefetch のキーは useGoalsQuery のキー (goalKeys.list()) と同一", () => {
    expect(GOALS_LIST_QUERY_KEY).toEqual(goalKeys.list());
  });

  it("ハイドレートしたデータを useGoalsQuery がそのまま使い、クライアントで取り直さない", async () => {
    const element = (await GoalDataLoader({})) as LoaderElement;

    const { queries } = element.props.state;
    expect(queries).toHaveLength(1);
    expect(queries[0]!.queryKey).toEqual(goalKeys.list());
    expect(queries[0]!.state.data).toEqual({
      goals: [{ id: "goal-1", competition_id: "c-1" }],
      competitions: [{ id: "c-1", title: "大会", date: "2099-01-01" }],
    });
    expect(mocks.getGoals).toHaveBeenCalledTimes(1);

    let ids: string[] | undefined;
    renderWithQueryClient(
      <HydrationBoundary state={element.props.state}>
        <GoalsProbe onData={(value) => (ids = value)} />
      </HydrationBoundary>,
    );

    await waitFor(() => expect(ids).toEqual(["goal-1"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.getGoals).toHaveBeenCalledTimes(1);
    expect(mocks.getSelectableCompetitions).toHaveBeenCalledTimes(1);
  });

  it("prefetch が失敗したらラベル付きでちょうど1回ログに残し、成功として dehydrate しない", async () => {
    const error = new Error("network down");
    mocks.getGoals.mockRejectedValue(error);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const element = (await GoalDataLoader({})) as LoaderElement;

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[GoalDataLoader] Goals prefetch エラー:", error);
    expect(mocks.getGoals).toHaveBeenCalledTimes(1);
    expect(element.props.state.queries).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });
});
