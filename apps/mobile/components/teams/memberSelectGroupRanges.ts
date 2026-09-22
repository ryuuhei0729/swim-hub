// =============================================================================
// memberSelectGroupRanges.ts
// MemberSelectModal 用: TeamMemberGroupFilter.onGroupedMembersChange が返す
// groupHeaders (Map<number, string> = 「このインデックスから新しい見出しが始まる」) を
// [start, end) の半開区間配列へ変換する純関数。
//
// グループ内ミニ全選択トグルが対象範囲 (groupedMembers のどこからどこまでか) を
// 機械的に特定できるようにするための軽量な形。members 配列自体は呼び出し側が
// 保持しているので、ここでは添字の範囲だけを返す。
// =============================================================================

export interface MemberGroupRange {
  label: string;
  start: number;
  end: number;
}

/**
 * groupHeaders をキー昇順に並べ、隣接する見出しの開始位置を終端として
 * [start, end) の範囲配列を導出する。
 * Map はキーの挿入順で iterate されるため、Map.entries() をそのまま使わず
 * 明示的にキー昇順へソートしてから区切る。
 */
export function deriveMemberGroupRanges<T>(
  groupedMembers: T[],
  groupHeaders: Map<number, string>,
): MemberGroupRange[] {
  const sortedEntries = Array.from(groupHeaders.entries()).sort(([a], [b]) => a - b);

  return sortedEntries.map(([start, label], index) => {
    const nextEntry = sortedEntries[index + 1];
    const end = nextEntry ? nextEntry[0] : groupedMembers.length;
    return { label, start, end };
  });
}
