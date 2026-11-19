import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unanswered: [] as Array<{ teamId: string }>,
  pendingByTeam: {} as Record<string, number>,
}));

vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: [] }),
  usePendingMembersCountsByTeamQuery: () => mocks.pendingByTeam,
}));
vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: () => ({ data: mocks.unanswered }),
}));

import { useTeamBadgeCounts } from "../useTeamBadgeCounts";

describe("useTeamBadgeCounts", () => {
  it("出欠未回答と承認待ちをチームごとに数え、合計はチームタブのバッジと同じ", () => {
    mocks.unanswered = [{ teamId: "a" }, { teamId: "a" }, { teamId: "b" }];
    mocks.pendingByTeam = { a: 0, c: 4 };
    const { result } = renderHook(() => useTeamBadgeCounts());
    expect(result.current.total).toBe(7);
    expect(result.current.countOf("a")).toEqual({ unanswered: 2, pendingMembers: 0 });
    expect(result.current.countOf("b")).toEqual({ unanswered: 1, pendingMembers: 0 });
    expect(result.current.countOf("c")).toEqual({ unanswered: 0, pendingMembers: 4 });
    expect(result.current.countOf("zzz")).toEqual({ unanswered: 0, pendingMembers: 0 });
  });
});
