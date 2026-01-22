import { useState, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeamMember } from './useMembers'

/**
 * 承認待ちメンバーを管理するカスタムフック
 */
export const usePendingMembers = (
  teamId: string,
  isAdmin: boolean,
  supabase: SupabaseClient
) => {
  const [pendingMembers, setPendingMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPendingMembers = useCallback(async () => {
    if (!isAdmin) return

    try {
      setLoading(true)

      const { data, error: fetchError } = await supabase
        .from('team_memberships')
        .select(`
          id,
          user_id,
          role,
          is_active,
          status,
          joined_at,
          created_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path
          )
        `)
        .eq('team_id', teamId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setPendingMembers((data ?? []) as unknown as TeamMember[])
    } catch (err) {
      console.error('承認待ちメンバー情報の取得に失敗:', err)
      setError('承認待ちメンバー情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, isAdmin, supabase])

  const refresh = useCallback(() => {
    loadPendingMembers()
  }, [loadPendingMembers])

  return {
    pendingMembers,
    loading,
    error,
    loadPendingMembers,
    refresh
  }
}
