// =============================================================================
// エントリー代理一括入力 - 差分確認・DB書き込み境界の純粋関数
// =============================================================================
//
// 規約 (Sprint Contract 由来):
//   - UI 状態層は裸の `time` プロパティを持たず、`entryTimeInput` (文字列1本) の
//     みを保持する (EntryDraftRow)。ここでのみ数値化して DB 境界の型
//     (EntryInsert/EntryUpdate) に変換する。
//   - `toEntryInsert` / `toEntryUpdate` を関数の戻り値型として経由させることで
//     `{ time: ... }` のような誤記がコンパイルエラーになる。
//   - RecordInsert/RecordUpdate はここでは import しない (records.time と
//     entries.entry_time の混同を型で防ぐため)。

import type { EntryDraftRow } from "../types/team-entry";
import type { EntryInsert, EntryUpdate } from "../types/record";
import { parseTimeFlexible } from "./time";

// =============================================================================
// DB書き込み境界への変換
// =============================================================================

/** EntryDraftRow → EntryInsert (新規作成・upsert用) */
export function toEntryInsert(
  row: EntryDraftRow,
  competitionId: string,
  teamId: string,
): EntryInsert {
  return {
    team_id: teamId,
    competition_id: competitionId,
    user_id: row.targetUserId,
    style_id: row.styleId as number,
    entry_time: parseTimeFlexible(row.entryTimeInput),
    note: row.note.trim() === "" ? null : row.note,
    is_relaying: false, // リレー種目はスコープ外 (仕様#5)
  };
}

/** EntryDraftRow → EntryUpdate (既存行の更新パッチ) */
export function toEntryUpdate(row: EntryDraftRow): EntryUpdate {
  return {
    style_id: row.styleId as number,
    entry_time: parseTimeFlexible(row.entryTimeInput),
    note: row.note.trim() === "" ? null : row.note,
    is_relaying: false,
  };
}

// =============================================================================
// 差分確認ステップ (仕様#3: 新規/更新/削除/変更なしの4分類)
// =============================================================================

/** 既存 entries 行 (diff計算に必要な最小フィールドのみ) */
export interface ExistingEntryRow {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  note: string | null;
}

export interface EntryDiffResult {
  toCreate: EntryInsert[];
  toUpdate: Array<{ id: string; patch: EntryUpdate }>;
  /** 削除対象の entries.id (差分保存: 全置換ではなく削除された行のみ) */
  toDelete: string[];
  /** 変更なしの entries.id */
  unchanged: string[];
}

/**
 * 1行の分類 (新規/更新/変更なし) を判定する純粋関数。
 * `diffEntryRows` の内部判定と、確認モーダルの表示用分類の双方から使う
 * (ロジックの重複を避けるための共通化)。
 *
 * - `existingEntryId` が無い、または対応する既存行が見つからない → "new"
 * - (style_id, entry_time, note) のいずれかが既存行と異なる → "updated"
 * - どれも同じ → "unchanged"
 *
 * `row.styleId === ""` (種目未選択) の行を渡した場合の挙動は呼び出し側の責務。
 * この関数自体は種目未選択を特別扱いしない (呼び出し側で事前にフィルタすること)。
 */
export function classifyEntryRow(
  row: EntryDraftRow,
  existingById: Map<string, ExistingEntryRow>,
): "new" | "updated" | "unchanged" {
  if (!row.existingEntryId) return "new";

  const existingRow = existingById.get(row.existingEntryId);
  if (!existingRow) return "new"; // 防御的: スナップショットとの不整合

  const newEntryTime = parseTimeFlexible(row.entryTimeInput);
  const newNote = row.note.trim() === "" ? null : row.note;
  const newStyleId = row.styleId as number;

  const hasChanged =
    existingRow.style_id !== newStyleId ||
    existingRow.entry_time !== newEntryTime ||
    existingRow.note !== newNote;

  return hasChanged ? "updated" : "unchanged";
}

/**
 * 読み込み時点のスナップショット (existing) と現在のフォーム状態 (current) から、
 * 新規/更新/削除/変更なしの4分類を計算する純粋関数。
 *
 * - `current` の各行は `existingEntryId` の有無で新規/既存を判別する
 * - 既存側は (style_id, entry_time, note) を比較し、差分があれば `toUpdate`
 * - `styleId === ""` (種目未選択) の行は新規作成・更新の対象にはしない (create/update ループを
 *   素通りする)。**ただし、その行が既存行 (`existingEntryId` あり) だった場合は
 *   `matchedExistingIds` に加算されないため、`toDelete` に含まれる** — 「管理者が既存エントリーの
 *   種目選択を未選択に戻す」操作を削除意図として扱う仕様 (PM裁定)。呼び出し側 (確認モーダル等) は
 *   この関数の `toDelete` を唯一の真実として扱い、独自に削除判定を再実装しないこと
 *   (二重ロジック化すると本関数と食い違う恐れがある)。
 * - `existing` にあって `current` に対応する行が無いものも同様に `toDelete`
 * - 同時編集の楽観ロック (updated_at 比較) は Out of Scope
 */
