import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

export type TeamMembershipGroups = {
  approvedTeams: TeamMembershipWithUser[];
  pendingTeams: TeamMembershipWithUser[];
};

/** 承認済み(status==="approved" && is_active) と承認待ち(status==="pending") に分類する */
export function groupTeamMemberships(
  teams: readonly TeamMembershipWithUser[] | undefined,
): TeamMembershipGroups {
  const approved: TeamMembershipWithUser[] = [];
  const pending: TeamMembershipWithUser[] = [];

  (teams ?? []).forEach((membership) => {
    if (membership.status === "approved" && membership.is_active) {
      approved.push(membership);
    } else if (membership.status === "pending") {
      pending.push(membership);
    }
  });

  return {
    approvedTeams: approved,
    pendingTeams: pending,
  };
}

/**
 * 「承認済みちょうど1件かつ承認待ち0件」のときだけその team_id を返す。
 * それ以外 (0件 / 2件以上 / 承認待ちが1件以上ある / teams が undefined) は null。
 */
export function getSoleApprovedTeamId(
  teams: readonly TeamMembershipWithUser[] | undefined,
): string | null {
  const { approvedTeams, pendingTeams } = groupTeamMemberships(teams);
  const [soleTeam, ...extraTeams] = approvedTeams;

  if (!soleTeam || extraTeams.length > 0 || pendingTeams.length > 0) {
    return null;
  }

  return soleTeam.team_id;
}
