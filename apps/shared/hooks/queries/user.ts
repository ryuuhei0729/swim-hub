// =============================================================================
// ユーザー情報React Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { TeamMembershipWithUser, UserProfile } from '../../types/database'
import { teamKeys, userKeys } from './keys'
import { useTeamsQuery } from './teams'

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
  refetch: () => Promise<void>
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
    queryKey: userId ? userKeys.profile(userId) : userKeys.currentProfile(),
    queryFn: async () => {
      let targetUserId = userId
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        targetUserId = user.id
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, name, gender, birthday, profile_image_path, bio, google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions, created_at, updated_at')
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
              .select('id, name, gender, birthday, profile_image_path, bio, google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions, created_at, updated_at')
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

  // チーム情報取得クエリ（useTeamsQueryに委譲）
  // useTeamsQueryのenableRealtimeはteamIdが指定されている場合のみ動作するため、
  // useUserQueryではenableRealtimeをfalseにして、独自にリアルタイム購読を設定する
  const teamsQueryResult = useTeamsQuery(supabase, {
    initialTeams,
    enableRealtime: false, // useUserQueryで独自にリアルタイム購読を設定するため無効化
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
          // 具体的なIDが分かっているので、IDベースのキーとcurrentProfileキーの両方を無効化
          queryClient.invalidateQueries({
            queryKey: userKeys.profile(profileQuery.data!.id),
          })
          queryClient.invalidateQueries({
            queryKey: userKeys.currentProfile(),
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, profileQuery.data, queryClient, supabase])

  // リアルタイム購読（チームメンバーシップ更新）
  // useTeamsQueryのクエリキー（teamKeys.list()）を無効化してキャッシュを更新
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
          // useTeamsQueryのクエリキーを無効化
          queryClient.invalidateQueries({
            queryKey: teamKeys.list(),
          })
          // 具体的なIDが分かっているので、IDベースのキーとcurrentTeamsキーの両方を無効化
          if (userId) {
            queryClient.invalidateQueries({
              queryKey: userKeys.teams(userId),
            })
          } else {
            queryClient.invalidateQueries({
              queryKey: userKeys.currentTeams(),
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, profileQuery.data, userId, queryClient, supabase])

  return {
    profile: profileQuery.data ?? null,
    teams: teamsQueryResult.teams ?? [],
    isLoading: profileQuery.isLoading || teamsQueryResult.isLoading,
    isError: profileQuery.isError || teamsQueryResult.isError,
    error: profileQuery.error || teamsQueryResult.error || null,
    refetch: async () => {
      await Promise.allSettled([profileQuery.refetch(), teamsQueryResult.refetch?.()])
    },
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
    queryKey: userId ? userKeys.profile(userId) : userKeys.currentProfile(),
    queryFn: async () => {
      let targetUserId = userId
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        targetUserId = user.id
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, name, gender, birthday, profile_image_path, bio, google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions, created_at, updated_at')
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
              .select('id, name, gender, birthday, profile_image_path, bio, google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions, created_at, updated_at')
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

