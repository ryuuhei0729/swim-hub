/**
 * useTeamBadgeCounts (サイドバーの「チーム」・チーム切替・タブのバッジ) — swimhub-tasks #73
 * mobile の hooks/__tests__/useTeamBadgeCounts.test.tsx と同じ数え方であることを確かめる。
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unanswered: [] as Array<{ teamId: string }>,
  pendingByTeam: {} as Record<string, number>,
  teams: [] as unknown[],
  pendingTeamIds: [] as readonly string[],
  notificationTeamIds: [] as string[],
}));

vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: mocks.teams }),
  usePendingMembersCountsByTeamQuery: (_supabase: unknown, teamIds: readonly string[]) => {
    mocks.pendingTeamIds = teamIds;
    return mocks.pendingByTeam;
  },
}));
vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: (
    _supabase: unknown,
    _userId: unknown,
    teams: Array<{ team_id: string }>,
  ) => {
    mocks.notificationTeamIds = teams.map((team) => team.team_id);
    return { data: mocks.unanswered };
  },
}));

import { formatBadgeCount, useTeamBadgeCounts } from "@/hooks/useTeamBadgeCounts";

describe("useTeamBadgeCounts", () => {
  it("出欠未回答と承認待ちをチームごとに数え、合計はサイドバーのバッジと同じ", () => {
    mocks.unanswered = [{ teamId: "a" }, { teamId: "a" }, { teamId: "b" }];
    mocks.pendingByTeam = { a: 0, c: 4 };
    const { result } = renderHook(() => useTeamBadgeCounts());
    expect(result.current.total).toBe(7);
    expect(result.current.countOf("a")).toEqual({ unanswered: 2, pendingMembers: 0 });
    expect(result.current.countOf("b")).toEqual({ unanswered: 1, pendingMembers: 0 });
    expect(result.current.countOf("c")).toEqual({ unanswered: 0, pendingMembers: 4 });
    expect(result.current.countOf("zzz")).toEqual({ unanswered: 0, pendingMembers: 0 });
  });

  it("承認済みのチームの未回答を数え、承認待ちは自分が管理者のチームだけ数える", () => {
    mocks.teams = [
      { team_id: "a", role: "admin", status: "approved", is_active: true, teams: { name: "A" } },
      { team_id: "b", role: "user", status: "approved", is_active: true, teams: { name: "B" } },
      { team_id: "p", role: "user", status: "pending", is_active: true, teams: { name: "P" } },
    ];
    renderHook(() => useTeamBadgeCounts());
    expect(mocks.notificationTeamIds).toEqual(["a", "b"]);
    expect(mocks.pendingTeamIds).toEqual(["a"]);
  });

  it("100 件以上は 99+ と出す", () => {
    expect(formatBadgeCount(5)).toBe("5");
    expect(formatBadgeCount(100)).toBe("99+");
  });
});
