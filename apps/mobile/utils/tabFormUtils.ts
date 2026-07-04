// =============================================================================
// タブフォーム共通ユーティリティ（純粋関数）
// =============================================================================
// QA が単体テストで利用する純粋関数群。副作用を持たない。
// ファイルパス: apps/mobile/utils/tabFormUtils.ts

import { parseISO, isValid } from "date-fns";

// ---------------------------------------------------------------------------
// isEntryTabVisible
// ---------------------------------------------------------------------------
/**
 * エントリータブを表示するかどうかを判定する純粋関数。
 * 大会日付が「未来（tomorrow以降）」の場合のみ true を返す。
 * 今日・過去・日付未入力はすべて false。
 *
 * @param date YYYY-MM-DD 形式の日付文字列。null/undefined/空文字も許容。
 * @returns 大会日付が厳密に未来(date > today)のとき true
 */
export function isEntryTabVisible(date: string | null | undefined): boolean {
  if (!date || date.trim() === "") return false;
  const parsed = parseISO(date);
  if (!isValid(parsed)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed > today;
}

// ---------------------------------------------------------------------------
// hasUnsavedChanges
// ---------------------------------------------------------------------------
/**
 * JSON シリアライズで比較して「未保存変更があるか」を判定する純粋関数。
 * オブジェクトの参照ではなく値で比較する。
 *
 * @param current 現在のフォーム state
 * @param snapshot 画面オープン時の初期スナップショット
 */
export function hasUnsavedChanges<T>(current: T, snapshot: T): boolean {
  return JSON.stringify(current) !== JSON.stringify(snapshot);
}

// ---------------------------------------------------------------------------
// diffPracticeLogDraft
// ---------------------------------------------------------------------------
/**
 * 練習ログドラフトリストの差分を計算する純粋関数。
 * 編集モード用: 追加/更新/削除の意図を返す。
 *
 * @param drafts 現在のドラフト一覧（id が存在するものは既存、なければ新規）
 * @param existingIds 既存 DB ログの id 一覧
 */
export interface PracticeLogDiff {
  creates: string[]; // ドラフトのローカルID（新規作成対象）
  updates: string[]; // 既存DBのlogId（更新対象）
  deletes: string[]; // 既存DBのlogId（削除対象）
}

export function diffPracticeLogDraft(
  drafts: Array<{ draftId: string; existingLogId?: string }>,
  existingIds: string[],
): PracticeLogDiff {
  const creates: string[] = [];
  const updates: string[] = [];
  const handledExistingIds = new Set<string>();

  for (const draft of drafts) {
    if (draft.existingLogId) {
      updates.push(draft.existingLogId);
      handledExistingIds.add(draft.existingLogId);
    } else {
      creates.push(draft.draftId);
    }
  }

  const deletes = existingIds.filter((id) => !handledExistingIds.has(id));
  return { creates, updates, deletes };
}

// ---------------------------------------------------------------------------
// diffRecordDraft
// ---------------------------------------------------------------------------
/**
 * レースレコードドラフトリストの差分を計算する純粋関数。
 * 編集モード用: 追加/更新/削除の意図を返す。
 *
 * @param drafts 現在のドラフト一覧（recordId が存在するものは既存、なければ新規）
 * @param existingIds 既存 DB レコードの id 一覧
 */
export interface RecordDiff {
  creates: string[]; // ドラフトのローカルID（新規作成対象）
  updates: string[]; // 既存DBのrecordId（更新対象）
  deletes: string[]; // 既存DBのrecordId（削除対象）
}

export function diffRecordDraft(
  drafts: Array<{ draftId: string; existingRecordId?: string }>,
  existingIds: string[],
): RecordDiff {
  const creates: string[] = [];
  const updates: string[] = [];
  const handledExistingIds = new Set<string>();

  for (const draft of drafts) {
    if (draft.existingRecordId) {
      updates.push(draft.existingRecordId);
      handledExistingIds.add(draft.existingRecordId);
    } else {
      creates.push(draft.draftId);
    }
  }

  const deletes = existingIds.filter((id) => !handledExistingIds.has(id));
  return { creates, updates, deletes };
}
