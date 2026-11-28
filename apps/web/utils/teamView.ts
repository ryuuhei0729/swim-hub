import type { TeamMembershipWithUser } from "@apps/shared/types";
import { resolveTeamTabParam } from "@/components/team/teamTabDefs";
import type { TeamViewPrefs } from "@/stores/team/teamViewStore";

/**
 * チームのページのクエリ文字列 (先頭の "?" 付き。何も無ければ空文字)。
 * 利用者ビューと管理者ビューは同じページ (/teams/[teamId]) で、管理者ビューは `?view=admin`。
 * タブは両ビューで共通 (teamTabDefs.ts)。存在しないタブは付けない (旧 ID は新しいタブへ読み替える)。
 */
export function teamViewSearch(adminView: boolean, tab?: string | null): string {
  const params = new URLSearchParams();
  if (adminView) params.set("view", "admin");
  const validTab = resolveTeamTabParam(tab)?.tab;
  if (validTab) params.set("tab", validTab);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** チームのページの URL (ロケール接頭辞なし。@/i18n/navigation の router / Link に渡す) */
export function teamViewHref(teamId: string, adminView: boolean, tab?: string | null): string {
  return `/teams/${teamId}${teamViewSearch(adminView, tab)}`;
}

/**
 * チームを開くときに管理者ビューで開くか。
 * 保存された好み (adminView) は権限ではないので、必ず実際の role と AND を取る。
 * 承認待ちのチームは管理者ビューにしない。
 */
export function shouldOpenAsAdmin(
  membership: Pick<TeamMembershipWithUser, "role"> & Partial<Pick<TeamMembershipWithUser, "status">>,
  prefs: TeamViewPrefs | undefined,
): boolean {
  if (membership.status === "pending") return false;
  return membership.role === "admin" && prefs?.adminView === true;
}

export function isApprovedMembership(membership: TeamMembershipWithUser): boolean {
  return membership.status === "approved" && membership.is_active === true;
}

export function isPendingMembership(membership: TeamMembershipWithUser): boolean {
  return membership.status === "pending";
}

/**
 * サイドバーの「チーム」から開くチームを決める (mobile の resolveSelectedTeam と同じ)。
 * 最後に開いたチームが承認済みか承認待ちの中にあればそれ、無ければ承認済みの先頭、
 * それも無ければ承認待ちの先頭。所属が無ければ null (一覧ページで作成・参加の案内を出す)。
 * 脱退などで一覧から消えたチームを指したままでも、別のチームへ倒れる。
 */
export function resolveTeamToOpen(
  teams: readonly TeamMembershipWithUser[],
  lastTeamId: string | null,
): TeamMembershipWithUser | null {
  const approved = teams.filter(isApprovedMembership);
  const pending = teams.filter(isPendingMembership);
  if (lastTeamId) {
    const last =
      approved.find((m) => m.team_id === lastTeamId) ??
      pending.find((m) => m.team_id === lastTeamId);
    if (last) return last;
  }
  return approved[0] ?? pending[0] ?? null;
}
