// =============================================================================
// 大会記録データローダー（すべてのデータを並行取得）
// =============================================================================

import React from 'react'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { RecordAPI } from '@apps/shared/api/records'
import { getCachedStyles } from '@/lib/data-loaders/common'
import CompetitionClient from '../_client/CompetitionClient'
import type { Style, RecordWithDetails } from '@apps/shared/types/database'

/**
 * 大会記録データを取得
 */
async function getRecords(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  _userId: string
): Promise<RecordWithDetails[]> {
  const recordAPI = new RecordAPI(supabase)
  return await recordAPI.getRecords()
}

/**
 * すべての大会記録ページデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function CompetitionDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, recordsResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証不要）
    getCachedStyles('competition-styles').catch((error) => {
      console.error('Styles取得エラー:', error)
      return [] as Style[]
    }),
    // 大会記録取得（認証必要）
    user
      ? getRecords(supabase, user.id).catch((error) => {
          console.error('大会記録取得エラー:', error)
          return [] as RecordWithDetails[]
        })
      : Promise.resolve([] as RecordWithDetails[])
  ])

  return (
    <CompetitionClient
      initialRecords={recordsResult}
      styles={stylesResult}
    />
  )
}

