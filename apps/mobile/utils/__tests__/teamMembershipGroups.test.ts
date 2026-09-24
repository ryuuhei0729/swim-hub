// =============================================================================
// teamMembershipGroups.test.ts
// =============================================================================
//
// Sprint Contract 検証観点 (チームタブ所属数分岐):
//   [V-04] 承認済み1件 + 承認待ち0件 → getSoleApprovedTeamId はその team_id を返す
//   [V-05] 承認済み1件 + 承認待ち1件 → null (自動遷移しない。承認待ちカードの情報が
//          消えるのを防ぐため)
//   [V-06] 承認済み2件以上 → null
//   [V-07] 承認済み0件 + 承認待ち1件 → null (グループ分類自体は pendingTeams に1件)
//   [V-08] is_active === false の approved は承認済みに数えない
//          (is_active === null の場合も同様。TeamMembership.is_active の型は
//          boolean | null なので falsy 値全般を境界値として確認する)
//   [V-09] teams === undefined / 空配列 → null (クラッシュしない)
//
// トートロジー防止: 分類・判定ロジックはテスト内で再実装せず、
// utils/teamMembershipGroups.ts の実物を import して検証する。
// fixture の team_id / membership id は「他の fixture の期待値の部分文字列にならない」
// よう明確に異なる語幹 (alpha/beta/gamma) を用い、件数アサーションは toHaveLength /
// toBe で厳密一致させる。

import { describe, expect, it } from "vitest";
import { createMockTeamMembershipWithUser } from "@/__mocks__/supabase";
import { getSoleApprovedTeamId, groupTeamMemberships } from "../teamMembershipGroups";
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

describe("getSoleApprovedTeamId", () => {
  it("[V-04] 承認済み1件 + 承認待ち0件 のとき、その team_id を返す", () => {
    const sole = approved({ id: "membership-alpha", team_id: "team-alpha" });

    expect(getSoleApprovedTeamId([sole])).toBe("team-alpha");
  });

  it("[V-05] 承認済み1件 + 承認待ち1件 のときは null (承認待ちカードを消さないため自動遷移しない)", () => {
    const sole = approved({ id: "membership-alpha", team_id: "team-alpha" });
    const waiting = pending({ id: "membership-beta", team_id: "team-beta" });

    expect(getSoleApprovedTeamId([sole, waiting])).toBeNull();
  });

  it("[V-06] 承認済み2件以上のときは null", () => {
    const first = approved({ id: "membership-alpha", team_id: "team-alpha" });
    const second = approved({ id: "membership-beta", team_id: "team-beta" });

    expect(getSoleApprovedTeamId([first, second])).toBeNull();
  });

  it("[V-07] 承認済み0件 + 承認待ち1件 のときは null", () => {
    const waiting = pending({ id: "membership-beta", team_id: "team-beta" });

    expect(getSoleApprovedTeamId([waiting])).toBeNull();
  });

  it("[V-08] is_active===false の承認済みは対象に数えず null になる", () => {
    const inactive = approved({ id: "membership-gamma", team_id: "team-gamma", is_active: false });

    expect(getSoleApprovedTeamId([inactive])).toBeNull();
  });

  it("[V-09] teams === undefined は null (クラッシュしない)", () => {
    expect(getSoleApprovedTeamId(undefined)).toBeNull();
  });

  it("[V-09] teams === [] は null", () => {
    expect(getSoleApprovedTeamId([])).toBeNull();
  });

  it("承認済み0件 + 承認待ち0件 (どちらも空) は null", () => {
    const rejected = createMockTeamMembershipWithUser({
      id: "membership-epsilon",
      team_id: "team-epsilon",
      status: "rejected",
    }) as TeamMembershipWithUser;

    expect(getSoleApprovedTeamId([rejected])).toBeNull();
  });
});
