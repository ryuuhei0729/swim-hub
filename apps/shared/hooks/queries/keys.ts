// =============================================================================
// React Query クエリキー定義 - Swim Hub共通パッケージ
// =============================================================================

import type { QueryClient } from "@tanstack/react-query";
import type { TeamRankingFilters, TeamRelayRankingFilters } from "../../types";

/**
 * 練習記録のクエリキー
 */
export const practiceKeys = {
  all: ["practices"] as const,
  lists: () => [...practiceKeys.all, "list"] as const,
  list: (filters?: { startDate?: string; endDate?: string; page?: number; pageSize?: number }) =>
    [...practiceKeys.lists(), filters] as const,
  count: (filters?: { startDate?: string; endDate?: string }) =>
    [...practiceKeys.all, "count", filters] as const,
  detail: (id: string) => [...practiceKeys.all, "detail", id] as const,
  byDate: (date: string) => [...practiceKeys.all, "date", date] as const,
  tags: () => [...practiceKeys.all, "tags"] as const,
} as const;

/**
 * 大会記録のクエリキー
 */
export const recordKeys = {
  all: ["records"] as const,
  lists: () => [...recordKeys.all, "list"] as const,
  list: (filters?: {
    startDate?: string;
    endDate?: string;
    styleId?: number;
    page?: number;
    pageSize?: number;
  }) => [...recordKeys.lists(), filters] as const,
  count: (filters?: { startDate?: string; endDate?: string; styleId?: number }) =>
    [...recordKeys.all, "count", filters] as const,
  // lists() 配下に置き、記録の追加・更新時の lists() invalidate / realtime に追随させる
  // filters 抜きのプレフィックスとして invalidateQueries から利用する (filters を含む
  // listBestCandidates() の生成配列は従来と完全に同一のまま)
  bestCandidates: () => [...recordKeys.lists(), "bestCandidates"] as const,
  listBestCandidates: (filters?: {
    userId?: string;
    styleId?: number;
    isRelaying?: boolean;
    poolType?: number | null;
  }) => [...recordKeys.bestCandidates(), filters] as const,
  detail: (id: string) => [...recordKeys.all, "detail", id] as const,
  competitions: () => [...recordKeys.all, "competitions"] as const,
  competitionsList: (filters?: { startDate?: string; endDate?: string }) =>
    [...recordKeys.competitions(), "list", filters] as const,
  competitionDetail: (id: string) => [...recordKeys.competitions(), "detail", id] as const,
  bestTimes: (userId?: string) => [...recordKeys.all, "bestTimes", userId] as const,
} as const;

/**
 * チームのクエリキー
 */
export const teamKeys = {
  all: ["teams"] as const,
  lists: () => [...teamKeys.all, "list"] as const,
  list: () => [...teamKeys.lists()] as const,
  detail: (id: string) => [...teamKeys.all, "detail", id] as const,
  members: (teamId: string) => [...teamKeys.detail(teamId), "members"] as const,
  pendingMembers: (teamId: string) => [...teamKeys.detail(teamId), "pendingMembers"] as const,
  announcements: (teamId: string) => [...teamKeys.detail(teamId), "announcements"] as const,
  announcementDetail: (teamId: string, id: string) =>
    [...teamKeys.announcements(teamId), "detail", id] as const,
  practices: (teamId: string) => [...teamKeys.detail(teamId), "practices"] as const,
  competitions: (teamId: string) => [...teamKeys.detail(teamId), "competitions"] as const,
  // ランキングは絞り込み条件ごとに別のサーバー結果になるため filters をキーに含める。
  // filters は「種目マスターの読み込み待ちでまだ確定していない」状態を undefined で
  // 表せるようにしている (その間クエリは enabled=false で走らない)
  rankings: (teamId: string, filters: TeamRankingFilters | undefined) =>
    [...teamKeys.detail(teamId), "rankings", filters] as const,
  // 空状態の文言を「条件に一致なし」と「そもそも記録が無い」に分けるための判定
  hasAnyRecord: (teamId: string) => [...teamKeys.detail(teamId), "hasAnyRecord"] as const,
  // リレーランキングは個人種目とは別のテーブル (relay_records) を別の RPC で引くため
  // キーも別に持つ。filters が undefined の間はクエリを走らせない (個人種目と同じ)
  relayRankings: (teamId: string, filters: TeamRelayRankingFilters | undefined) =>
    [...teamKeys.detail(teamId), "relayRankings", filters] as const,
  hasAnyRelayRecord: (teamId: string) =>
    [...teamKeys.detail(teamId), "hasAnyRelayRecord"] as const,
  attendanceByPractice: (practiceId: string) =>
    [...teamKeys.all, "attendance", "practice", practiceId] as const,
  attendanceByCompetition: (competitionId: string) =>
    [...teamKeys.all, "attendance", "competition", competitionId] as const,
} as const;