export function diffEntryRows(
  existing: ExistingEntryRow[],
  current: EntryDraftRow[],
  competitionId: string,
  teamId: string,
): EntryDiffResult {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const matchedExistingIds = new Set<string>();

  const toCreate: EntryInsert[] = [];
  const toUpdate: Array<{ id: string; patch: EntryUpdate }> = [];
  const unchanged: string[] = [];

  for (const row of current) {
    if (row.styleId === "") continue; // 種目未選択は diff 対象外

    const kind = classifyEntryRow(row, existingById);

    if (row.existingEntryId && kind !== "new") {
      matchedExistingIds.add(row.existingEntryId);
    }

    if (kind === "new") {
      toCreate.push(toEntryInsert(row, competitionId, teamId));
    } else if (kind === "updated") {
      toUpdate.push({ id: row.existingEntryId as string, patch: toEntryUpdate(row) });
    } else {
      unchanged.push(row.existingEntryId as string);
    }
  }

  const toDelete = existing
    .filter((row) => !matchedExistingIds.has(row.id))
    .map((row) => row.id);

  return { toCreate, toUpdate, toDelete, unchanged };
}

// =============================================================================
// 削除と upsert/update の自然キー衝突検出 (W-3 → New Critical A 対応後: 保存前の
// 事前バリデーション専用。書き込み順序の制御には使わない)
// =============================================================================

/**
 * `diffEntryRows` の結果から、`toDelete` のうち `toCreate`/`toUpdate` の
 * 自然キー (user_id, style_id) と衝突するものを検出する純粋関数。
 *
 * **用途は「保存前の事前バリデーション」のみ。書き込み順序の制御には使わないこと。**
 * (旧実装は「衝突する削除を先に実行してから upsert/update する」という順序制御に
 * 使っていたが、これは「削除だけがコミットされた直後に upsert/update が別要因
 * (ネットワーク断・他行のエラー・RLSの一時的不整合等) で失敗すると、削除した行が
 * 復元されず選手のエントリーを完全に失う」というデータ損失窓を生む Critical に
 * つながった。PM裁定により、`conflicting` が非空の場合は **DB に1行も書き込む前に
 * 保存処理そのものを中止する** ガードとして使うことに変更する。)
 *
 * 呼び出し側は `conflicting` が非空なら保存を中止し、衝突している選手・種目を
 * 含む行動可能なエラーを表示すること (「先に削除だけを保存してから、種目の変更を
 * 保存してください」等)。`conflicting` が空の場合のみ、通常の安全な順序
 * (upsert/update を先、delete を後) で書き込みを実行してよい。
 *
 * `safe` (衝突しない削除) は参考情報として返すが、`conflicting` が空である前提の
 * 呼び出しでは `diff.toDelete` 全体をそのまま削除してよい (すなわち `safe` と
 * `diff.toDelete` は常に同じ集合になる)。
 */
export function partitionConflictingDeletes(
  diff: EntryDiffResult,
  existing: ExistingEntryRow[],
  current: EntryDraftRow[],
): { conflicting: string[]; safe: string[] } {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const currentByExistingId = new Map(
    current
      .filter((row): row is EntryDraftRow & { existingEntryId: string } => !!row.existingEntryId)
      .map((row) => [row.existingEntryId, row]),
  );

  const naturalKey = (userId: string, styleId: number): string => `${userId}:${styleId}`;

  const upsertKeys = new Set<string>();
  diff.toCreate.forEach((insert) => upsertKeys.add(naturalKey(insert.user_id, insert.style_id)));
  diff.toUpdate.forEach(({ id }) => {
    const row = currentByExistingId.get(id);
    if (row && row.styleId !== "") upsertKeys.add(naturalKey(row.targetUserId, row.styleId));
  });

  const conflicting: string[] = [];
  const safe: string[] = [];
  for (const deleteId of diff.toDelete) {
    const existingRow = existingById.get(deleteId);
    if (existingRow && upsertKeys.has(naturalKey(existingRow.user_id, existingRow.style_id))) {
      conflicting.push(deleteId);
    } else {
      safe.push(deleteId);
    }
  }

  return { conflicting, safe };
}

// =============================================================================
// 行重複検出 (仕様#11: 同一選手×同一種目の2行入力は即エラー)
// =============================================================================

/**
 * 既存 `CompetitionTabModal.tsx` の「Set サイズ比較」トリックを
 * `targetUserId:styleId` 複合キーに一般化する。
 * 種目未選択 (`styleId === ""`) の行は重複判定の対象外。
 *
 * @returns 重複しているキー ("userId:styleId") の集合
 */
export function findDuplicateMemberStylePairs(rows: EntryDraftRow[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    if (row.styleId === "") continue;
    const key = `${row.targetUserId}:${row.styleId}`;
    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

// =============================================================================
// プリフィル未編集判定 (仕様#4: ベストタイムのまま未編集の行を⚠️で明示)
// =============================================================================

/**
 * 種目選択時に自動プリフィルされたベストタイムを、管理者が一度も編集していないか判定する。
 */
export function isPrefillUntouched(row: EntryDraftRow): boolean {
  return (
    row.prefillSource === "bestTime" &&
    row.prefilledInput !== null &&
    row.entryTimeInput === row.prefilledInput
  );
}
