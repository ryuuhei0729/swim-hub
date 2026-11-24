// =============================================================================
// チーム詳細画面 (Web) のクエリキー・共通オプション・invalidate ヘルパー
//
// packages/shared の `teamKeys` の入れ子構造をそのまま使い、その配下に Web 専用の
// 末尾要素 ("web", ...) を足す。shared のフック (useTeamMembersQuery 等) と同じキーに
// 形の違うデータを入れて衝突させないため、完全一致のキーは必ず Web 専用にする。
//
// ⚠️ キーの置き場所の方針:
//   - 軽い一覧 (メンバー・練習・大会・グループ) は `teamKeys.detail(teamId)` 配下に置く。
//     shared のメンバー系ミューテーション / Realtime 購読は `teamKeys.detail(teamId)` を
//     前方一致で invalidate するので、メンバーの追放・承認・権限変更でまとめて落ちてよい。
//   - 全メンバーのベストタイム (メンバー数ぶんのクエリを並列で投げる重いクエリ) は
//     `teamKeys` の外 (`teamMemberBestTimesKeys`) に置く。`teamKeys.detail` / `teamKeys.all`
//     配下に置くと、メンバーシップや権限の変更・お知らせ編集のたびに巻き込まれて
//     再取得が走ってしまう。
// =============================================================================

import type { QueryClient } from "@tanstack/react-query";
import { teamKeys } from "@apps/shared/hooks/queries/keys";

/**
 * 以前は「タブ / モーダルを開くたびに取得」していたデータ用の共通オプション。
 *
 * - staleTime: 0 … 開くたびに必ず再取得する (鮮度を以前より悪くしない)。
 *   キャッシュの効用は「再取得中も前回の内容をすぐ表示できる」ことだけ。
 * - retry: false … 以前のコードは失敗したら即座にエラーを出していた。既定の
 *   3 回リトライ (~7 秒) でスピナーのまま待たせない。
 */
export const TEAM_VIEW_QUERY_OPTIONS = {
  staleTime: 0,
  retry: false,
} as const;

/**
 * 重いクエリ用。以前はウィンドウフォーカスで再取得していなかったので、
 * staleTime 0 による「フォーカスのたびに全件再取得」を起こさない。
 */
export const TEAM_HEAVY_VIEW_QUERY_OPTIONS = {
  ...TEAM_VIEW_QUERY_OPTIONS,
  refetchOnWindowFocus: false,
} as const;

