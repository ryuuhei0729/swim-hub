// =============================================================================
// メンバー一覧の年齢順ソート - Swim Hub共通パッケージ
//
// メンバーが並ぶ全画面（メンバータブ/グループ/大会・練習の代理入力の候補一覧 等）
// で共用する唯一の比較関数。画面ごとに `.sort(` を再実装しないこと。
// =============================================================================

export interface BirthdaySortableUser {
  name?: string | null;
  birthday?: string | null;
}

export interface BirthdaySortableMember {
  user_id: string;
  users?: BirthdaySortableUser | null;
}

/**
 * メンバーを年上順（生年月日の昇順＝古い日付が先）に並べる比較関数。
 *
 * - 生年月日が未設定 (null/undefined) のメンバーは、並び順の方向に関わらず常に末尾に置く。
 *   0 埋め等のフォールバックにはせず、有無を明示的な述語 (`hasBirthday`) で判定する。
 * - 生年月日が同じ場合は名前、さらに同名の場合は user_id まで比較し、
 *   実行のたびに順序が変わらないよう完全に決定的にする。
 * - birthday は "YYYY-MM-DD" または先頭10文字が "YYYY-MM-DD" の ISO 文字列
 *   (apps/web/utils/goalSetCalculator.ts の calculateAge と同じ前提) なので、
 *   先頭10文字の文字列比較で日付順になる。
 */
export function compareMembersByBirthday(
  a: BirthdaySortableMember,
  b: BirthdaySortableMember,
): number {
  const aBirthday = a.users?.birthday ?? null;
  const bBirthday = b.users?.birthday ?? null;
  const aHasBirthday = aBirthday !== null;
  const bHasBirthday = bBirthday !== null;

  if (aHasBirthday !== bHasBirthday) {
    return aHasBirthday ? -1 : 1;
  }
  if (aHasBirthday && bHasBirthday) {
    const aDay = aBirthday.slice(0, 10);
    const bDay = bBirthday.slice(0, 10);
    if (aDay !== bDay) return aDay < bDay ? -1 : 1;
  }

  const aName = a.users?.name ?? "";
  const bName = b.users?.name ?? "";
  if (aName !== bName) return aName < bName ? -1 : 1;

  if (a.user_id !== b.user_id) return a.user_id < b.user_id ? -1 : 1;
  return 0;
}
