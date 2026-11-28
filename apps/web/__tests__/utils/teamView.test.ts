import { describe, it, expect } from "vitest";
import type { TeamMembershipWithUser } from "@apps/shared/types";
import {
  resolveTeamToOpen,
  shouldOpenAsAdmin,
  teamViewHref,
  teamViewSearch,
} from "@/utils/teamView";

function membership(teamId: string, overrides: Partial<TeamMembershipWithUser> = {}) {
  return {
    team_id: teamId,
    role: "user",
    status: "approved",
    is_active: true,
    ...overrides,
  } as TeamMembershipWithUser;
}

describe("teamViewHref", () => {
  it("利用者ビューと管理者ビューは同じページで、管理者ビューは ?view=admin", () => {
    expect(teamViewHref("t1", false)).toBe("/teams/t1");
    expect(teamViewHref("t1", true)).toBe("/teams/t1?view=admin");
  });

  it("存在するタブだけを付け、旧タブの ID は新しいタブへ読み替える", () => {
    expect(teamViewHref("t1", true, "schedule")).toBe("/teams/t1?view=admin&tab=schedule");
    expect(teamViewHref("t1", false, "practices")).toBe("/teams/t1?tab=schedule");
    expect(teamViewHref("t1", false, "goals")).toBe("/teams/t1?tab=others");
    expect(teamViewHref("t1", true, "nope")).toBe("/teams/t1?view=admin");
  });
});

describe("teamViewSearch", () => {
  it("クエリ文字列だけを返す (何も無ければ空文字)", () => {
    expect(teamViewSearch(false)).toBe("");
    expect(teamViewSearch(false, "members")).toBe("?tab=members");
    expect(teamViewSearch(true, "attendance")).toBe("?view=admin&tab=attendance");
  });
});

describe("shouldOpenAsAdmin", () => {
  it("管理者かつ前回管理者ビューのときだけ true", () => {
    expect(shouldOpenAsAdmin({ role: "admin" }, { adminView: true })).toBe(true);
    expect(shouldOpenAsAdmin({ role: "admin" }, { adminView: false })).toBe(false);
    expect(shouldOpenAsAdmin({ role: "admin" }, undefined)).toBe(false);
    // 保存値は権限ではない (管理者でなくなったチーム・別アカウント)
    expect(shouldOpenAsAdmin({ role: "user" }, { adminView: true })).toBe(false);
    // 承認待ちのチームは管理者ビューにしない
    expect(shouldOpenAsAdmin({ role: "admin", status: "pending" }, { adminView: true })).toBe(
      false,
    );
  });
});

describe("resolveTeamToOpen", () => {
  const teams = [
    membership("pending", { status: "pending" }),
    membership("a"),
    membership("b"),
    membership("left", { is_active: false }),
  ];

  it("最後に開いたチームが承認済みか承認待ちならそれを開く", () => {
    expect(resolveTeamToOpen(teams, "b")?.team_id).toBe("b");
    // 承認待ちのチームも開ける (mobile と同じ。swimhub-tasks #101)
    expect(resolveTeamToOpen(teams, "pending")?.team_id).toBe("pending");
  });

  it("最後に開いたチームが無い・一覧に無いなら承認済みの先頭へ倒す", () => {
    expect(resolveTeamToOpen(teams, null)?.team_id).toBe("a");
    expect(resolveTeamToOpen(teams, "left")?.team_id).toBe("a");
    expect(resolveTeamToOpen(teams, "unknown")?.team_id).toBe("a");
  });

  it("承認済みが無ければ承認待ちの先頭、どちらも無ければ null", () => {
    expect(resolveTeamToOpen([membership("p", { status: "pending" })], null)?.team_id).toBe("p");
    expect(resolveTeamToOpen([membership("left", { is_active: false })], null)).toBeNull();
  });
});