export const teamDetailKeys = {
  // --- メンバー -------------------------------------------------------------
  /** 承認済み・在籍中メンバー一覧 (メンバータブ) */
  approvedMembers: (teamId: string) =>
    [...teamKeys.members(teamId), "web", "approved"] as const,
  /** グループ割り当て用の選択肢 (グループ管理タブ) */
  selectableMembers: (teamId: string) =>
    [...teamKeys.members(teamId), "web", "selectable"] as const,
  /** 出欠状況モーダルの名簿 (fetchTeamMembers の形) */
  attendanceMembers: (teamId: string) =>
    [...teamKeys.members(teamId), "web", "attendance"] as const,
  /** 承認待ちメンバー一覧 (管理者) */
  pendingMemberList: (teamId: string) =>
    [...teamKeys.pendingMembers(teamId), "web", "list"] as const,
  /** 承認待ち件数 (管理者タブのバッジ) */
  pendingMemberCount: (teamId: string) =>
    [...teamKeys.pendingMembers(teamId), "web", "count"] as const,

  // --- グループ -------------------------------------------------------------
  groups: (teamId: string) => [...teamKeys.detail(teamId), "groups"] as const,
  /** グループ一覧 + 人数 (グループ管理タブ) */
  groupsWithCount: (teamId: string) => [...teamDetailKeys.groups(teamId), "withCount"] as const,
  /** グループ + 全所属 (メンバー一覧のグループ別表示) */
  groupSortData: (teamId: string) => [...teamDetailKeys.groups(teamId), "sortData"] as const,
  /** 1グループの所属メンバー (グループメンバー一覧モーダル) */
  groupMembers: (teamId: string, groupId: string) =>
    [...teamDetailKeys.groups(teamId), "members", groupId] as const,

  // --- 練習 -----------------------------------------------------------------
  practicePages: (teamId: string) => [...teamKeys.practices(teamId), "web", "page"] as const,
  practicePage: (teamId: string, page: number, pageSize: number) =>
    [...teamDetailKeys.practicePages(teamId), page, pageSize] as const,
  /**
   * 練習詳細モーダル。練習ログ入力ページ (practiceId しか持たない経路) からも
   * 落とせるよう teamId を含めない (`teamKeys.attendanceByPractice` と同じ形)。
   */
  practiceDetail: (practiceId: string) =>
    [...teamKeys.all, "web", "practiceDetail", practiceId] as const,

  // --- 大会 -----------------------------------------------------------------
  competitionPages: (teamId: string) => [...teamKeys.competitions(teamId), "web", "page"] as const,
  competitionPage: (teamId: string, page: number, pageSize: number) =>
    [...teamDetailKeys.competitionPages(teamId), page, pageSize] as const,
  /** エントリー一覧モーダル。閲覧者のロール (isAdmin) を含むので userId もキーに入れる */
  competitionEntriesAll: (teamId: string, competitionId: string) =>
    [...teamKeys.competitions(teamId), "web", "entries", competitionId] as const,
  competitionEntries: (teamId: string, competitionId: string, userId: string | null) =>
    [...teamDetailKeys.competitionEntriesAll(teamId, competitionId), userId] as const,
  /** 記録一覧モーダル。記録入力ページ (competitionId のみで落とせる) 用に teamId を含めない */
  competitionRecords: (competitionId: string) =>
    [...teamKeys.all, "web", "competitionRecords", competitionId] as const,

  // --- 出欠 -----------------------------------------------------------------
  /**
   * 自分の月別出欠サマリ (出欠タブ)。自分の回答を数えるので userId、
   * 「今月から1年分」なので基準月 (yyyy-MM) もキーに含める。
   */
  myMonthListAll: (teamId: string) =>
    [...teamKeys.detail(teamId), "web", "myMonthList"] as const,
  myMonthList: (teamId: string, userId: string | null, baseMonth: string) =>
    [...teamDetailKeys.myMonthListAll(teamId), userId, baseMonth] as const,
} as const;

/**
 * 全メンバーのベストタイム。重いので `teamKeys` の外に置く (ファイル冒頭の方針参照)。
 */
export const teamMemberBestTimesKeys = {
  all: ["teamMemberBestTimes"] as const,
  team: (teamId: string) => [...teamMemberBestTimesKeys.all, teamId] as const,
  /** members は「membership id:user_id」の並び。メンバー構成が変わればキーも変わる */
  list: (teamId: string, memberPairs: readonly string[]) =>
    [...teamMemberBestTimesKeys.team(teamId), memberPairs] as const,
} as const;

// =============================================================================
// invalidate ヘルパー
//
// ミューテーションの経路から「その操作で中身が変わるクエリだけ」を落とす。
// QueryClient を受け取る純粋関数にしているのは、Provider が無い可能性のある
// 画面 (useTeamQueryClient が null を返す) からも同じ定義を使うため。
// =============================================================================

/**
 * 保存・削除の直後に、その操作で中身が変わるクエリ (前方一致) を最新化する。
 *
 * - 表示中 (active) のクエリ … invalidate して再取得し、完了まで待つ。
 * - 表示していない (inactive) クエリ … キャッシュごと捨てる。invalidate だけだと
 *   staleTime 0 で再マウント時に再取得はされるが、それが終わるまで「保存前の内容」が
 *   表示されてしまう (例: 2 ページ目で保存 → 1 ページ目に戻すと古い 1 ページ目が出る、
 *   閉じていた詳細モーダルを開き直すと保存前のログが出る)。捨てておけば次に表示する
 *   ときは以前と同じ 読み込み表示 → 最新の内容 になる。
 */
export function refreshQueriesAfterWrite(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  queryClient.removeQueries({ queryKey, type: "inactive" });
  return queryClient.invalidateQueries({ queryKey });
}

