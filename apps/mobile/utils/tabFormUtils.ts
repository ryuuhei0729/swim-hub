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
// isDefaultUntouchedEntry
// ---------------------------------------------------------------------------
/**
 * エントリー行が「未編集のデフォルト行」かどうかを判定する純粋関数。
 * 未来大会の新規作成時、種目取得完了後にデフォルト種目が自動セットされた
 * 1行目が、ユーザーが一切操作しないまま保存されてしまうバグを防ぐために使う。
 *
 * @param entry 判定対象のエントリー行 (EntryDraftRow の判定に必要な部分集合)
 * @param defaultStyleId 種目取得後に自動セットされたデフォルト種目 ID。未取得時は空文字。
 * @returns 既存DBエントリーではなく、かつ全項目が未編集のデフォルト値のとき true
 */
export interface EntryRowForDefaultCheck {
  existingEntryId?: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
  isRelaying: boolean;
}

export function isDefaultUntouchedEntry(
  entry: EntryRowForDefaultCheck,
  defaultStyleId: string,
): boolean {
  if (entry.existingEntryId) return false;
  if (entry.entryTime !== 0) return false;
  if (entry.entryTimeDisplayValue.trim() !== "") return false;
  if (entry.note.trim() !== "") return false;
  if (entry.isRelaying) return false;
  return entry.styleId === defaultStyleId;
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
// getTabNavAdjacency
// ---------------------------------------------------------------------------
/**
 * アクティブタブの前後タブ(フッターの「前に戻る」「次に進む」ボタン用)を
 * 算出する純粋関数。web (apps/web/utils/tabModalUtils.ts) とシグネチャ・
 * 挙動を同一にミラーする。
 *
 * @param visibleTabs 現在表示されているタブの並び順
 * @param activeTab 現在アクティブなタブ
 * @param options.guardedNextTab ガード対象のタブ (例: 大会の "record")
 * @param options.isGuarded true のとき、nextTab が guardedNextTab と一致する場合に
 *   nextTab を undefined に上書きする ("次に進む" ボタンを出さない)
 */
export interface TabNavAdjacency<T extends string> {
  prevTab?: T;
  nextTab?: T;
}

export function getTabNavAdjacency<T extends string>(
  visibleTabs: T[],
  activeTab: T,
  options?: { guardedNextTab?: T; isGuarded?: boolean },
): TabNavAdjacency<T> {
  const idx = visibleTabs.indexOf(activeTab);
  const prevTab = idx > 0 ? visibleTabs[idx - 1] : undefined;
  let nextTab = idx >= 0 && idx < visibleTabs.length - 1 ? visibleTabs[idx + 1] : undefined;
  if (nextTab && options?.guardedNextTab === nextTab && options.isGuarded) {
    nextTab = undefined;
  }
  return { prevTab, nextTab };
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
