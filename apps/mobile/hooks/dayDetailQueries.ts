// =============================================================================
// 日別詳細 (DayDetailModal) の React Query キーと無効化（モバイル版）
// =============================================================================
//
// 日付をタップするたびに練習・エントリー・記録の詳細を取得していて、同じ日を開き直しても
// 毎回スピナーを待っていた。キャッシュに載せ、開き直したときは前回の内容をすぐ表示して
// 裏で取り直す (取り直しの頻度は従来どおり = 開くたび)。
//
// キャッシュは端末にも JSON で保存される (lib/queryPersistence.ts)。
//   - データに Map / Set / Date を入れない
//   - 画像の署名付きURLは失効するので入れない (パスだけ持ち、URL は useGalleryImages で解決する)
//   - 表示言語で変わる文字列 (種目名など) は入れず、描画時に組み立てる
//
// 保存・削除した直後に古い内容が一瞬でも出ると「保存されなかった」ように見えるため、
// 書き換えた対象の詳細は無効化し、取り直しが済むまで表示しない (useIsAwaitingFreshData)。
// キーは「どの練習 / どの大会のものか」を先頭に置き、書き換えた対象だけを無効化できるように
// してある (関係ない日の詳細まで無効化すると、保存のたびにキャッシュの効果が無くなる)。

import type { QueryClient } from "@tanstack/react-query";
import { dashboardKeys } from "@apps/shared/hooks/queries/keys";

export const dayDetailKeys = {
  all: ["dayDetail"] as const,
  /** すべての練習の詳細 */
  practices: () => [...dayDetailKeys.all, "practice"] as const,
  /** ある練習に属する詳細すべて (練習本体 + そのメニュー) */
  practiceScope: (practiceId: string) => [...dayDetailKeys.practices(), practiceId] as const,
  /** 練習1件とそのメニュー (practice_logs) */
  practice: (practiceId: string) => [...dayDetailKeys.practiceScope(practiceId), "logs"] as const,
  /** 練習メニュー1件 */
  practiceLog: (practiceId: string, practiceLogId: string) =>
    [...dayDetailKeys.practiceScope(practiceId), "log", practiceLogId] as const,
  /** ある大会に属する詳細すべて (エントリー + 記録) */
  competitionScope: (competitionId: string) =>
    [...dayDetailKeys.all, "competition", competitionId] as const,
  /** 大会に対する自分の最新の記録1件 (record 表示用) */
  latestRecord: (competitionId: string, userId: string) =>
    [...dayDetailKeys.competitionScope(competitionId), "latestRecord", userId] as const,
  /** 大会に対する自分のエントリー */
  entries: (competitionId: string, userId: string) =>
    [...dayDetailKeys.competitionScope(competitionId), "entries", userId] as const,
  /** 大会の記録 (チーム大会は自分の分だけ / 記録1件に絞る場合あり) */
  records: (
    competitionId: string,
    filters: { userId: string; ownOnly: boolean; recordId: string | null },
  ) => [...dayDetailKeys.competitionScope(competitionId), "records", filters] as const,
} as const;

/**
 * 日別詳細のクエリに共通の設定。
 *
 * retry: false — 詳細は以前から「取得に失敗したらすぐ空の表示にする」動きだった。
 * 既定のリトライ (最大3回・計7秒) に任せると、その間ずっと読み込み中のままになる。
 * 削除した直後の行を取り直しに行って失敗する場合も、1回で諦めさせる。
 */
export const DAY_DETAIL_QUERY_OPTIONS = { staleTime: 0, retry: false } as const;

/** 書き換えた対象。分からない・複数にまたがる場合は指定しない (すべての詳細を無効化する) */
export interface CalendarChangeScope {
  practiceId?: string | null;
  competitionId?: string | null;
}

/**
 * 練習・大会・記録・エントリーを保存したあとに呼ぶ。
 * カレンダーの一覧とホームのカード (dashboard) を取り直し、書き換えた対象の日別詳細を無効化する。
 *
 * scope を渡すと、その練習 / 大会の詳細だけを無効化する。渡さなければ全部を無効化する
 * (一括登録など対象を絞れない場合。安全側)。
 */
export function invalidateCalendarAfterSave(
  queryClient: QueryClient,
  scope?: CalendarChangeScope,
): Promise<void> {
  const { practiceId, competitionId } = scope ?? {};
  const detailKeys: Array<readonly unknown[]> = [];
  if (practiceId) detailKeys.push(dayDetailKeys.practiceScope(practiceId));
  if (competitionId) detailKeys.push(dayDetailKeys.competitionScope(competitionId));
  if (detailKeys.length === 0) detailKeys.push(dayDetailKeys.all);

  // ホームの「次の大会」「前回の練習」のカードも保存した内容で取り直す
  // (ホームはスタックに残ったままで、戻っても自動では取り直されないため)
  return Promise.all(
    [["calendar"], dashboardKeys.all, ...detailKeys].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  ).then(() => undefined);
}

/**
 * 日別詳細の中で削除したあとに呼ぶ。
 *
 * すべての詳細を無効化するが、表示中のものをここで一斉に取り直すことはしない
 * (消したばかりの行を取りに行って失敗するうえ、一覧の更新で詳細がもう一度取り直されて
 * 読み込み表示が2回ちらつく)。エントリー・記録は一覧が更新されたときに取り直される
 * (useInvalidateWhenChanged)。練習はその仕組みを持たないので、ここで取り直す。
 */
export function invalidateDayDetailsAfterDelete(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: dayDetailKeys.all, refetchType: "none" });
  void queryClient.invalidateQueries({ queryKey: dayDetailKeys.practices() });
}
