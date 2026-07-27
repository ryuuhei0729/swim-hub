import type { TeamTabType } from "@/components/teams/TeamTabs";

/**
 * 管理者ビュー/利用者ビューの切替時に、現在のアクティブタブをどうするか決定する。
 * 利用者ビューへ切り替える際、管理者専用タブ (announcements/groups) にいた場合は
 * members タブへリセットする。それ以外は現在のタブを維持する。
 */
export function resolveActiveTabOnAdminViewToggle(
  currentTab: TeamTabType,
  nextIsAdminView: boolean,
): TeamTabType {
  if (!nextIsAdminView && (currentTab === "announcements" || currentTab === "groups")) {
    return "members";
  }
  return currentTab;
}
