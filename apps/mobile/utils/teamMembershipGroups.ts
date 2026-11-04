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
 * チームタブに表示するチームを決める。
 * preferredTeamId (最後に開いたチーム・他画面からの指定) が承認済みか承認待ちの中にあればそれ、
 * 無ければ承認済みの先頭、それも無ければ承認待ちの先頭。所属が無ければ null。
 * 脱退・却下などで一覧から消えたチームを指したままでも、別のチームへ倒れる。
 */
export function resolveSelectedTeam(
  groups: TeamMembershipGroups,
  preferredTeamId: string | null | undefined,
): TeamMembershipWithUser | null {
  const { approvedTeams, pendingTeams } = groups;
  if (preferredTeamId) {
    const preferred =
      approvedTeams.find((m) => m.team_id === preferredTeamId) ??
      pendingTeams.find((m) => m.team_id === preferredTeamId);
    if (preferred) return preferred;
  }
  return approvedTeams[0] ?? pendingTeams[0] ?? null;
}
