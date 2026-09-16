// =============================================================================
// teamTabDefs - チーム詳細タブの唯一の定義元
// =============================================================================
// タブの並び・ラベルキー・アイコン・管理者限定かどうかを 1 箇所で持つ。
//
// 依存ゼロの素の TS モジュールに置く理由: `TeamTabs.tsx` は react-native /
// @expo/vector-icons を import するため、`utils/teamAdminView.ts` がそこから
// **値**を読むと RN 依存が漏れる (components/teams/rankings/rankingLabels.ts と
// 同じ方針)。`TeamTabType` は `TEAM_TAB_DEFS` から導出するので、独立した union を
// 別に書かないこと。
// =============================================================================

/**
 * タブ定義。配列の順序がそのまま表示順になる。
 *
 * `adminOnly` は全タブに明示する。省略可能にすると「書き忘れ = 全員に公開」が
 * 静かに成立するため、管理者限定にする意図を毎行で表明させる。
 */
export const TEAM_TAB_DEFS = [
  { id: "members", nameKey: "teams.mobile.tabMembers", icon: "users", adminOnly: false },
  { id: "groups", nameKey: "teams.mobile.tabGroups", icon: "layers", adminOnly: true },
  { id: "practices", nameKey: "teams.mobile.tabPractices", icon: "clock", adminOnly: false },
  { id: "competitions", nameKey: "teams.mobile.tabCompetitions", icon: "award", adminOnly: false },
  { id: "attendance", nameKey: "teams.mobile.tabAttendance", icon: "clipboard", adminOnly: false },
  // ランキングは一般メンバーも閲覧するため管理者限定にしない
  { id: "rankings", nameKey: "teams.mobile.tabRankings", icon: "bar-chart-2", adminOnly: false },
  { id: "announcements", nameKey: "teams.mobile.tabAnnouncements", icon: "bell", adminOnly: true },
  // 設定は「管理者ビュー切替」と独立した全メンバー向けタブ。中身の出し分け
  // (編集・削除) は TeamSettingsTab が isAdmin で行う
  { id: "settings", nameKey: "teams.mobile.tabSettings", icon: "settings", adminOnly: false },
] as const;

export type TeamTabType = (typeof TEAM_TAB_DEFS)[number]["id"];

/** 表示順のタブ ID 一覧 */
export const TEAM_TAB_IDS: readonly TeamTabType[] = TEAM_TAB_DEFS.map((tab) => tab.id);

/** 管理者ビューでのみ表示するタブ ID 一覧 */
export const ADMIN_ONLY_TEAM_TAB_IDS: readonly TeamTabType[] = TEAM_TAB_DEFS.filter(
  (tab) => tab.adminOnly,
).map((tab) => tab.id);
