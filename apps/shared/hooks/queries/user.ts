// =============================================================================
// ユーザー情報React Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { TeamMembershipWithUser, UserProfile } from '../../types/database'
import { userKeys } from './keys'

export interface UseUserQueryOptions {
  userId?: string
  enableRealtime?: boolean
  initialProfile?: UserProfile | null
  initialTeams?: TeamMembershipWithUser[]
}

/**
 * 現在のログインユーザーの情報を取得（プロフィール + チーム情報）
 */
export function useUserQuery(
  supabase: SupabaseClient,
  options: UseUserQueryOptions = {}
): {
  profile: UserProfile | null
  teams: TeamMembershipWithUser[]
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  const {
    userId,
    enableRealtime = true,
    initialProfile,
    initialTeams = [],
  } = options

  const queryClient = useQueryClient()

  // プロフィール取得クエリ
  const profileQuery = useQuery({
    queryKey: userId ? userKeys.profile(userId) : userKeys.current(),
    queryFn: async () => {
      let targetUserId = userId
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        targetUserId = user.id
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', targetUserId)
        .single()

      if (error) {
        // ユーザーが存在しない場合（PGRST116エラー）、デフォルトプロフィールを作成
        if (error.code === 'PGRST116') {
          try {
            const userInsert = {
              id: targetUserId,
              name: 'ユーザー',
              gender: 0,
              bio: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }

            const { data: newProfile, error: createError } = await supabase
              .from('users')
              .insert(userInsert)
              .select()
              .single()

            if (createError) {
              console.error('Failed to create profile:', createError)
              return null
            }

            return newProfile as UserProfile
          } catch (createErr) {
            console.error('Error creating profile:', createErr)
            return null
          }
        }
        throw error
      }

      return data as UserProfile
    },
    enabled: true, // userIdがなくても現在のユーザーを取得
    initialData: initialProfile ?? undefined,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // チーム情報取得クエリ
  const teamsQuery = useQuery({
    queryKey: userId ? userKeys.teams(userId) : userKeys.current(),
    queryFn: async () => {
      let targetUserId = userId
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return []
        targetUserId = user.id
      }

      const { data, error } = await supabase
        .from('team_memberships')
        .select(`
          *,
          users:users (
            id,
            name,
            profile_image_path
          ),
          teams:teams (
            id,
            name,
            description,
            invite_code
          )
        `)
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .order('joined_at', { ascending: false })

      if (error) throw error
      return (data || []) as TeamMembershipWithUser[]
    },
    enabled: !!profileQuery.data || !!userId,
    initialData: initialTeams,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // リアルタイム購読（プロフィール更新）
  useEffect(() => {
    if (!enableRealtime || !profileQuery.data) return

    const channel = supabase
      .channel(`user-profile-${profileQuery.data.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${profileQuery.data.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: userKeys.profile(profileQuery.data!.id),
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, profileQuery.data, queryClient, supabase])

  // リアルタイム購読（チームメンバーシップ更新）
  useEffect(() => {
    if (!enableRealtime || !profileQuery.data) return

    const channel = supabase
      .channel(`user-teams-${profileQuery.data.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_memberships',
          filter: `user_id=eq.${profileQuery.data.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: userKeys.teams(profileQuery.data!.id),
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, profileQuery.data, queryClient, supabase])

  return {
    profile: profileQuery.data ?? null,
    teams: teamsQuery.data ?? [],
    isLoading: profileQuery.isLoading || teamsQuery.isLoading,
    isError: profileQuery.isError || teamsQuery.isError,
    error: profileQuery.error || teamsQuery.error,
  }
}

/**
 * ユーザープロフィールのみを取得
 */
export function useUserProfileQuery(
  supabase: SupabaseClient,
  userId?: string
): UseQueryResult<UserProfile | null, Error> {
  return useQuery({
    queryKey: userId ? userKeys.profile(userId) : userKeys.current(),
    queryFn: async () => {
      let targetUserId = userId
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        targetUserId = user.id
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', targetUserId)
        .single()

      if (error) {
        // ユーザーが存在しない場合（PGRST116エラー）、デフォルトプロフィールを作成
        if (error.code === 'PGRST116') {
          try {
            const userInsert = {
              id: targetUserId,
              name: 'ユーザー',
              gender: 0,
              bio: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }

            const { data: newProfile, error: createError } = await supabase
              .from('users')
              .insert(userInsert)
              .select()
              .single()

            if (createError) {
              console.error('Failed to create profile:', createError)
              return null
            }

            return newProfile as UserProfile
          } catch (createErr) {
            console.error('Error creating profile:', createErr)
            return null
          }
        }
        throw error
      }

      return data as UserProfile
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  })
}