/**
 * ランキング系のクエリキーかどうかを判定する述語。
 *
 * 記録 (`records`) を作成・更新・削除するとランキングの内容が変わるが、
 * 記録側のミューテーション (`./records.ts`) は teamId を持たないため
 * `teamKeys.rankings(teamId, filters)` のキーを組み立てられない。
 * `invalidateQueries({ predicate })` からこの述語を使って、どのチーム・
 * どの絞り込み条件のランキングでもまとめて落とす。
 *
 * キーを `teamKeys.detail(teamId)` の配下から出せば前方一致で落とせるが、
 * それをするとメンバーの追放・承認 (`teamKeys.detail` を invalidate する) で
 * ランキングが更新されなくなる (追放したメンバーの行が残る)。
 * 入れ子は維持したまま、teamId を知らない呼び出し元にはこの述語を提供する。
 */
export function isTeamRankingQueryKey(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] !== teamKeys.all[0]) return false;
  return (
    queryKey.includes("rankings") ||
    queryKey.includes("hasAnyRecord") ||
    // リレーランキングも同じ経路で落とす。リレーの保存は `records` の
    // delete + insert と `relay_records` の差し替えを**同じ操作で**行うため、
    // 片方だけ invalidate すると個人種目は更新されたのにリレーだけ古い、
    // という非対称なキャッシュ状態になる。
    // ⚠️ "rankings" の部分文字列一致ではなく完全一致の判定であることに注意:
    // queryKey.includes は要素の厳密比較なので "relayRankings" は
    // "rankings" にはマッチしない。明示的に列挙する必要がある。
    queryKey.includes("relayRankings") ||
    queryKey.includes("hasAnyRelayRecord")
  );
}

/**
 * **その操作でランキングの中身が変わるとき**にチーム記録ランキングのキャッシュを
 * 落とす。
 *
 * ⚠️ 「`records` の行が増減・変化したとき」ではない。大会の更新は `records` の行を
 * 1つも変えないが、年度絞り込みが `competitions.date` を見るため対象になる
 * (内訳は下の一覧)。
 *
 * ランキングは staleTime 5分でキャッシュされるため、これを呼ばないと
 * 「ランキングを開く → 記録を入れる/消す → ランキングに戻る」で最大5分間
 * 古い順位表 (存在しない記録を含む/新しい記録を欠く) が表示される。
 *
 * **判断軸は「その操作でランキングの中身が変わるか」**であって、ミューテーションの
 * 名前ではない。内訳:
 *   - `records` の行が増減・変化する操作 → 対象 (作成 / 更新 / 削除)
 *   - 大会の削除 → 対象 (紐づく records を削除・NULL 化する)
 *   - **大会の更新 → 対象。** `records` の行は増減しないが、ランキングの年度絞り込みは
 *     `competitions.date` を見るので、**大会日を年度をまたいで編集すると紐づく記録が
 *     別年度のランキングへ移動する** (第2弾で年度を選べるようにしたため。第1弾は
 *     通算固定だったので対象外だった)
 *   - 大会の作成 → **対象外**。作成直後の大会には記録が1件も紐づいていないので、
 *     どの年度のランキングも変わらない
 *
 * 生の `from("records")` 書き込み (管理者代理入力など React Query を経由しない経路)
 * からも呼べるよう、フックではなく `QueryClient` を受け取る純粋な関数にしている。
 */
