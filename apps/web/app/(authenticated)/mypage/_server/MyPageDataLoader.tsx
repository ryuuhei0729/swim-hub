// =============================================================================
// マイページデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import MyPageClient from '../_client/MyPageClient'
import type { UserProfile } from '@apps/shared/types/database'

interface BestTime {
  id: string
  time: number
  created_at: string
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
}

interface UserProfileData {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  avatar_url?: string | null
  profile_image_path?: string | null
}

/**
 * ユーザープロフィールを取得
 */
async function getProfile(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<UserProfileData | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, birthday, bio, profile_image_path')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('プロフィール取得エラー:', error)
    return null
  }

  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    birthday: data.birthday,
    bio: data.bio,
    avatar_url: data.profile_image_path,
    profile_image_path: data.profile_image_path
  }
}

/**
 * ベストタイムを取得
 */
async function getBestTimes(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<BestTime[]> {
  const { data, error } = await supabase
    .from('records')
    .select(`
      id,
      time,
      created_at,
      styles!records_style_id_fkey (
        name_jp,
        distance
      ),
      competitions!records_competition_id_fkey (
        title,
        date
      )
    `)
    .eq('user_id', userId)
    .order('time', { ascending: true })

  if (error) {
    console.error('ベストタイム取得エラー:', error)
    return []
  }

  // 種目ごとのベストタイムを取得
  type RecordWithRelations = {
    id: string
    time: number
    created_at: string
    styles?: { name_jp: string; distance: number } | null
    competitions?: { title: string; date: string } | null
  }

  const bestTimesByStyle = new Map<string, BestTime>()

  if (data && Array.isArray(data)) {
    data.forEach((record) => {
      const styleKey = record.styles?.name_jp || 'Unknown'

      if (!bestTimesByStyle.has(styleKey) || record.time < bestTimesByStyle.get(styleKey)!.time) {
        bestTimesByStyle.set(styleKey, {
          id: record.id,
          time: record.time,
          created_at: record.created_at,
          style: {
            name_jp: record.styles?.name_jp || 'Unknown',
            distance: record.styles?.distance || 0
          },
          competition: record.competitions ? {
            title: record.competitions.title,
            date: record.competitions.date
          } : undefined
        })
      }
    })
  }

  return Array.from(bestTimesByStyle.values())
}

/**
 * すべてのマイページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function MyPageDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    return (
      <MyPageClient
        initialProfile={null}
        initialBestTimes={[]}
      />
    )
  }

  // すべてのデータ取得を並行実行（真の並列取得）
  const [profileResult, bestTimesResult] = await Promise.all([
    // プロフィール取得
    getProfile(supabase, user.id).catch((error) => {
      console.error('プロフィール取得エラー:', error)
      return null
    }),
    // ベストタイム取得
    getBestTimes(supabase, user.id).catch((error) => {
      console.error('ベストタイム取得エラー:', error)
      return [] as BestTime[]
    })
  ])

  return (
    <MyPageClient
      initialProfile={profileResult}
      initialBestTimes={bestTimesResult}
    />
  )
}

