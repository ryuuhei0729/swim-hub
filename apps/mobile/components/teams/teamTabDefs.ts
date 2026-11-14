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
//
// タブは 4 つで固定し、管理者ビューでも数・位置を変えない (横スクロールさせない)。
// 管理者向けの機能はタブを増やさず、各タブの中に置く:
//   - グループ管理 … メンバータブ内の「メンバー / グループ」切替
//   - メンバーの目標 … その他タブのカード
//   - お知らせ・チーム設定 … ヘッダーのアイコンから開く別画面
// =============================================================================

/**
 * タブ定義。配列の順序がそのまま表示順になる。
 *
 * `adminOnly` は全タブに明示する。省略可能にすると「書き忘れ = 全員に公開」が
 * 静かに成立するため、管理者限定にする意図を毎行で表明させる。
 * 現在は管理者限定のタブは無い (タブの数を管理者ビューで変えない方針)。
 */
export const TEAM_TAB_DEFS = [
  { id: "members", nameKey: "teams.mobile.tabMembers", icon: "users", adminOnly: false },
  // 練習と大会をまとめた一覧 (全て / 練習 / 大会 / 過去 で絞り込む)
  { id: "schedule", nameKey: "teams.mobile.tabSchedule", icon: "calendar", adminOnly: false },
  { id: "attendance", nameKey: "teams.mobile.tabAttendance", icon: "clipboard", adminOnly: false },
  // ランキングなど、上の 3 つに入らない機能をカードで並べる
  { id: "others", nameKey: "teams.mobile.tabOthers", icon: "grid", adminOnly: false },
] as const;

export type TeamTabType = (typeof TEAM_TAB_DEFS)[number]["id"];

/** 表示順のタブ ID 一覧 */
export const TEAM_TAB_IDS: readonly TeamTabType[] = TEAM_TAB_DEFS.map((tab) => tab.id);

/** 管理者ビューでのみ表示するタブ ID 一覧 */
export const ADMIN_ONLY_TEAM_TAB_IDS: readonly TeamTabType[] = TEAM_TAB_DEFS.filter(
  (tab) => tab.adminOnly,
).map((tab) => tab.id);

/**
 * 旧タブ構成 (メンバー/グループ/練習/大会/出欠/ランキング/目標/お知らせ/設定) の ID を
 * 現在のタブへ読み替える。端末に保存済みの「最後に開いていたタブ」を引き継ぐために使う。
 * 対応先が無いもの (お知らせ・設定はヘッダーから開く別画面になった) は members に倒す。
 */
export const LEGACY_TEAM_TAB_MAP: Readonly<Record<string, TeamTabType>> = {
  groups: "members",
  practices: "schedule",
  competitions: "schedule",
  rankings: "others",
  goals: "others",
  announcements: "members",
  settings: "members",
};

/** 保存値 (旧 ID を含む) を現在のタブ ID に解決する。解決できなければ undefined */
export function resolveTeamTabId(value: unknown): TeamTabType | undefined {
  if (typeof value !== "string") return undefined;
  if ((TEAM_TAB_IDS as readonly string[]).includes(value)) return value as TeamTabType;
  // "constructor" などプロトタイプ上のキーを拾わないよう、自前のキーだけを見る
  return Object.prototype.hasOwnProperty.call(LEGACY_TEAM_TAB_MAP, value)
    ? LEGACY_TEAM_TAB_MAP[value]
    : undefined;
}
