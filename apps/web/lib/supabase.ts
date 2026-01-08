'use client'
import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types/database'

// ブラウザ環境でSupabaseクライアントを管理（Hot Reload対応）
declare global {
  interface Window {
    __supabase_client__?: SupabaseClient<Database>
  }
}

/**
 * Supabase環境変数を検証（クライアント側）
 * @throws {Error} 環境変数が設定されていない、または無効な場合
 */
function validateSupabaseEnv(): { url: string; anonKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 環境変数が設定されていない、または空文字列の場合
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '') {
    const missingVars: string[] = []
    if (!supabaseUrl || supabaseUrl.trim() === '') missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseAnonKey || supabaseAnonKey.trim() === '') missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

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

// ブラウザ用のSupabaseクライアント（クライアントコンポーネント用）
export const createClient = (): SupabaseClient<Database> => {
  // 環境変数を検証
  const { url, anonKey } = validateSupabaseEnv()
  
  // 追加の検証：URLとキーが有効な文字列であることを確認
  if (typeof url !== 'string' || typeof anonKey !== 'string') {
    throw new Error(`Supabase環境変数の型が不正です: url=${typeof url}, anonKey=${typeof anonKey}`)
  }
  
  if (!url || url.trim() === '' || !anonKey || anonKey.trim() === '') {
    throw new Error(`Supabase環境変数が空です: url="${url}", anonKey="${anonKey ? '***' : ''}"`)
  }
  
  // createBrowserClientは自動的にCookieを使用してPKCE code verifierを保存
  // @supabase/ssrのcreateBrowserClientはデフォルトでCookieストレージを使用
  return createBrowserClient<Database>(url, anonKey)
}

// グローバルなSupabaseクライアント（必要な場合のみ）
// export const supabase = createClient(supabaseUrl, supabaseAnonKey)
