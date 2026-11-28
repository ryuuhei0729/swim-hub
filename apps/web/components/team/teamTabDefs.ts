// =============================================================================
// teamTabDefs - チーム画面のタブの唯一の定義元 (Web)
// =============================================================================
// mobile の apps/mobile/components/teams/teamTabDefs.ts と同じ構成にしている
// (swimhub-tasks #100)。タブは メンバー / 予定 / 出欠 / その他 の 4 つで固定し、
// 管理者ビューでも数・位置を変えない。管理者向けの機能はタブを増やさず、各タブの中に置く:
//   - 承認待ち・グループ管理 … メンバータブ (管理者ビューの「メンバー / グループ」切替)
//   - 練習・大会の追加・一括登録 … 予定タブ
//   - 出欠の受付管理 … 出欠タブ (管理者ビューでは管理用の表示に切り替わる)
//   - ランキング・メンバーの目標 … その他タブのカード
//   - お知らせ・チーム設定 … ヘッダーのアイコンから開く画面
//
// アイコンを持たない素の TS モジュールにしているのは、utils/teamView.ts や
// stores/team/teamViewStore.ts から値を読んでも React 依存が漏れないようにするため。
// `TeamTabType` は `TEAM_TAB_DEFS` から導出するので、独立した union を別に書かないこと。
// =============================================================================

/** タブ定義。配列の順序がそのまま表示順になる。ラベルは `teams` 名前空間のキー */
export const TEAM_TAB_DEFS = [
  { id: "members", labelKey: "mobile.tabMembers" },
  // 練習と大会をまとめた一覧 (全て / 練習 / 大会 / 過去 で絞り込む)
  { id: "schedule", labelKey: "mobile.tabSchedule" },
  { id: "attendance", labelKey: "mobile.tabAttendance" },
  // ランキングなど、上の 3 つに入らない機能をカードで並べる
  { id: "others", labelKey: "mobile.tabOthers" },
] as const;

export type TeamTabType = (typeof TEAM_TAB_DEFS)[number]["id"];

/** 表示順のタブ ID 一覧 */
export const TEAM_TAB_IDS: readonly TeamTabType[] = TEAM_TAB_DEFS.map((tab) => tab.id);

/** 最初に開くタブ (保存されたタブも `?tab=` も無いとき) */
export const DEFAULT_TEAM_TAB: TeamTabType = "members";

/** 値が現在のタブ ID か */
export function isTeamTabType(value: unknown): value is TeamTabType {
  return typeof value === "string" && (TEAM_TAB_IDS as readonly string[]).includes(value);
}

/**
 * タブの上に重ねて開く画面 (mobile ではスタックに積む別画面)。
 *   - announcements / settings … ヘッダーのアイコンから
 *   - rankings / goals … その他タブのカードから
 *   - bulkRegister … 予定タブ (管理者ビュー) の一括登録ボタンから
 */
export type TeamSubScreen = "announcements" | "settings" | "rankings" | "goals" | "bulkRegister";

/** 管理者ビューでしか開けない画面 */
export const ADMIN_ONLY_TEAM_SUB_SCREENS: readonly TeamSubScreen[] = ["goals", "bulkRegister"];

export interface ResolvedTeamTabParam {
  tab: TeamTabType;
  subScreen?: TeamSubScreen;
}

/**
 * 旧タブ構成 (利用者: 出欠/メンバー/練習/大会/ランキング/設定、
 * 管理者: 出欠/お知らせ/メンバー/グループ/練習/大会/ランキング/目標/一括登録/設定) の
 * `?tab=` を新しいタブ (と、必要なら上に重ねる画面) へ読み替える。
 * 記録入力ページの「戻る」や通知など、古い `?tab=practices` 等のリンクを生かすために使う。
 */
const LEGACY_TEAM_TAB_MAP: Readonly<Record<string, ResolvedTeamTabParam>> = {
  groups: { tab: "members" },
  practices: { tab: "schedule" },
  competitions: { tab: "schedule" },
  "bulk-register": { tab: "schedule", subScreen: "bulkRegister" },
  rankings: { tab: "others", subScreen: "rankings" },
  goals: { tab: "others", subScreen: "goals" },
  announcements: { tab: "members", subScreen: "announcements" },
  settings: { tab: "members", subScreen: "settings" },
};

/** `?tab=` の値 (旧 ID を含む) を解決する。解決できなければ undefined */
export function resolveTeamTabParam(value: unknown): ResolvedTeamTabParam | undefined {
  if (isTeamTabType(value)) return { tab: value };
  if (typeof value !== "string") return undefined;
  // "constructor" などプロトタイプ上のキーを拾わないよう、自前のキーだけを見る
  return Object.prototype.hasOwnProperty.call(LEGACY_TEAM_TAB_MAP, value)
    ? LEGACY_TEAM_TAB_MAP[value]
    : undefined;
}
