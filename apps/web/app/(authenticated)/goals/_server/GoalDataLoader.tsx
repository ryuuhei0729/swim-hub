import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { GoalAPI } from '@apps/shared/api/goals'
import { RecordAPI } from '@apps/shared/api/records'
import { getCachedStyles } from '@/lib/data-loaders/common'
import type { Goal, Style, Competition } from '@apps/shared/types'
import GoalsClient from '../_client/GoalsClient'

/**
 * 目標管理ページのデータを並行取得するServer Component
 * Waterfall問題を完全に解消
 */
export default async function GoalDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    return (
      <GoalsClient
        initialGoals={[]}
        initialCompetitions={[]}
        styles={[]}
      />
    )
  }

  // すべてのデータ取得を並行実行（真の並列取得）
  const [stylesResult, goalsResult, competitionsResult] = await Promise.all([
    // Styles取得（キャッシュ付き、認証なしクライアントを使用 - 全ユーザー共通）
    getCachedStyles('goals-styles', 3600).catch((error) => {
      console.error('[GoalDataLoader] Styles取得エラー:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      return [] as Style[]
    }),
    // 大会目標取得（認証必要）
    (async () => {
      try {
        const goalAPI = new GoalAPI(supabase)
        return await goalAPI.getGoals()
      } catch (error) {
        console.error('大会目標取得エラー:', error)
        return [] as Goal[]
      }
    })(),
    // 大会一覧取得（competition情報表示用）
    (async () => {
      try {
        const recordAPI = new RecordAPI(supabase)
        return await recordAPI.getCompetitions()
      } catch (error) {
        console.error('大会一覧取得エラー:', error)
        return [] as Competition[]
      }
    })()
  ])

  return (
    <GoalsClient
      initialGoals={goalsResult}
      initialCompetitions={competitionsResult}
      styles={stylesResult}
    />
  )
}
