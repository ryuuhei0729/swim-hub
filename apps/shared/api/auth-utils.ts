// =============================================================================
// 認証・権限チェック共通ユーティリティ
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'

/**
 * 認証必須ガード
 * @throws {Error} 認証されていない場合
 */
export async function requireAuth(supabase: SupabaseClient): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('認証が必要です')
  return user.id
}

/**
 * チームメンバーシップ必須ガード
 * @param userId 指定がない場合は現在の認証ユーザーを使用
 * @throws {Error} メンバーシップがない場合
 */
export async function requireTeamMembership(
  supabase: SupabaseClient,
  teamId: string,
  userId?: string
): Promise<void> {
  const uid = userId ?? (await requireAuth(supabase))
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', uid)
    .eq('is_active', true)
    .single()
  if (!membership) throw new Error('チームへのアクセス権限がありません')
}

/**
 * チーム管理者権限必須ガード
 * @param userId 指定がない場合は現在の認証ユーザーを使用
 * @throws {Error} 管理者権限がない場合
 */
export async function requireTeamAdmin(
  supabase: SupabaseClient,
  teamId: string,
  userId?: string
): Promise<void> {
  const uid = userId ?? (await requireAuth(supabase))
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', uid)
    .eq('is_active', true)
    .eq('role', 'admin')
    .single()
  if (!membership) throw new Error('管理者権限が必要です')
}
