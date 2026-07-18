import type { CalendarItem } from "@apps/shared/types/ui";

/**
 * 画像ギャラリー（サムネイル行、約170px）や VideoPlayer（aspectRatio 16/9）が
 * クリップされずに視認できる程度の高さを一律で加算する。メディアの種類（画像/動画）や
 * 件数では変えない (契約はモノトニック非減少のみ。具体的な増分値は Developer 裁量)。
 */
const MEDIA_HEIGHT_BONUS = 200;

/**
 * エントリーが画像/動画メディアを持つか判定する。
 * entriesWithMedia (子コンポーネントの非同期フェッチ完了後に判明した id 集合) を優先し、
 * calendar_view 由来の metadata から同期的に分かる範囲（record.video_path）も補助的に見る。
 *
 * 注意: 現行の calendar_view (migration 20260417000000) は item_type='record' の行の
 * metadata に 'record' キー自体を積んでいない（'competition' キーのみ）。そのため
 * entry.metadata?.record?.video_path による同期フォールバックは現状ほぼ発火しない
 * (将来 calendar_view が record メタデータを積むようになった場合に備えた防御的な分岐)。
 * 実効的なメディア検出経路は entriesWithMedia、すなわち DayDetailModal の
 * onMediaLoaded コールバック（PracticeLogDetail / RecordDetail の非同期フェッチ完了後）である。
 */
function entryHasMedia(entry: CalendarItem, entriesWithMedia: ReadonlySet<string>): boolean {
  if (entriesWithMedia.has(entry.id)) return true;
  return Boolean(entry.metadata?.record?.video_path);
}

/**
 * DayDetailModal のモーダル最小高さ（px）を算出する純粋関数。
 *
 * エントリー件数・種類（記録・練習ログ・タイム有無）に応じた基準値に、画像/動画メディアの
 * 有無を反映する。entriesWithMedia が空集合のときは既存の基準値をそのまま返す（回帰なし）。
 */
export function computeDayDetailMinHeight(
  entries: CalendarItem[],
  entriesWithTimes: ReadonlySet<string>,
  entriesWithMedia: ReadonlySet<string>,
): number {
  const hasPracticeLog = entries.some((entry) => entry.type === "practice_log");
  const hasPracticeLogWithTimes = entries.some(
    (entry) => entry.type === "practice_log" && entriesWithTimes.has(entry.id),
  );
  const hasRecords = entries.some((entry) => entry.type === "record");
  const hasMedia = entries.some((entry) => entryHasMedia(entry, entriesWithMedia));

  let baseHeight: number;
  if (entries.length === 0) {
    baseHeight = 300;
  } else if (entries.length === 1) {
    if (hasRecords) {
      baseHeight = 600;
    } else if (!hasPracticeLog) {
      baseHeight = 400;
    } else if (hasPracticeLogWithTimes) {
      baseHeight = 600;
    } else {
      baseHeight = 350;
    }
  } else if (entries.length === 2) {
    if (hasRecords) {
      baseHeight = 700;
    } else if (hasPracticeLogWithTimes) {
      baseHeight = 600;
    } else {
      baseHeight = hasPracticeLog ? 600 : 375;
    }
  } else if (hasRecords) {
    baseHeight = 750;
  } else if (hasPracticeLogWithTimes) {
    baseHeight = 700;
  } else {
    baseHeight = 500;
  }

  return hasMedia ? baseHeight + MEDIA_HEIGHT_BONUS : baseHeight;
}
