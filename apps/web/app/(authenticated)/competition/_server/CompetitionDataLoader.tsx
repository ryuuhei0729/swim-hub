// =============================================================================
// 大会記録データローダー（React Query Hydrationパターン）
// =============================================================================

import React from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { RecordAPI } from '@apps/shared/api/records'
import { getStyles } from '@/lib/data-loaders/common'
import { createQueryClient } from '@apps/shared/lib/react-query'
import { recordKeys } from '@apps/shared/hooks/queries/keys'
import CompetitionClient from '../_client/CompetitionClient'
import type { Style } from '@apps/shared/types'

/**
 * すべての大会記録ページデータを並行取得するServer Component
 * HydrationBoundaryでReact Queryキャッシュに直接注入し、二重シリアライゼーションを回避
 */
export default async function CompetitionDataLoader() {
  const queryClient = createQueryClient()

  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  // すべてのデータ取得を並行実行
  const [stylesResult] = await Promise.all([
    // Styles取得（React.cache()によりデデュプリケーション済み）
    getStyles().catch((error) => {
      console.error('[CompetitionDataLoader] Styles取得エラー:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      return [] as Style[]
    }),
    // 大会記録をReact Queryキャッシュにprefetch
    // クライアント側のuseRecordsQueryと同じキー・パラメータに揃える
    user
      ? queryClient.prefetchQuery({
          queryKey: recordKeys.list({ startDate: undefined, endDate: undefined, styleId: undefined, page: 1, pageSize: 20 }),
          queryFn: async () => {
            const recordAPI = new RecordAPI(supabase)
            return await recordAPI.getRecords(undefined, undefined, undefined, 20, 0)
          },
        })
      : Promise.resolve()
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompetitionClient
        styles={stylesResult}
      />
    </HydrationBoundary>
  )
}
