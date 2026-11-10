import type { TeamMembershipWithUser } from "@apps/shared/types";
import { isTeamTabType } from "@/components/team/TeamTabs";
import { isTeamAdminTabType } from "@/components/team/TeamAdminTabs";
import type { TeamViewPrefs } from "@/stores/team/teamViewStore";

/**
 * チームのページのクエリ文字列 (先頭の "?" 付き。何も無ければ空文字)。
 * 利用者ビューと管理者ビューは同じページ (/teams/[teamId]) で、管理者ビューは `?view=admin`。
 * tab はそのビューに存在するタブだけを付ける (存在しないタブは既定タブに倒す)。
 */
export function teamViewSearch(adminView: boolean, tab?: string | null): string {
  const params = new URLSearchParams();
  if (adminView) params.set("view", "admin");
  const validTab = tab && (adminView ? isTeamAdminTabType(tab) : isTeamTabType(tab)) ? tab : null;
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
 */
export function shouldOpenAsAdmin(
  membership: Pick<TeamMembershipWithUser, "role">,
  prefs: TeamViewPrefs | undefined,
): boolean {
  return membership.role === "admin" && prefs?.adminView === true;
}

export function isApprovedMembership(membership: TeamMembershipWithUser): boolean {
  return membership.status === "approved" && membership.is_active === true;
}

/**
 * サイドバーの「チーム」から開くチームを決める。
 * 最後に開いたチームが承認済みの中にあればそれ、無ければ承認済みの先頭。
 * 承認済みが無ければ null (一覧ページで作成・参加の案内を出す)。
 * 脱退などで一覧から消えたチームを指したままでも、別のチームへ倒れる。
 */
export function resolveTeamToOpen(
  teams: readonly TeamMembershipWithUser[],
  lastTeamId: string | null,
): TeamMembershipWithUser | null {
  const approved = teams.filter(isApprovedMembership);
  if (lastTeamId) {
    const last = approved.find((m) => m.team_id === lastTeamId);
    if (last) return last;
  }
  return approved[0] ?? null;
}
