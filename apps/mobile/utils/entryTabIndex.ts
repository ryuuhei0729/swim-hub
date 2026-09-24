/**
 * CompetitionTabFormScreen のエントリータブ (「項目1/項目2/+」の ItemTabs) を、
 * 指定した entries.id に対応する行がアクティブな状態で開くためのインデックス解決。
 *
 * Sprint Contract D9: 対応付けは entries.id で行う。style_id では引かない
 * (リレーはレグ別行のため同一 style が複数行に現れ、style_id では一意に決まらない)。
 * `teamRecordBulk.entryIdMisdetectionGuard.test.tsx` と同種の「id 取り違え」を
 * 避けるため、参照するのは各行が保持する実 DB id (`existingEntryId`) のみとし、
 * 文字列パターンや style による類推は行わない。
 *
 * フォールバック: targetEntryId が未指定、または該当する行が見つからない場合
 * (他端末での直前の削除等) は先頭タブ (index 0) を返す。
 */
export interface EntryTabIndexItem {
  existingEntryId?: string;
}

export function resolveInitialEntryTabIndex(
  items: readonly EntryTabIndexItem[],
  targetEntryId: string | null | undefined,
): number {
  if (!targetEntryId) return 0;
  const index = items.findIndex((item) => item.existingEntryId === targetEntryId);
  return index === -1 ? 0 : index;
}
