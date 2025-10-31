import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './supabase'

// サーバーコンポーネント用のSupabaseクライアント（Cookie使用）
export const createServerComponentClient = async () => {
  // NOTE: 一部のRouteではCookie連携が不要なため、標準クライアントを返す
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// 管理者用クライアント（RLSをバイパスする場合）
export const createAdminClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
