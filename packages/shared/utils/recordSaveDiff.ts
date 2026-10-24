// =============================================================================
// 記録保存の行単位 diff (純粋関数) - Swim Hub共通パッケージ
// =============================================================================
//
// チーム大会記録の代理入力画面 (web/mobile) が種目単位保存 (upsert 化) するために
// 使う。既存の「全削除 → 全 insert」を廃止し、行ごとに INSERT / UPDATE / DELETE を
// 振り分けるための唯一の定義元。web (RecordClient.tsx) と mobile
// (teamRecordBulk/saveStyleRecords.ts) の両方がこれを import する。
// シグネチャを変更する場合は両方の呼び出し元を確認すること。
//
// 判定は **`existingRecordIds` への membership のみ** で行う。文字列パターンや
// prefix での推測は禁止 (PM確定): `MemberRecord.id` は既存記録由来なら
// `records.id`、エントリー由来の新規行なら `entries.id`、新規追加行なら
// `genId()`/`crypto.randomUUID()` の生成値で、文字列を見ても区別がつかない。
// =============================================================================

export interface RecordSaveDiff<T> {
  toInsert: T[];
  toUpdate: T[];
  toDeleteIds: string[];
}

/**
 * 既存レコード id の集合と、現在フォームが持っている行から
 * INSERT / UPDATE / DELETE を振り分ける。
 *
 * - `currentRows` の各行は `getRowId` の戻り値が `existingRecordIds` に
 *   含まれていれば UPDATE 対象、含まれていなければ INSERT 対象
 * - `existingRecordIds` のうち `currentRows` のどの行の id にも一致しないものは
 *   「フォームから削除された既存行」として DELETE 対象 (`toDeleteIds`)
 *
 * `existingRecordIds` は呼び出し側が**保存対象のスコープ (種目・リレー種目単位)
 * に絞り込んで**渡すこと。大会全体の records.id 集合をそのまま渡すと、
 * 他種目の既存行が `currentRows` に存在しないため誤って `toDeleteIds` に
 * 混入する (削除スコープが種目を越えて広がる)。
 */
export function computeRecordSaveDiff<T>(
  existingRecordIds: ReadonlySet<string>,
  currentRows: readonly T[],
  getRowId: (row: T) => string,
): RecordSaveDiff<T> {
  const toInsert: T[] = [];
  const toUpdate: T[] = [];
  const currentIds = new Set<string>();

  for (const row of currentRows) {
    const id = getRowId(row);
    currentIds.add(id);
    if (existingRecordIds.has(id)) {
      toUpdate.push(row);
    } else {
      toInsert.push(row);
    }
  }

  const toDeleteIds = Array.from(existingRecordIds).filter((id) => !currentIds.has(id));

  return { toInsert, toUpdate, toDeleteIds };
}
