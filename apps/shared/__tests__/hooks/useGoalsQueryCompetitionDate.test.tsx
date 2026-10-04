// Contract v6: useGoalsQuery の select は competition を { title, date } で返す (後方互換の追加)。
// 大会が見つからない目標は null のまま。壊したら赤: date を落とす / 見つからない場合に undefined を返す。
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ getGoals: vi.fn(), getSelectableCompetitions: vi.fn() }));
vi.mock("../../api/goals", () => ({
  GoalAPI: class {
    getGoals = h.getGoals;
    getSelectableCompetitions = h.getSelectableCompetitions;
  },
}));
import { useGoalsQuery } from "../../hooks/queries/goals";

describe("useGoalsQuery の competition", () => {
  it("{ title, date } を返し、見つからない大会は null", async () => {
    h.getGoals.mockResolvedValue([
      { id: "g1", competition_id: "c1", style_id: 1 },
      { id: "g2", competition_id: "missing", style_id: 1 },
    ]);
    h.getSelectableCompetitions.mockResolvedValue([{ id: "c1", title: "県大会", date: "2026-10-03" }]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useGoalsQuery({} as never), {
      wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data![0]!.competition).toEqual({ title: "県大会", date: "2026-10-03" });
    expect(result.current.data![1]!.competition).toBeNull();
  });
});
