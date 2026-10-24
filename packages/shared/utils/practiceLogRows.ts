import type { PracticeLogWithTags, PracticeWithLogs } from "../types";

/**
 * 練習履歴一覧の log-level 化(2026-08-01)。
 *
 * 2026-07-23 の day-level 化(1 practice = 1カード)では、1つの練習に複数の練習ログが
 * ある場合に1枚のカード内へ全ログを行として詰め込んでいた。大会タブ(1 record = 1カード、
 * カードをタップすると大会全体のモーダルが開く)と粒度が揃っていなかったため、
 * 練習タブも「1 practice_log = 1カード」に揃える。カードのタップ先は従来どおり
 * 練習全体(mobile: その日の DayDetailModal / web: PracticeDetailModal)であり、
 * どのログのカードから開いても同じ練習の全ログが載ったモーダルが開く。
 */

/** 練習一覧カード1枚分。1件の practice_log と、その親 practice を保持する */
export interface PracticeLogRow {
  /**
   * リストのキー。通常は practice_log.id。
   * ログが1件も無い練習は practice.id をキーにした1行として残す
   * (ログ0件の練習が一覧から消えてしまうのを防ぐ)。
   */
  id: string;
  practice: PracticeWithLogs;
  /** ログ未登録の練習は null */
  log: PracticeLogWithTags | null;
}

/**
 * 練習(日)の配列を、練習ログ単位のカード行へ平坦化する。
 *
 * - ログの並び順は practice_logs の配列順(取得元のクエリ順)をそのまま維持する
 * - practice.id の重複はスキップする(リアルタイム更新等でキャッシュに重複 id が
 *   混入した場合の防御。旧 `groupLogsByPracticeDay` の役割を引き継ぐ)
 * - practice_logs が空/未定義の練習は log=null の行を1件だけ生成する
 */
export function buildPracticeLogRows(practices: PracticeWithLogs[]): PracticeLogRow[] {
  const seenPracticeIds = new Set<string>();
  const rows: PracticeLogRow[] = [];

  for (const practice of practices) {
    if (seenPracticeIds.has(practice.id)) continue;
    seenPracticeIds.add(practice.id);

    const logs = practice.practice_logs ?? [];
    if (logs.length === 0) {
      rows.push({ id: practice.id, practice, log: null });
      continue;
    }

    for (const log of logs) {
      rows.push({ id: log.id, practice, log });
    }
  }

  return rows;
}

/**
 * タグフィルタ: 「そのログが選択タグを全て持つか」(per-log の AND 判定)。
 *
 * day-level 時代の `practiceMatchesTags` / `dayHasLogMatchingAllTags` は
 * 「そのようなログが日の中に1件でもあれば日全体を表示」(OR-exists)だったが、
 * カードが log 単位になったことで OR-exists は不要になり、判定はログ単体に閉じる。
 * これにより「タグを持たない兄弟ログのカードまで一緒に表示される」ことがなくなる。
 *
 * タグIDは JOIN 先の `practice_tags.id` ではなく FK生カラムである
 * `practice_log_tags.practice_tag_id` を参照する(JOIN が欠落しても絞り込みが機能する)。
 *
 * - 選択0件は常に一致(全通過)
 * - ログ未登録(log=null)の行は、タグが1件でも選択されていれば不一致
 */
export function logMatchesAllTags(
  log: PracticeLogWithTags | null,
  selectedTagIds: string[],
): boolean {
  if (selectedTagIds.length === 0) return true;
  if (!log) return false;

  const logTagIds = (log.practice_log_tags ?? []).map((plt) => plt.practice_tag_id);
  return selectedTagIds.every((tagId) => logTagIds.includes(tagId));
}
