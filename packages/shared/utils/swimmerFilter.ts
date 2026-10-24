// =============================================================================
// 非泳者フィルタ - Swim Hub共通パッケージ
//
// PM裁定 (Issue #49): 生の members 配列を各画面が個別にフィルタしてはならない
// (members は候補一覧だけでなく isAdmin 判定・既存行の名前解決にも共用されている)。
// フィルタは「候補提示の直前」だけで、この2関数を通して行う。
//
// 述語は「明示的に false のときだけ非泳者」。undefined/null は泳者として扱う
// (DB の DEFAULT true に追従できていない古いキャッシュ済みデータを誤って
// 非泳者扱いしないため)。
// =============================================================================

export interface SwimmerAware {
  is_swimmer?: boolean | null;
}

export function excludeNonSwimmers<T extends SwimmerAware>(members: readonly T[]): T[] {
  return members.filter((member) => member.is_swimmer !== false);
}

export function selectNonSwimmers<T extends SwimmerAware>(members: readonly T[]): T[] {
  return members.filter((member) => member.is_swimmer === false);
}

/**
 * groupHeaders (グルーピング前の並び全体でのインデックス → グループ名) を、
 * excludeNonSwimmers 後の並び (本体表示用) のインデックスに変換する。
 *
 * web (MembersTimeTable) / mobile (TeamMemberList) はいずれも「性別区分など
 * でのグルーピング」と「非泳者トグル」を両方持つ。groupHeaders は
 * 「グルーピング前の並び全体」に対して位置ベースで作られているため、
 * そこから非泳者を取り除くとインデックスがずれる。ずれたまま使うと
 * 見出しが無関係な行に付く、または (グループの先頭が非泳者だった場合に)
 * 見出しごと消える。
 *
 * グループの先頭が非泳者だった場合は、そのグループ内で最初に見つかった
 * 泳者の新しい位置に見出しを付け替える。グループ内が全員非泳者なら
 * 見出しごと消える (本体に該当グループの行が1つも残らないため)。
 *
 * 過去に web と mobile で別々にこのロジックを実装し、mobile 側が
 * 「除外されたメンバーは return で飛ばす」実装のためグループ先頭が
 * 非泳者だと見出しごと消えるバグを生んだ (Issue #49 Critical)。
 * 単一定義元として両プラットフォームから呼び出すこと。
 */
export function remapGroupHeadersForSwimmers<T extends SwimmerAware>(
  members: readonly T[],
  groupHeaders: Map<number, string> | undefined,
): Map<number, string> {
  if (!groupHeaders || groupHeaders.size === 0) return new Map();

  // prefixSwimmerCount[i] = members[0..i) に含まれる泳者の人数。
  // ループの反復 i の開始時点で配列の長さは常に i+1 (index 0..i が既に push 済み) であり、
  // 直後の for (j = start; j < end <= members.length) でも j は必ず 0..members.length-1
  // の範囲に収まるため、prefixSwimmerCount[j] は必ず定義済み
  // (④ 数学的に範囲が保証された添字。`!` は配列の push 回数 = members.length+1 で保証)。
  const prefixSwimmerCount: number[] = [0];
  for (let i = 0; i < members.length; i++) {
    prefixSwimmerCount.push(prefixSwimmerCount[i]! + (members[i]?.is_swimmer !== false ? 1 : 0));
  }

  const boundaries = [...groupHeaders.keys()].sort((a, b) => a - b);
  const remapped = new Map<number, string>();

  boundaries.forEach((start, i) => {
    const name = groupHeaders.get(start);
    if (name === undefined) return;
    // boundaries[i + 1] は最後の要素で undefined になりうる (配列の終端という
    // 正当な意味を持つフォールバックであり、値の衝突は起きない)。
    const end = boundaries[i + 1] ?? members.length;
    for (let j = start; j < end; j++) {
      if (members[j]?.is_swimmer !== false) {
        remapped.set(prefixSwimmerCount[j]!, name);
        break;
      }
    }
  });

  return remapped;
}
