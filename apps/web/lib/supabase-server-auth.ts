// =============================================================================
// 認証付きサーバー側Supabaseクライアント
// Server Components用のSupabaseクライアント（@supabase/ssr使用）
// =============================================================================

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types/database'
import { cookies } from 'next/headers'

/**
 * 認証情報を含むサーバー側Supabaseクライアントを作成
 * Server Componentsで使用
 * 
 * @returns 認証情報が設定されたSupabaseクライアント
 */
export async function createAuthenticatedServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  // 環境変数の検証
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars: string[] = []
    if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    throw new Error(`Supabase環境変数が設定されていません: ${missingVars.join(', ')}`)
  }

  // URLの形式検証
  try {
    new URL(supabaseUrl)
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}" is not a valid URL`)
  }

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // サーバーコンポーネントではCookie設定ができない場合がある
            // これは正常な動作（読み取り専用コンテキスト）
          }
        },
      },
    }
  )
}

/**
 * サーバー側で認証済みユーザー情報を取得
 * 
 * @returns ユーザー情報、認証されていない場合はnull
 */
export async function getServerUser() {
  const supabase = await createAuthenticatedServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

/**
 * サーバー側でユーザープロフィールを取得
 * 
 * @param userId ユーザーID（省略時は現在のユーザー）
 * @returns ユーザープロフィール、取得できない場合はnull
 */
export async function getServerUserProfile(
  userId?: string
): Promise<Database['public']['Tables']['users']['Row'] | null> {
  const supabase = await createAuthenticatedServerClient()
  
  // userIdが指定されていない場合は現在のユーザーを取得
  if (!userId) {
    const user = await getServerUser()
    if (!user) return null
    userId = user.id
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    // ユーザーが存在しない場合はnullを返す（エラーにはしない）
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  return data
}

