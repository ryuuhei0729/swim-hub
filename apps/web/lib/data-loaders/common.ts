// =============================================================================
// 共通データローダー関数
// 各ページで共通して使用するデータ取得パターンを抽象化
// =============================================================================

import { cache } from 'react'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { StyleAPI } from '@apps/shared/api/styles'
import type { PracticeTag, Style } from '@apps/shared/types'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types'

// ---------------------------------------------------------------------------
// Stylesインメモリキャッシュ（プロセスレベル）
// stylesは全ユーザー共通のマスターデータで変更頻度が極めて低いため、
// リクエストをまたいでキャッシュすることでDBアクセスを削減する。
// TTL: 1時間
// ---------------------------------------------------------------------------
let stylesCache: { data: Style[]; expiresAt: number } | null = null
const STYLES_TTL_MS = 60 * 60 * 1000 // 1時間

/**
 * Stylesデータを取得
 * 1. プロセスレベルのインメモリキャッシュ（TTL: 1時間、リクエスト間で共有）
 * 2. React.cache()（同一リクエスト内でのデデュプリケーション）
 *
 * Next.jsの戦略に従い、認証なしクライアントを使用：
 * - RLSポリシー「Everyone can view styles」により認証なしでも取得可能
 */
export const getStyles = cache(async (): Promise<Style[]> => {
  // インメモリキャッシュが有効ならそれを返す
  if (stylesCache && Date.now() < stylesCache.expiresAt) {
    return stylesCache.data
  }

  // 認証なしクライアントを使用
  // RLSポリシー「Everyone can view styles」により取得可能
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const styleAPI = new StyleAPI(supabase)
  try {
    const styles = await styleAPI.getStyles()
    // データが空の場合は警告を出力
    if (!styles || styles.length === 0) {
      console.warn('[getStyles] 種目データが空です')
    }
    // キャッシュに保存
    stylesCache = { data: styles, expiresAt: Date.now() + STYLES_TTL_MS }
    return styles
  } catch (error) {
    console.error('[getStyles] 種目取得エラー:', error)
    throw error
  }
})

/**
 * 後方互換性のためのエイリアス
 * @deprecated getStyles() を使用してください
 */
export async function getCachedStyles(
  _cacheKey?: string,
  _revalidate?: number
): Promise<Style[]> {
  return getStyles()
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

