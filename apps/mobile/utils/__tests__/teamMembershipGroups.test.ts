// =============================================================================
// teamMembershipGroups.test.ts
// =============================================================================
//
// 検証観点:
//   [V-08] is_active === false の approved は承認済みに数えない
//          (is_active === null の場合も同様。TeamMembership.is_active の型は
//          boolean | null なので falsy 値全般を境界値として確認する)
//   [V-09] teams === undefined / 空配列 → クラッシュしない
//   [SEL-*] resolveSelectedTeam: チームタブに出すチームの決め方
//           (指定チーム → 承認済みの先頭 → 承認待ちの先頭 → null)
//
// トートロジー防止: 分類・判定ロジックはテスト内で再実装せず、
// utils/teamMembershipGroups.ts の実物を import して検証する。
// fixture の team_id / membership id は「他の fixture の期待値の部分文字列にならない」
// よう明確に異なる語幹 (alpha/beta/gamma) を用い、件数アサーションは toHaveLength /
// toBe で厳密一致させる。

import { describe, expect, it } from "vitest";
import { createMockTeamMembershipWithUser } from "@/__mocks__/supabase";
import { groupTeamMemberships, resolveSelectedTeam } from "../teamMembershipGroups";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

function approved(overrides: Partial<TeamMembershipWithUser> = {}): TeamMembershipWithUser {
  return createMockTeamMembershipWithUser({
    status: "approved",
    is_active: true,
    ...overrides,
  }) as TeamMembershipWithUser;
}

function pending(overrides: Partial<TeamMembershipWithUser> = {}): TeamMembershipWithUser {
  return createMockTeamMembershipWithUser({
    status: "pending",
    is_active: null,
    ...overrides,
  }) as TeamMembershipWithUser;
}

describe("groupTeamMemberships", () => {
  it("承認済み(approved && is_active)と承認待ち(pending)を分類する", () => {
    const alpha = approved({ id: "membership-alpha", team_id: "team-alpha" });
    const beta = pending({ id: "membership-beta", team_id: "team-beta" });

    const { approvedTeams, pendingTeams } = groupTeamMemberships([alpha, beta]);

    expect(approvedTeams).toHaveLength(1);
    expect(pendingTeams).toHaveLength(1);
    expect(approvedTeams[0]?.team_id).toBe("team-alpha");
    expect(pendingTeams[0]?.team_id).toBe("team-beta");
  });

  it("[V-08] status===approved でも is_active===false は承認済みに数えない", () => {
    const inactive = approved({ id: "membership-gamma", team_id: "team-gamma", is_active: false });

    const { approvedTeams, pendingTeams } = groupTeamMemberships([inactive]);

    expect(approvedTeams).toHaveLength(0);
    expect(pendingTeams).toHaveLength(0);
  });

  it("[V-08] status===approved でも is_active===null は承認済みに数えない(境界値)", () => {
    const nullActive = approved({ id: "membership-delta", team_id: "team-delta", is_active: null });

    const { approvedTeams } = groupTeamMemberships([nullActive]);

    expect(approvedTeams).toHaveLength(0);
  });

  it("status===rejected はどちらにも数えない", () => {
    const rejected = createMockTeamMembershipWithUser({
      id: "membership-epsilon",
      team_id: "team-epsilon",
      status: "rejected",
      is_active: false,
    }) as TeamMembershipWithUser;

    const { approvedTeams, pendingTeams } = groupTeamMemberships([rejected]);

    expect(approvedTeams).toHaveLength(0);
    expect(pendingTeams).toHaveLength(0);
  });

  it("[V-09] teams === undefined はクラッシュせず両方空配列を返す", () => {
    const { approvedTeams, pendingTeams } = groupTeamMemberships(undefined);

    expect(approvedTeams).toEqual([]);
    expect(pendingTeams).toEqual([]);
  });

  it("[V-09] teams === [] はクラッシュせず両方空配列を返す", () => {
    const { approvedTeams, pendingTeams } = groupTeamMemberships([]);

    expect(approvedTeams).toEqual([]);
    expect(pendingTeams).toEqual([]);
  });
});

describe("resolveSelectedTeam", () => {
  const alpha = approved({ id: "membership-alpha", team_id: "team-alpha" });
  const beta = approved({ id: "membership-beta", team_id: "team-beta" });
  const gamma = pending({ id: "membership-gamma", team_id: "team-gamma" });

  it("[SEL-1] 指定チームが承認済みにあればそれを返す (先頭でなくても)", () => {
    const groups = groupTeamMemberships([alpha, beta]);
    expect(resolveSelectedTeam(groups, "team-beta")?.team_id).toBe("team-beta");
  });

  it("[SEL-2] 指定チームが承認待ちにあればそれを返す", () => {
    const groups = groupTeamMemberships([alpha, gamma]);
    expect(resolveSelectedTeam(groups, "team-gamma")?.team_id).toBe("team-gamma");
  });

  it("[SEL-3] 指定チームが一覧に無い (脱退・別アカウントの保存値) ときは承認済みの先頭に倒れる", () => {
    const groups = groupTeamMemberships([alpha, beta, gamma]);
    expect(resolveSelectedTeam(groups, "team-left")?.team_id).toBe("team-alpha");
  });

  it("[SEL-4] 指定なしでも承認待ちより承認済みを優先する", () => {
    const groups = groupTeamMemberships([gamma, alpha]);
    expect(resolveSelectedTeam(groups, null)?.team_id).toBe("team-alpha");
  });

  it("[SEL-5] 承認済みが無ければ承認待ちの先頭を返す", () => {
    const groups = groupTeamMemberships([gamma]);
    expect(resolveSelectedTeam(groups, undefined)?.team_id).toBe("team-gamma");
  });

  it("[SEL-6] is_active===false の承認済みは指定されていても選ばない", () => {
    const inactive = approved({ id: "membership-delta", team_id: "team-delta", is_active: false });
    const groups = groupTeamMemberships([inactive, alpha]);
    expect(resolveSelectedTeam(groups, "team-delta")?.team_id).toBe("team-alpha");
  });

  it("[SEL-7] 所属が無ければ null", () => {
    expect(resolveSelectedTeam(groupTeamMemberships([]), "team-alpha")).toBeNull();
  });
});
