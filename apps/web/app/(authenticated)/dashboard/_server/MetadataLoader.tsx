// =============================================================================
// メタデータ取得用Server Component
// Styles、Tagsなどの静的メタデータをサーバー側で取得
// =============================================================================

import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { StyleAPI } from '@apps/shared/api/styles'
import type { Style, PracticeTag } from '@apps/shared/types'
import type { Database } from '@swim-hub/shared/types'

interface MetadataLoaderProps {
  children: (data: {
    styles: Style[]
    tags: PracticeTag[]
  }) => React.ReactNode
}

/**
 * Stylesデータを取得
 * Stylesは全ユーザー共通の静的データ
 *
 * 認証なしクライアントを使用：
 * - RLSポリシー「Everyone can view styles」により認証なしでも取得可能
 */
async function getStyles() {
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
      console.warn('[MetadataLoader] 種目データが空です')
    }
    return styles
  } catch (error) {
    console.error('[MetadataLoader] 種目取得エラー:', error)
    throw error
  }
}

/**
 * Tagsデータを取得
 * Tagsはユーザー固有で頻繁に変更される可能性があるため、
 * キャッシュは使用せず、通常の取得を行う
 */
async function getTags(supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>, userId: string) {
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
 * メタデータ（Styles、Tags）をサーバー側で取得するServer Component
 * Suspenseでラップして使用してください
 */
export default async function MetadataLoader({
  children
}: MetadataLoaderProps) {
  const user = await getServerUser()
  const supabase = await createAuthenticatedServerClient()

  let styles: Style[] = []
  let tags: PracticeTag[] = []

  try {
    // 並行取得でパフォーマンス最適化
    const [stylesResult, tagsResult] = await Promise.all([
      getStyles().catch((error) => {
        console.error('[MetadataLoader] Styles取得エラー:', {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
        return [] as Style[]
      }),
      user ? getTags(supabase, user.id) : Promise.resolve([] as PracticeTag[])
    ])
    styles = stylesResult
    tags = tagsResult
  } catch (error) {
    console.error('[MetadataLoader] メタデータの取得に失敗:', error)
    // エラー時は空配列を使用
    styles = []
    tags = []
  }

  return <>{children({ styles, tags })}</>
}