export function invalidateTeamRankings(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ predicate: (query) => isTeamRankingQueryKey(query.queryKey) });
}

/**
 * お知らせのクエリキー
 */
export const announcementKeys = {
  all: ["announcements"] as const,
  lists: () => [...announcementKeys.all, "list"] as const,
  list: (teamId: string, viewOnly?: boolean) =>
    [...announcementKeys.lists(), teamId, { viewOnly }] as const,
  detail: (teamId: string, id: string) =>
    [...announcementKeys.lists(), teamId, "detail", id] as const,
} as const;

/**
 * 種目のクエリキー（マスターデータ）
 */
export const styleKeys = {
  all: ["styles"] as const,
  lists: () => [...styleKeys.all, "list"] as const,
  list: () => [...styleKeys.lists()] as const,
  detail: (id: number) => [...styleKeys.all, "detail", id] as const,
  byStroke: (stroke: string) => [...styleKeys.all, "stroke", stroke] as const,
} as const;

/**
 * ユーザーのクエリキー
 */
export const userKeys = {
  all: ["user"] as const,
  profile: (userId: string) => [...userKeys.all, "profile", userId] as const,
  teams: (userId: string) => [...userKeys.all, "teams", userId] as const,
  current: () => [...userKeys.all, "current"] as const,
  currentProfile: () => [...userKeys.all, "current", "profile"] as const,
  currentTeams: () => [...userKeys.all, "current", "teams"] as const,
} as const;

/**
 * ダッシュボード統計のクエリキー
 */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: (userId: string, month: string) => [...dashboardKeys.all, "stats", userId, month] as const,
} as const;

/**
 * 通知（出欠未回答・エントリー未提出）のクエリキー
 */
export const notificationKeys = {
  all: ["notifications"] as const,
  unanswered: (userId: string, teamIds: string[]) =>
    [...notificationKeys.all, "unanswered", userId, ...[...teamIds].sort()] as const,
  unsubmitted: (userId: string, teamIds: string[]) =>
    [...notificationKeys.all, "unsubmitted", userId, ...[...teamIds].sort()] as const,
} as const;

/**
 * カレンダー記録色設定のクエリキー
 */
export const calendarColorKeys = {
  all: ["calendarColors"] as const,
  settings: (userId: string) => [...calendarColorKeys.all, "settings", userId] as const,
} as const;

/**
 * 練習ログテンプレートのクエリキー
 */
export const practiceLogTemplateKeys = {
  all: ["practiceLogTemplates"] as const,
  lists: () => [...practiceLogTemplateKeys.all, "list"] as const,
  list: () => [...practiceLogTemplateKeys.lists()] as const,
  detail: (id: string) => [...practiceLogTemplateKeys.all, "detail", id] as const,
  count: () => [...practiceLogTemplateKeys.all, "count"] as const,
} as const;

/**
 * 理想LAP (race_pace_models) のクエリキー
 * 全ユーザー共通の参照データなので userId を含めない
 */
export const racePaceKeys = {
  all: ["racePaceModels"] as const,
  models: (filters: {
    gender: string;
    poolType: number;
    stroke: string;
    distance: number;
    ageCategory?: string;
  }) => [...racePaceKeys.all, "models", filters] as const,
  coverage: (filters: {
    gender: string;
    poolType: number;
    stroke: string;
    distance: number;
    ageCategory?: string;
  }) => [...racePaceKeys.all, "coverage", filters] as const,
} as const;
