// =============================================================================
// 記録入力画面のエントリー初期反映 - 純粋関数
// =============================================================================
//
// 仕様 (Sprint Contract 由来):
//   - `entries.entry_time` は記録タイム (`records.time`) の初期値には絶対に使わない。
//     entry_time は「参考表示専用」のフィールドとして呼び出し側 (UI層) に渡すのみ。
//   - 既存記録を優先し、不足分だけエントリーから追加する。
//     `(user_id, style_id)` の組で重複排除し、既存記録がある組にはエントリー行を足さない。
//   - リレーとして検出済みの StyleEntry (`relayEventId` が truthy) には一切触れない
//     (読み取り専用の重複排除対象からも除外し、追加先候補にも絶対に選ばない)。
//   - `RecordInsert`/`RecordUpdate` はここでは import しない (records.time と
//     entries.entry_time の混同を型で防ぐ ../utils/entryDiff.ts と同じ規約)。
//   - このファイルは records 画面専用のロジックを持つ。entryDiff.ts (エントリー編集画面の
//     差分ロジック) には混ぜない。

import type { ExistingEntryRow } from "./entryDiff";

/** styles テーブルの必要フィールドのみ */
export interface StyleLookup {
  id: number;
  name_jp: string;
}

/**
 * records 画面へのマージ対象となるエントリー行。
 * `entryDiff.ts` の `ExistingEntryRow` (id, user_id, style_id, entry_time, note) に
 * 表示名 (`userName`) を加えたもの。records 専用の型なので別名で定義する。
 */
export interface EntryRowForRecordMerge extends ExistingEntryRow {
  userName: string;
}

/**
 * マージ判定に必要な既存 StyleEntry の最小形。
 * web/mobile それぞれの実際の StyleEntry 型 (`memberRecords`, `relayEventId` 等の
 * 追加フィールドを持つ) はこの形を構造的に満たすため、変換なしにそのまま渡せる。
 */
export interface ExistingStyleEntryForMerge {
  id: string;
  styleId: number | "";
  /** リレーとして検出済みなら truthy。true の StyleEntry は不可侵 (読み取り対象からも除外) */
  relayEventId?: unknown;
  memberRecords: { memberUserId: string }[];
}

/**
 * 記録入力画面に追加すべきエントリー行1件分の「追加計画」。
 * MemberRecord/StyleEntry オブジェクトの実際の構築 (id生成・videoFile 等の
 * プラットフォーム固有フィールドの初期化) は呼び出し側 (web/mobile の UI 層) に委ねる。
 */
export interface EntryAdditionPlan {
  /** 追加先の既存 StyleEntry の id。null なら同じ style_id の (リレーでない) StyleEntry が
   *  存在しないため、新規 StyleEntry を作る必要がある */
  targetStyleEntryId: string | null;
  styleId: number;
  styleName: string;
  entry: EntryRowForRecordMerge;
}

/**
 * `(user_id, style_id)` の組を一意に表すキーを作る。`planEntryAdditionsForRecords` の
 * 重複排除と `buildEntryTimeReferenceLookup` の参照マップの双方で同じキー形式を使うために
 * 公開する (呼び出し側が独自にキー形式を再実装して食い違うのを防ぐ)。
 */
export function userStylePairKey(userId: string, styleId: number): string {
  return `${userId}:${styleId}`;
}

/**
 * エントリー行のうち、記録入力画面の初期状態に追加すべき行を選定する純粋関数。
 *
 * - 既存記録を優先し、不足分だけエントリーから追加する (PM裁定: Planner の「既存記録が
 *   あればエントリーを完全に無視」案は不採用)。判定は `(user_id, style_id)` の組の重複排除
 * - リレーとして検出済みの StyleEntry (`relayEventId` が truthy) は、重複排除の材料にも
 *   追加先候補にも一切使わない (4レグ構造の破壊を防ぐ)
 * - `entries` 内で `(user_id, style_id)` が重複していても2重に追加しない
 * - `styleId === ""` (種目未選択のプレースホルダー行) は既存判定・追加先の対象外
 */
export function planEntryAdditionsForRecords(
  entries: EntryRowForRecordMerge[],
  existingStyleEntries: ExistingStyleEntryForMerge[],
  styles: StyleLookup[],
): EntryAdditionPlan[] {
  const styleNameById = new Map(styles.map((s) => [s.id, s.name_jp]));

  // 既存の (user_id, style_id) の組 + style_id ごとの追加先候補 id を集める。
  // リレー検出済みの StyleEntry (relayEventId が truthy) は両方から除外する = 不可侵。
  const existingPairs = new Set<string>();
  const nonRelayStyleEntryIdByStyleId = new Map<number, string>();

  for (const styleEntry of existingStyleEntries) {
    if (styleEntry.relayEventId) continue;
    if (styleEntry.styleId === "") continue;

    nonRelayStyleEntryIdByStyleId.set(styleEntry.styleId, styleEntry.id);
    for (const memberRecord of styleEntry.memberRecords) {
      existingPairs.add(userStylePairKey(memberRecord.memberUserId, styleEntry.styleId));
    }
  }

  const consumed = new Set<string>();
  const plans: EntryAdditionPlan[] = [];

  for (const entry of entries) {
    const key = userStylePairKey(entry.user_id, entry.style_id);
    if (existingPairs.has(key) || consumed.has(key)) continue;
    consumed.add(key);

    plans.push({
      targetStyleEntryId: nonRelayStyleEntryIdByStyleId.get(entry.style_id) ?? null,
      styleId: entry.style_id,
      styleName: styleNameById.get(entry.style_id) ?? "",
      entry,
    });
  }

  return plans;
}

/**
 * `(user_id, style_id)` → `entry_time` の参照マップを構築する純粋関数。
 *
 * 既存記録由来の行 (`planEntryAdditionsForRecords` では追加対象にならない行) にも
 * 参考表示 (`entryTimeReference`) を後付けするための材料。**行を増減させる
 * `planEntryAdditionsForRecords` の重複排除ロジックとは独立した関心**であり、
 * そちらのロジックには一切影響しない (呼び出し側で両方の結果を組み合わせて使う)。
 *
 * リレー除外・`styleId === ""` 除外は行わない (このマップ自体は単純な参照表とし、
 * 「どの行に貼るか」の判定 = リレー StyleEntry を除外する責務は呼び出し側の
 * スタンプ処理に委ねる。理由: リレー StyleEntry の `styleId` は先頭レグの style_id
 * であり、レグ単位の style_id とは意味が異なるため、ここで安易にキー突合すると
 * 誤ったスタンプにつながる)。
 */
export function buildEntryTimeReferenceLookup(
  entries: EntryRowForRecordMerge[],
): Map<string, number | null> {
  const lookup = new Map<string, number | null>();
  for (const entry of entries) {
    lookup.set(userStylePairKey(entry.user_id, entry.style_id), entry.entry_time);
  }
  return lookup;
}
