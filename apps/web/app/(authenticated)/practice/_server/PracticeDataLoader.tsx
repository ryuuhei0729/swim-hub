// =============================================================================
// 練習記録データローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { PracticeAPI } from '@apps/shared/api/practices'
import { getCachedStyles, getUserTags } from '@/lib/data-loaders/common'
import PracticeClient from '../_client/PracticeClient'
import type { Style, PracticeTag, PracticeWithLogs } from '@apps/shared/types/database'

/**
 * 練習記録データを取得（過去1年分）
 */
async function getPractices(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<PracticeWithLogs[]> {
  const practiceAPI = new PracticeAPI(supabase)
  
  // 過去1年分を取得（usePracticesフックと同じロジック）
  const end = new Date().toISOString().split('T')[0]
  const start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  return await practiceAPI.getPractices(start, end)
}

/**
 * すべての練習記録ページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function PracticeDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, tagsResult, practicesResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証不要）
    getCachedStyles('practice-styles').catch((error) => {
      console.error('Styles取得エラー:', error)
      return [] as Style[]
    }),
    // Tags取得（ユーザー固有、認証必要）
    user
      ? getUserTags(supabase, user.id).catch((error) => {
          console.error('Tags取得エラー:', error)
          return [] as PracticeTag[]
        })
      : Promise.resolve([] as PracticeTag[]),
    // 練習記録取得（認証必要）
    user
      ? getPractices(supabase, user.id).catch((error) => {
          console.error('練習記録取得エラー:', error)
          return [] as PracticeWithLogs[]
        })
      : Promise.resolve([] as PracticeWithLogs[])
  ])

  return (
    <PracticeClient
      initialPractices={practicesResult}
      styles={stylesResult}
      tags={tagsResult}
    />
  )
}

