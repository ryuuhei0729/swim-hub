import { ADMIN_ONLY_TEAM_TAB_IDS, type TeamTabType } from "@/components/teams/teamTabDefs";

/**
 * 管理者ビュー/利用者ビューの切替時に、現在のアクティブタブをどうするか決定する。
 * 利用者ビューへ切り替える際、管理者専用タブにいた場合は members タブへリセットする。
 * それ以外は現在のタブを維持する。
 *
 * 管理者専用タブの集合は teamTabDefs.ts が唯一の定義元。ここに名前を手書きすると
 * タブを足したときに片方だけ更新されて静かに壊れる。
 */
export function resolveActiveTabOnAdminViewToggle(
  currentTab: TeamTabType,
  nextIsAdminView: boolean,
): TeamTabType {
  if (!nextIsAdminView && ADMIN_ONLY_TEAM_TAB_IDS.includes(currentTab)) {
    return "members";
  }
  return currentTab;
}
