import { toISODateString } from "@apps/shared/utils/date";
import type { TeamPractice } from "@/hooks/queries/teamPracticeQueries";
import type { TeamCompetition } from "@/hooks/queries/teamCompetitionQueries";

/** チーム画面「予定」タブの種類の絞り込み (どれか 1 つを選ぶ)。mobile の utils/teamSchedule.ts と同じ */
export type ScheduleKind = "all" | "practices" | "competitions";

export type ScheduleItem =
  | { kind: "practice"; key: string; date: string; practice: TeamPractice }
  | { kind: "competition"; key: string; date: string; competition: TeamCompetition };

/**
 * 予定タブで「今日」とみなす日付 (端末のローカル日付 yyyy-MM-dd)。
 * 今日以降 / 過去 の境目で、取得クエリのキーにも入れる (タブ本体と先読みで同じ値を使う)。
 * 大会カードの isCompetitionDateInPast と同じく端末のローカル日付で判定する。
 */
export function getScheduleToday(now: Date = new Date()): string {
  return toISODateString(now);
}

export interface BuildScheduleItemsInput {
  practices: readonly TeamPractice[];
  competitions: readonly TeamCompetition[];
  kind: ScheduleKind;
  showPast: boolean;
  /**
   * 過去の一覧を段階読み込みしているとき、まだ続きがあるか。
   * 「全て」で練習と大会を混ぜるとき、続きのある側の読み込み済みの最古の日付より古いものは
   * 出さない (続きを読むと間に入るものがあるため)。今日以降は全件取るので使わない。
   */
  practicesHasMore?: boolean;
  competitionsHasMore?: boolean;
}

/**
 * 練習・大会を絞り込みに合わせて 1 本の一覧に並べる (mobile の buildScheduleItems と同じ並び)。
 *   - showPast = false: 今日以降を日付の近い順
 *   - showPast = true : 昨日以前を新しい順
 * 今日以降 / 過去 の振り分けは取得時 (クエリ) に済んでいるので、ここでは混ぜて並べるだけ。
 * 日付が同じときは練習を先にする (同じ日の練習と大会の並びが更新のたびに入れ替わらないように)。
 */
export function buildScheduleItems({
  practices,
  competitions,
  kind,
  showPast,
  practicesHasMore = false,
  competitionsHasMore = false,
}: BuildScheduleItemsInput): ScheduleItem[] {
  const includePractices = kind !== "competitions";
  const includeCompetitions = kind !== "practices";

  const items: ScheduleItem[] = [];
  if (includePractices) {
    for (const practice of practices) {
      items.push({ kind: "practice", key: `p-${practice.id}`, date: practice.date, practice });
    }
  }
  if (includeCompetitions) {
    for (const competition of competitions) {
      items.push({
        kind: "competition",
        key: `c-${competition.id}`,
        date: competition.date,
        competition,
      });
    }
  }

  const kindOrder = (item: ScheduleItem) => (item.kind === "practice" ? 0 : 1);
  const sorted = items.sort((a, b) => {
    // yyyy-MM-dd なので文字列比較で日付順になる
    const byDate = showPast ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : kindOrder(a) - kindOrder(b);
  });

  if (!showPast) return sorted;

  // 過去の段階読み込み: 続きのある側の最古の日付より古いものは、続きを読むまで出さない
  const cutoffs: string[] = [];
  if (includePractices && practicesHasMore && practices.length > 0) {
    cutoffs.push(practices[practices.length - 1]!.date);
  }
  if (includeCompetitions && competitionsHasMore && competitions.length > 0) {
    cutoffs.push(competitions[competitions.length - 1]!.date);
  }
  if (cutoffs.length === 0) return sorted;
  const cutoff = cutoffs.reduce((max, date) => (date > max ? date : max));
  return sorted.filter((item) => item.date >= cutoff);
}