/** メンバー構成・ロール・泳者区分の変更 (承認 / 却下 / 追放 / 権限変更) */
export function invalidateTeamMemberQueries(queryClient: QueryClient, teamId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) }),
    queryClient.invalidateQueries({ queryKey: teamKeys.pendingMembers(teamId) }),
    // グループ人数・グループメンバー一覧は在籍メンバーで絞っているので一緒に落とす
    queryClient.invalidateQueries({ queryKey: teamDetailKeys.groups(teamId) }),
  ]);
}

/** グループの作成・更新・削除・所属の変更 */
export function invalidateTeamGroupQueries(queryClient: QueryClient, teamId: string) {
  return queryClient.invalidateQueries({ queryKey: teamDetailKeys.groups(teamId) });
}

/**
 * 練習の作成・更新・削除・ログ変更。
 * 練習日が変わると出欠タブの月別サマリ (練習・大会の件数を数える) も変わるので落とす。
 */
export function invalidateTeamPracticeQueries(
  queryClient: QueryClient,
  teamId: string,
  practiceId?: string,
) {
  return Promise.all([
    refreshQueriesAfterWrite(queryClient, teamDetailKeys.practicePages(teamId)),
    refreshQueriesAfterWrite(queryClient, teamDetailKeys.myMonthListAll(teamId)),
    practiceId
      ? refreshQueriesAfterWrite(queryClient, teamDetailKeys.practiceDetail(practiceId))
      : Promise.resolve(),
  ]);
}

/**
 * 大会の作成・更新・削除・エントリー / 記録の変更。
 * ランキングは shared の `invalidateTeamRankings` を別途呼ぶこと (判断軸がそちらにある)。
 */
export function invalidateTeamCompetitionQueries(
  queryClient: QueryClient,
  teamId: string,
  competitionId?: string,
) {
  return Promise.all([
    refreshQueriesAfterWrite(queryClient, teamDetailKeys.competitionPages(teamId)),
    refreshQueriesAfterWrite(queryClient, teamDetailKeys.myMonthListAll(teamId)),
    competitionId
      ? refreshQueriesAfterWrite(
          queryClient,
          teamDetailKeys.competitionEntriesAll(teamId, competitionId),
        )
      : Promise.resolve(),
    competitionId
      ? refreshQueriesAfterWrite(queryClient, teamDetailKeys.competitionRecords(competitionId))
      : Promise.resolve(),
  ]);
}

/** 記録の保存・削除。ベストタイム表 (重い) はここでだけ落とす */
export function invalidateTeamMemberBestTimes(queryClient: QueryClient, teamId: string) {
  return queryClient.invalidateQueries({ queryKey: teamMemberBestTimesKeys.team(teamId) });
}

/**
 * 出欠の回答 (自分の回答・管理者の代理) を保存したとき。
 * 出欠状況モーダルは shared の `teamKeys.attendanceByPractice/Competition` と同じキー・
 * 同じ形のデータを使っているので、shared のミューテーションと同じキーを落とす。
 */
export function invalidateTeamAttendanceAnswerQueries(
  queryClient: QueryClient,
  events: ReadonlyArray<{ id: string; type: "practice" | "competition" }>,
) {
  // 月別サマリ (重い) はここでは落とさない。呼び出し側が 1 か月分だけ再計算するか
  // (updateMonthStatus)、一覧ごと再取得 (loadMonthList) しているため
  return Promise.all([
    ...events.map((event) =>
      queryClient.invalidateQueries({
        queryKey:
          event.type === "practice"
            ? teamKeys.attendanceByPractice(event.id)
            : teamKeys.attendanceByCompetition(event.id),
      }),
    ),
  ]);
}

/**
 * 別ページ (記録入力・練習ログ入力・エントリー一括入力) で保存したとき用。
 *
 * そのページからチーム画面へ戻ると一覧は再マウントされ、staleTime 0 なので再取得は
 * 走るが、invalidate だけだと再取得が終わるまで「保存前の内容」が一瞬表示される。
 * 中身が古いと分かっているキャッシュは reset して、戻ったときは以前と同じ
 * 読み込み表示 → 最新の内容 になるようにする (非アクティブなクエリは取得しない)。
 */
export function resetTeamQueriesAfterExternalSave(
  queryClient: QueryClient,
  queryKeys: ReadonlyArray<readonly unknown[]>,
) {
  return Promise.all(queryKeys.map((queryKey) => queryClient.resetQueries({ queryKey })));
}
