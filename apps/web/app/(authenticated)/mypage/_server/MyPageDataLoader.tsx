// =============================================================================
// マイページデータローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import MyPageClient from '../_client/MyPageClient'

interface BestTime {
  id: string
  time: number
  created_at: string
  pool_type: number // 0: 短水路, 1: 長水路
  is_relaying: boolean
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string
    time: number
    created_at: string
    competition?: {
      title: string
      date: string
    }
  }
}

interface UserProfileData {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  avatar_url?: string | null
  profile_image_path?: string | null
  google_calendar_enabled?: boolean
  google_calendar_sync_practices?: boolean
  google_calendar_sync_competitions?: boolean
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
    .select('id, name, birthday, bio, profile_image_path, google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('プロフィール取得エラー:', error)
    return null
  }

  if (!data) return null

  const userData = data as {
    id: string
    name: string
    birthday: string | null
    bio: string | null
    profile_image_path: string | null
    google_calendar_enabled: boolean
    google_calendar_sync_practices: boolean
    google_calendar_sync_competitions: boolean
  }

  return {
    id: userData.id,
    name: userData.name,
    birthday: userData.birthday,
    bio: userData.bio,
    avatar_url: userData.profile_image_path,
    profile_image_path: userData.profile_image_path,
    google_calendar_enabled: userData.google_calendar_enabled,
    google_calendar_sync_practices: userData.google_calendar_sync_practices,
    google_calendar_sync_competitions: userData.google_calendar_sync_competitions
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
      pool_type,
      is_relaying,
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

  // 種目ごと、プール種別ごとのベストタイムを取得
  // キー: `${styleName}_${poolType}`
  type RecordWithRelations = {
    id: string
    time: number
    created_at: string
    pool_type: number
    is_relaying: boolean
    styles?: { name_jp: string; distance: number } | null
    competitions?: { title: string; date: string } | null
  }

  // 引き継ぎなしのベストタイム（種目、プール種別ごと）
  const bestTimesByStyleAndPool = new Map<string, BestTime>()
  // 引き継ぎありのベストタイム（種目、プール種別ごと）
  const relayingBestTimesByStyleAndPool = new Map<string, {
    id: string
    time: number
    created_at: string
    competition?: {
      title: string
      date: string
    }
  }>()

  if (data && Array.isArray(data)) {
    const records = data as RecordWithRelations[]
    records.forEach((record) => {
      const styleKey = record.styles?.name_jp || 'Unknown'
      const poolType = record.pool_type ?? 0
      const key = `${styleKey}_${poolType}`

      if (record.is_relaying) {
        // 引き継ぎありのタイム
        if (!relayingBestTimesByStyleAndPool.has(key) || 
            record.time < relayingBestTimesByStyleAndPool.get(key)!.time) {
          relayingBestTimesByStyleAndPool.set(key, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            competition: record.competitions ? {
              title: record.competitions.title,
              date: record.competitions.date
            } : undefined
          })
        }
      } else {
        // 引き継ぎなしのタイム
        if (!bestTimesByStyleAndPool.has(key) || 
            record.time < bestTimesByStyleAndPool.get(key)!.time) {
          bestTimesByStyleAndPool.set(key, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            pool_type: poolType,
            is_relaying: false,
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
      }
    })
  }

  // 引き継ぎなしのタイムに、引き継ぎありのタイムを紐付ける
  const result: BestTime[] = []
  bestTimesByStyleAndPool.forEach((bestTime, key) => {
    const relayingTime = relayingBestTimesByStyleAndPool.get(key)
    result.push({
      ...bestTime,
      relayingTime: relayingTime
    })
  })

  // 引き継ぎなしがなく、引き継ぎありのみの場合も追加
  relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
    if (!bestTimesByStyleAndPool.has(key)) {
      // キーから種目名とプール種別を取得
      const [styleName, poolTypeStr] = key.split('_')
      const poolType = parseInt(poolTypeStr, 10)
      
      // 種目情報を取得（最初のレコードから）
      const record = data?.find((r: RecordWithRelations) => 
        (r.styles?.name_jp || 'Unknown') === styleName && 
        (r.pool_type ?? 0) === poolType
      ) as RecordWithRelations | undefined

      if (record) {
        result.push({
          id: relayingTime.id,
          time: relayingTime.time,
          created_at: relayingTime.created_at,
          pool_type: poolType,
          is_relaying: true,
          style: {
            name_jp: record.styles?.name_jp || 'Unknown',
            distance: record.styles?.distance || 0
          },
          competition: relayingTime.competition
        })
      }
    }
  })

  return result
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

