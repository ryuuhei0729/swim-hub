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

// =============================================================================
// 入力の有無 (削除確認・タイム必須の判定)
// =============================================================================

/** hasRecordInputBesidesTime / hasRecordInput が見るレコード行の部分集合 */
export interface RecordRowForInputCheck {
  existingRecordId?: string;
  time: number;
  timeDisplayValue?: string;
  note: string;
  reactionTime: string;
  splitTimes: Array<{ distance: number | string; splitTime: number }>;
  videoPath?: string | null;
  pendingVideo?: unknown;
}

/**
 * タイム以外に、保存されずに消えると困る入力 (または既存 DB 行) があるかを判定する。
 * タイムが空のレコードは prepareSubmitData で除外されるため、これが true なのにタイムが
 * 空なら保存を止める (黙って捨てる・既存行を消すのを防ぐ)。mobile の同名関数と同じ規則。
 *
 * 種目と isRelaying は数えない: 種目は既定値が自動セットされ、エントリーから自動生成される
 * 行も種目とリレー区分だけを持つため、これを数えると未入力の行で保存できなくなる。
 * 種目距離と同じ距離のスプリット (ゴール地点) も数えない: タイムから自動生成・表示用に
 * 補完される写しで保存されないため。
 *
 * @param raceDistance 選択中の種目の距離。未選択なら undefined
 */
export function hasRecordInputBesidesTime(
  record: RecordRowForInputCheck,
  raceDistance: number | undefined,
): boolean {
  if (record.existingRecordId) return true;
  if (record.note.trim() !== "") return true;
  if (record.reactionTime.trim() !== "") return true;
  if (record.videoPath) return true;
  if (record.pendingVideo) return true;
  return record.splitTimes.some(
    (st) => st.splitTime > 0 && Number(st.distance) !== raceDistance,
  );
}

/** レコード行に何かしらの入力 (タイムを含む) があるか。× で削除する前の確認要否に使う */
export function hasRecordInput(
  record: RecordRowForInputCheck,
  raceDistance: number | undefined,
): boolean {
  if (record.time > 0) return true;
  if ((record.timeDisplayValue ?? "").trim() !== "") return true;
  return hasRecordInputBesidesTime(record, raceDistance);
}

/** hasPracticeMenuData が見る練習メニューの部分集合 */
export interface PracticeMenuForDataCheck {
  id: string;
  times: unknown[];
  note: string;
  tags: unknown[];
  videoPath?: string | null;
}

/**
 * 練習メニューに、消えると入力し直しになるデータ (既存 DB ログ・タイム・メモ・タグ・動画)
 * があるか。× で削除する前の確認要否に使う。
 * 既存ログ (id が DB UUID = computePracticeLogDiff と同じ既存判定規約) は保存時に DB から
 * 削除されるので中身に関わらず数える。種目・距離・本数などの設定値は数えない。
 */
export function hasPracticeMenuData(
  menu: PracticeMenuForDataCheck,
  hasPendingVideo: boolean,
): boolean {
  return (
    isDbUuid(menu.id) ||
    menu.times.length > 0 ||
    menu.note.trim() !== "" ||
    menu.tags.length > 0 ||
    !!menu.videoPath ||
    hasPendingVideo
  );
}
