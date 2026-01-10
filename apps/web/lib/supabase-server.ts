// =============================================================================
// サーバー側Supabaseクライアント
// =============================================================================

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types/database'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Supabase環境変数を検証
 * @throws {Error} 環境変数が設定されていない、または無効な場合
 */
function validateSupabaseEnv(): { url: string; anonKey: string } {
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

  return { url: supabaseUrl, anonKey: supabaseAnonKey }
}

/**
 * Supabase URLのみを検証
 * 管理者クライアント用に匿名キー不要で利用する
 */
function validateSupabaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL が設定されていません')
  }

  try {
    new URL(supabaseUrl)
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}" is not a valid URL`)
  }

  return supabaseUrl
}

/**
 * Cookie操作を記録するための型
 * @supabase/ssr の SetAllCookies 型に合わせる
 */
type CookieToSet = {
  name: string
  value: string
  options?: {
    domain?: string
    expires?: Date
    httpOnly?: boolean
    maxAge?: number
    path?: string
    sameSite?: boolean | 'lax' | 'strict' | 'none'
    secure?: boolean
  }
}

// 認証付きクライアントは supabase-server-auth.ts を参照
export { createAuthenticatedServerClient, getServerUser, getServerUserProfile } from './supabase-server-auth'

/**
 * サーバーコンポーネント用のSupabaseクライアント（認証情報付き）
 * 
 * @deprecated 新しいコードでは createAuthenticatedServerClient を使用してください
 * 後方互換性のため残しています
 */
export const createServerComponentClient = async (): Promise<SupabaseClient<Database>> => {
  const cookieStore = await cookies()
  const { url, anonKey } = validateSupabaseEnv()

  return createServerClient<Database>(
    url,
    anonKey,
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
          }
        },
      },
    }
  )
}

/**
 * API Route用のSupabaseクライアント（NextRequestからCookieを取得）
 * Cookie操作を記録し、NextResponseに適用できるようにする
 * 
 * @param request Next.jsのNextRequestオブジェクト
 * @param cookieStore オプション: next/headersのcookies()から取得したCookieストア
 * @returns 認証情報が設定されたSupabaseクライアントとCookie設定ヘルパー
 */
export function createRouteHandlerClient(
  request: NextRequest,
  cookieStore?: Awaited<ReturnType<typeof import('next/headers').cookies>>
): {
  client: SupabaseClient<Database>
  setCookiesOnResponse: (response: NextResponse) => void
} {
  // Cookie操作を記録する配列
  const cookiesToSet: CookieToSet[] = []
  const { url, anonKey } = validateSupabaseEnv()

  const client = createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          // 重要: Next.js 14+では、cookieStoreから明示的にCookieを読み込む
          // cookieStoreが提供されている場合は、それを優先的に使用
          // これにより、PKCE code verifierが確実に読み取られる
          if (cookieStore) {
            // cookieStoreからすべてのCookieを取得（遅延評価を回避）
            const cookieStoreCookies = cookieStore.getAll()
            // request.cookiesとマージ（request.cookiesにないCookieを追加）
            const requestCookies = request.cookies.getAll().map((cookie) => ({
              name: cookie.name,
              value: cookie.value || ''
            }))
            
            // cookieStoreを優先し、request.cookiesにないCookieを追加
            const cookieMap = new Map(cookieStoreCookies.map(c => [c.name, c.value]))
            requestCookies.forEach((cookie) => {
              if (!cookieMap.has(cookie.name)) {
                cookieMap.set(cookie.name, cookie.value)
              }
            })
            
            return Array.from(cookieMap.entries()).map(([name, value]) => ({
              name,
              value
            }))
          }
          
          // cookieStoreが提供されていない場合は、request.cookiesを使用
          return request.cookies.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value || ''
          }))
        },
        setAll(cookies: CookieToSet[]) {
          // Cookie設定操作を記録
          cookiesToSet.push(...cookies)
        },
      },
    }
  )

  /**
   * 記録されたCookie操作をNextResponseに適用
   * 
   * @param response NextResponseオブジェクト
   */
  const setCookiesOnResponse = (response: NextResponse) => {
    cookiesToSet.forEach((cookie) => {
      // Cookie設定（SameSite、Secure、Pathなどの属性を明示的に設定）
      // Supabaseのデフォルト設定に従い、SameSite: laxを使用
      // SameSite: laxは、トップレベルナビゲーション（OAuthリダイレクト）でCookieが送信される
      const cookieOptions = {
        ...cookie.options,
        // SameSite: laxを使用（Supabaseのデフォルト）
        sameSite: (cookie.options?.sameSite as 'lax' | 'strict' | 'none') || 'lax',
        // 開発環境ではsecureをfalseに、本番環境ではtrueに
        secure: cookie.options?.secure ?? (process.env.NODE_ENV === 'production'),
        // Pathを/に設定（すべてのパスで有効）
        path: cookie.options?.path || '/',
        // HttpOnlyはfalse（JavaScriptからアクセス可能にする必要がある場合がある）
        httpOnly: cookie.options?.httpOnly ?? false,
      }
      response.cookies.set(cookie.name, cookie.value, cookieOptions)
    })
  }

  return { client, setCookiesOnResponse }
}

/**
 * 管理者用クライアント（RLSをバイパスする場合）
 * Service Role Keyを使用するため、すべてのRLSポリシーをバイパスします
 * 
 * ⚠️ 注意: このクライアントは管理者操作のみに使用してください
 */
export const createAdminClient = (): SupabaseClient<Database> => {
  const url = validateSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません')
  }

  return createClient<Database>(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
