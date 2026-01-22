import { useState, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TeamMember {
  id: string
  user_id: string
  role: 'admin' | 'user'
  status?: 'pending' | 'approved' | 'rejected'
  is_active: boolean
  joined_at: string
  created_at?: string
  users: {
    id: string
    name: string
    birthday?: string
    bio?: string
    profile_image_path?: string | null
  }
}

/**
 * 承認済みメンバーを管理するカスタムフック
 */
export const useMembers = (teamId: string, supabase: SupabaseClient) => {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('team_memberships')
        .select(`
          id,
          user_id,
          role,
          is_active,
          status,
          joined_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path
          )
        `)
        .eq('team_id', teamId)
        .eq('status', 'approved')
        .eq('is_active', true)
        .order('role', { ascending: false }) // adminを先に表示

      if (fetchError) throw fetchError
      setMembers((data ?? []) as unknown as TeamMember[])
    } catch (err) {
      console.error('メンバー情報の取得に失敗:', err)
      setError('メンバー情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  const refresh = useCallback(() => {
    loadMembers()
  }, [loadMembers])

  return {
    members,
    loading,
    error,
    loadMembers,
    refresh
  }
}
