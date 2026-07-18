/**
 * タブモーダル: ドラフト差分計算純粋関数
 *
 * 制約: 外部副作用なし・純粋関数のみ。QA が単体テスト可能。
 *
 * 使用箇所: `useDashboardHandlers.ts` の一括保存ハンドラー内。
 */

import type { EntryFormData, PracticeMenuFormData, RecordFormDataInput } from "@/stores/types";
import { isDbUuid } from "@/utils/isDbUuid";

// =============================================================================
// 練習ログ差分
// =============================================================================

export interface PracticeLogDiff {
  /** 新規追加するログ (id が DB UUID でない) */
  toAdd: PracticeMenuFormData[];
  /** 更新するログ (id が DB UUID で変更あり) */
  toUpdate: Array<{ id: string; data: PracticeMenuFormData }>;
  /** 削除するログ ID */
  toDelete: string[];
}

/**
 * 練習ログのドラフトと元 DB スナップショットを比較して差分を計算する。
 *
 * @param draftLogs - モーダル内で編集中のログ一覧
 * @param originalIds - 元 DB に存在するログ ID 一覧
 */
export function computePracticeLogDiff(
  draftLogs: PracticeMenuFormData[],
  originalIds: string[],
): PracticeLogDiff {
  const originalIdSet = new Set(originalIds);
  const toAdd: PracticeMenuFormData[] = [];
  const toUpdate: Array<{ id: string; data: PracticeMenuFormData }> = [];
  const draftIdSet = new Set<string>();

  for (const log of draftLogs) {
    const id = log.tempMenuId;
    if (!id || !isDbUuid(id)) {
      toAdd.push(log);
    } else {
      draftIdSet.add(id);
      if (originalIdSet.has(id)) {
        toUpdate.push({ id, data: log });
      } else {
        toAdd.push(log);
      }
    }
  }

  const toDelete = originalIds.filter((id) => !draftIdSet.has(id));
  return { toAdd, toUpdate, toDelete };
}

// =============================================================================
// エントリー差分
// =============================================================================

export interface EntryDiff {
  toAdd: EntryFormData[];
  toUpdate: Array<{ id: string; data: EntryFormData }>;
  toDelete: string[];
}

/**
 * エントリーのドラフトと元 DB スナップショットを比較して差分を計算する。
 *
 * @param draftEntries - モーダル内で編集中のエントリー一覧
 * @param originalIds - 元 DB に存在するエントリー ID 一覧
 */
export function computeEntryDiff(
  draftEntries: EntryFormData[],
  originalIds: string[],
): EntryDiff {
  const originalIdSet = new Set(originalIds);
  const toAdd: EntryFormData[] = [];
  const toUpdate: Array<{ id: string; data: EntryFormData }> = [];
  const draftIdSet = new Set<string>();

  for (const entry of draftEntries) {
    if (!entry.id || !isDbUuid(entry.id)) {
      toAdd.push(entry);
    } else {
      draftIdSet.add(entry.id);
      if (originalIdSet.has(entry.id)) {
        toUpdate.push({ id: entry.id, data: entry });
      } else {
        toAdd.push(entry);
      }
    }
  }

  const toDelete = originalIds.filter((id) => !draftIdSet.has(id));
  return { toAdd, toUpdate, toDelete };
}

/** isDefaultUntouchedEntry の判定対象行 (web CompetitionTabModal の EntryDraft 相当)。 */
export interface UntouchedEntryCandidate {
  id: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
  isRelaying: boolean;
}

/**
 * 未編集のデフォルトエントリー行かどうかを判定する純粋関数。
 *
 * 新規行 (id が DB UUID でない = computeEntryDiff と同じ既存判定規約) であり、かつ
 * 種目がデフォルトのまま・タイム未入力・メモ空・リレーOFF の場合のみ true を返す。
 * 既存 DB エントリー (id が DB UUID) は値が一致していても常に false (誤削除防止)。
 *
 * @param entry - 判定対象のエントリー行
 * @param defaultStyleId - 初期表示される種目 ID (styles[0]?.id?.toString() ?? "")
 */
export function isDefaultUntouchedEntry(
  entry: UntouchedEntryCandidate,
  defaultStyleId: string,
): boolean {
  if (isDbUuid(entry.id)) return false;
  return (
    entry.entryTime === 0 &&
    entry.entryTimeDisplayValue.trim() === "" &&
    entry.note.trim() === "" &&
    !entry.isRelaying &&
    entry.styleId === defaultStyleId
  );
}

// =============================================================================
// レコード差分
// =============================================================================

export interface RecordDiff {
  toAdd: RecordFormDataInput[];
  toUpdate: Array<{ id: string; data: RecordFormDataInput }>;
  toDelete: string[];
}

/**
 * レコードのドラフトと元 DB スナップショットを比較して差分を計算する。
 *
 * @param draftRecords - モーダル内で編集中のレコード一覧 (id を持つ場合は編集)
 * @param originalIds - 元 DB に存在するレコード ID 一覧
 */
export function computeRecordDiff(
  draftRecords: Array<RecordFormDataInput & { id?: string }>,
  originalIds: string[],
): RecordDiff {
  const originalIdSet = new Set(originalIds);
  const toAdd: RecordFormDataInput[] = [];
  const toUpdate: Array<{ id: string; data: RecordFormDataInput }> = [];
  const draftIdSet = new Set<string>();

  for (const record of draftRecords) {
    if (!record.id || !isDbUuid(record.id)) {
      const { id: _id, ...data } = record;
      toAdd.push(data as RecordFormDataInput);
    } else {
      draftIdSet.add(record.id);
      if (originalIdSet.has(record.id)) {
        const { id, ...data } = record;
        toUpdate.push({ id, data: data as RecordFormDataInput });
      } else {
        const { id: _id, ...data } = record;
        toAdd.push(data as RecordFormDataInput);
      }
    }
  }

  const toDelete = originalIds.filter((id) => !draftIdSet.has(id));
  return { toAdd, toUpdate, toDelete };
}
