// =============================================================================
// カレンダーの項目タイトルを、表示言語に合わせて作り直す
// =============================================================================
// calendar_view (DB のビュー) は title を日本語で組み立てて返す:
//   - タイトル未設定の練習 → '練習' / 'チーム練習'
//   - 練習ログ → '100m × 4本' / '100m × 4本 × 2セット'
//   - タイトル未設定の大会 → '大会'
// そのままだと英語などの表示でも日本語が残るので、metadata に入っている元の行
// (practice / practice_log / competition) から、画面の言語の文言で組み立て直す。
// metadata が無い・形が想定と違うときは、ビューの title をそのまま使う。
// =============================================================================

import type { CalendarItem } from "../types/ui";

export interface CalendarItemTitleLabels {
  /** タイトル未設定の練習 */
  practice: string;
  /** タイトル未設定のチーム練習 */
  teamPractice: string;
  /** タイトル未設定の大会 */
  competition: string;
  /** 練習ログ (距離 × 本数 [× セット数]) */
  practiceLog: (log: { distance: number; reps: number; sets: number }) => string;
}

const COMPETITION_TYPES = new Set(["competition", "team_competition", "entry", "record"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** 空でない文字列ならそれを、そうでなければ null */
function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function localizeCalendarItemTitle(
  item: Pick<CalendarItem, "type" | "title" | "metadata">,
  labels: CalendarItemTitleLabels,
): string {
  const metadata = asRecord(item.metadata);

  if (item.type === "practice" || item.type === "team_practice") {
    const practice = asRecord(metadata?.practice);
    const fallback = item.type === "practice" ? labels.practice : labels.teamPractice;
    // 元の行があれば、そのタイトルが空のときだけ表示言語の既定名にする
    if (practice && "title" in practice) return nonEmpty(practice.title) ?? fallback;
    return nonEmpty(item.title) ?? fallback;
  }

  if (item.type === "practice_log") {
    const log = asRecord(metadata?.practice_log);
    const distance = log?.distance;
    const reps = log?.rep_count;
    const sets = log?.set_count;
    if (typeof distance === "number" && typeof reps === "number" && typeof sets === "number") {
      return labels.practiceLog({ distance, reps, sets });
    }
    return item.title;
  }

  if (COMPETITION_TYPES.has(item.type)) {
    const competition = asRecord(metadata?.competition);
    if (competition) return nonEmpty(competition.title) ?? labels.competition;
    return nonEmpty(item.title) ?? labels.competition;
  }

  return item.title;
}
