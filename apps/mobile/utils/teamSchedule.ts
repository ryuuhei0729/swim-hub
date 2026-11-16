import type { Competition, Practice } from "@swim-hub/shared/types";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";

/** チームタブ「予定」の種類の絞り込み (どれか 1 つを選ぶ) */
export type ScheduleKind = "all" | "practices" | "competitions";

export type ScheduleItem =
  | { kind: "practice"; key: string; date: string; practice: Practice }
  | { kind: "competition"; key: string; date: string; competition: Competition };

/**
 * 練習・大会を絞り込みに合わせて並べる。
 * 種類 (全て / 練習 / 大会) と「過去」は独立した条件で、組み合わせて使う。
 *   - showPast = false: 今日以降を日付の近い順
 *   - showPast = true : 昨日以前を新しい順
 * 「今日」は大会カードと同じく isCompetitionDateInPast (端末のローカル日付) で判定する。
 * 日付が同じときは練習を先にする (同じ日の練習と大会の並びが更新のたびに入れ替わらないように)。
 */
export function buildScheduleItems(
  practices: readonly Practice[],
  competitions: readonly Competition[],
  kind: ScheduleKind,
  showPast: boolean,
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  if (kind !== "competitions") {
    for (const practice of practices) {
      items.push({ kind: "practice", key: `p-${practice.id}`, date: practice.date, practice });
    }
  }
  if (kind !== "practices") {
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
  return items
    .filter((item) => isCompetitionDateInPast(item.date) === showPast)
    .sort((a, b) => {
      // yyyy-MM-dd なので文字列比較で日付順になる
      const byDate = showPast ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
      return byDate !== 0 ? byDate : kindOrder(a) - kindOrder(b);
    });
}
