// =============================================================================
// チームユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { compareMembersByBirthday } from "./memberSort";

/**
 * チームメンバーの基本情報
 * 注意: idフィールドはユーザーID（user_id）を表します。
 * team_membershipsテーブルのuser_idから取得されます。
 * membership_idではありません。
 */
export interface TeamMember {
  /** ユーザーID（team_memberships.user_idから取得） */
  id: string;
  name: string;
  /** 年上順ソート用。未設定の場合あり。表示に使わない呼び出し元は無視してよい */
  birthday?: string | null;
}

/**
 * Supabaseから取得したメンバーシップデータの型
 */
interface MemberData {
  user_id: string;
  users:
    | {
        id: string;
        name: string;
        birthday?: string | null;
      }
    | null
    | Array<{ id: string; name: string; birthday?: string | null }>;
}

/**
 * チームメンバー一覧を取得し、正規化して返す
 *
 * @param supabase - Supabaseクライアント
 * @param teamId - チームID
 * @returns 正規化されたメンバー一覧（idとnameのみ）
 * @throws エラーが発生した場合は例外を投げる
 */
export async function fetchTeamMembers(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamMember[]> {
  const { data: membersData, error: membersError } = await supabase
    .from("team_memberships")
    .select(
      `
      user_id,
      users:users!team_memberships_user_id_fkey (
        id,
        name,
        birthday
      )
    `,
    )
    .eq("team_id", teamId)
    .eq("status", "approved")
    .eq("is_active", true);

  if (membersError) throw membersError;

  const members = (membersData || [])
    .map((m: MemberData) => {
      // usersが配列の場合は最初の要素を取得、そうでなければそのまま使用
      const user = Array.isArray(m.users) ? m.users[0] : m.users;
      return {
        id: m.user_id,
        name: user?.name || "Unknown User",
        birthday: user?.birthday ?? null,
      };
    })
    .filter((m: TeamMember) => m.name !== "Unknown User");

  // 年上順（生年月日昇順、未設定は末尾）。memberSort.ts が唯一の比較ロジック定義元。
  // TeamMember は user_id ではなく id を持つため、compareMembersByBirthday の
  // BirthdaySortableMember 形状に合わせて比較の瞬間だけ変換する
  return members.sort((a, b) =>
    compareMembersByBirthday(
      { user_id: a.id, users: { name: a.name, birthday: a.birthday } },
      { user_id: b.id, users: { name: b.name, birthday: b.birthday } },
    ),
  );
}
