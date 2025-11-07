// =============================================================================
// サーバー側Supabaseクライアント
// =============================================================================

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from './supabase'

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

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
 * @returns 認証情報が設定されたSupabaseクライアントとCookie設定ヘルパー
 */
export function createRouteHandlerClient(request: NextRequest): {
  client: SupabaseClient<Database>
  setCookiesOnResponse: (response: NextResponse) => void
} {
  // Cookie操作を記録する配列
  const cookiesToSet: CookieToSet[] = []

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // リクエストからすべてのCookieを取得
          return request.cookies.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value
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
      // Cookie設定
      response.cookies.set(cookie.name, cookie.value, cookie.options)
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
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
