// =============================================================================
// 共通データローダー関数
// 各ページで共通して使用するデータ取得パターンを抽象化
// =============================================================================

import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { StyleAPI } from '@apps/shared/api/styles'
import type { Style, PracticeTag } from '@apps/shared/types/database'
import type { Database } from '@/lib/supabase'

/**
 * Stylesデータをキャッシュ付きで取得
 * Stylesは全ユーザー共通の静的データなので、長時間キャッシュ可能
 * 
 * @param cacheKey - キャッシュキー（ページ固有のキーを指定）
 * @param revalidate - キャッシュの再検証時間（秒）、デフォルト: 3600（1時間）
 */
export async function getCachedStyles(
  cacheKey: string = 'styles',
  revalidate: number = 3600
): Promise<Style[]> {
  return unstable_cache(
    async () => {
      const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const styleAPI = new StyleAPI(supabase)
      return await styleAPI.getStyles()
    },
    [cacheKey],
    {
      revalidate,
      tags: ['styles']
    }
  )()
}

/**
 * Tagsデータを取得（ユーザー固有）
 * Tagsはユーザー固有で頻繁に変更される可能性があるため、キャッシュは使用しない
 * 
 * @param supabase - 認証済みSupabaseクライアント
 * @param userId - ユーザーID
 */
export async function getUserTags(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
): Promise<PracticeTag[]> {
  const { data, error } = await supabase
    .from('practice_tags')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (error) {
    console.error('Tags取得エラー:', error)
    return []
  }

  return (data || []) as PracticeTag[]
}

/**
 * チーム情報を取得
 * 
 * @param supabase - 認証済みSupabaseクライアント
 * @param userId - ユーザーID
 */
export async function getUserTeams(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from('team_memberships')
    .select(`
      *,
      team:teams (
        id,
        name,
        description
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) {
    console.error('チーム情報の取得に失敗:', error)
    return []
  }

  return (data || [])
}

