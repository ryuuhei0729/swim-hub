// =============================================================================
// サーバー側Supabaseクライアント
// =============================================================================

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import type { Database } from './supabase'

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
 * 
 * @param request Next.jsのNextRequestオブジェクト
 * @returns 認証情報が設定されたSupabaseクライアント
 */
export function createRouteHandlerClient(request: NextRequest): SupabaseClient<Database> {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set() {
          // API RouteではCookie設定は通常不要（認証フローでは自動処理）
        },
        remove() {
          // API RouteではCookie削除は通常不要
        },
      },
    }
  )
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
