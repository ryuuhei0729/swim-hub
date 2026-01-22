// =============================================================================
// チームユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'

/**
 * チームメンバーの基本情報
 * 注意: idフィールドはユーザーID（user_id）を表します。
 * team_membershipsテーブルのuser_idから取得されます。
 * membership_idではありません。
 */
export interface TeamMember {
  /** ユーザーID（team_memberships.user_idから取得） */
  id: string
  name: string
}

/**
 * Supabaseから取得したメンバーシップデータの型
 */
interface MemberData {
  user_id: string
  users: {
    id: string
    name: string
  } | null | Array<{ id: string; name: string }>
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
  teamId: string
): Promise<TeamMember[]> {
  const { data: membersData, error: membersError } = await supabase
    .from('team_memberships')
    .select(`
      user_id,
      users:users!team_memberships_user_id_fkey (
        id,
        name
      )
    `)
    .eq('team_id', teamId)
    .eq('status', 'approved')
    .eq('is_active', true)

  if (membersError) throw membersError

  const members = (membersData || [])
    .map((m: MemberData) => {
      // usersが配列の場合は最初の要素を取得、そうでなければそのまま使用
      const user = Array.isArray(m.users) ? m.users[0] : m.users
      return {
        id: m.user_id,
        name: user?.name || 'Unknown User'
      }
    })
    .filter((m: TeamMember) => m.name !== 'Unknown User')

  return members
}

