/**
 * チーム大会エントリー一覧 (TeamCompetitionEntryModal) の行単位で、
 * 編集/削除アイコンを表示してよいかを判定する純関数。
 *
 * Sprint Contract PM 裁定 R1: 判定は生の entry_status ではなく、大会日が過去かどうかを
 * 織り込んだ実効ステータス (`@apps/shared/utils/entryStatus` の `resolveEntryStatus` の
 * 戻り値) が "open" のときのみ許可する。呼び出し側は必ず resolveEntryStatus を通した値を
 * effectiveEntryStatus に渡すこと (このモーダルではその値をローカル state `status` として
 * 既に保持している)。
 *
 * R2: この判定はエントリー1行ごとに行う。リレーであっても他選手のレグ行に影響しない。
 * R3/SC8: isAdmin では分岐しない。admin 自身のエントリー行も currentUserId 一致で許可される。
 */
import type { EntryStatus } from "@apps/shared/utils/entryStatus";

export function canEditOrDeleteEntryRow(
  entryUserId: string,
  currentUserId: string | null | undefined,
  effectiveEntryStatus: EntryStatus,
): boolean {
  if (!currentUserId) return false;
  if (entryUserId !== currentUserId) return false;
  return effectiveEntryStatus === "open";
}
