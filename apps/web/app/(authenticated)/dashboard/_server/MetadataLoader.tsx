// =============================================================================
// メタデータ取得用Server Component
// Styles、Tagsなどの静的メタデータをサーバー側で取得
// =============================================================================

import React from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { StyleAPI } from '@apps/shared/api/styles'
import type { Style, PracticeTag } from '@apps/shared/types/database'
import type { Database } from '@/lib/supabase'

interface MetadataLoaderProps {
  children: (data: {
    styles: Style[]
    tags: PracticeTag[]
  }) => React.ReactNode
}

/**
 * Stylesデータをキャッシュ付きで取得
 * Stylesは全ユーザー共通の静的データなので、長時間キャッシュ可能
 * 認証不要のため、認証なしのクライアントを使用
 */
async function getCachedStyles() {
  return unstable_cache(
    async () => {
      // Stylesは認証不要なので、認証なしのクライアントを使用
      const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const styleAPI = new StyleAPI(supabase)
      return await styleAPI.getStyles()
    },
    ['dashboard-styles'], // キャッシュキー
    {
      revalidate: 3600, // 1時間キャッシュ
      tags: ['styles'] // タグベースの再検証用
    }
  )()
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

  try {
    // 並行取得でパフォーマンス最適化
    // Stylesはキャッシュ付き、Tagsは通常取得（ユーザー固有のため）
    const [styles, tags] = await Promise.all([
      getCachedStyles(),
      user ? getTags(supabase, user.id) : Promise.resolve([] as PracticeTag[])
    ])

    return <>{children({ styles, tags })}</>
  } catch (error) {
    console.error('メタデータの取得に失敗:', error)
    // エラー時は空配列を返す
    return <>{children({ styles: [], tags: [] })}</>
  }
}

