'use client'
import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types/database'
import { getCurrentEnvConfig, getSupabaseConfig } from './env'

// 環境別のSupabase設定を取得
const { url: _supabaseUrl, anonKey: _supabaseAnonKey, environment: _environment } = getSupabaseConfig()
const _envConfig = getCurrentEnvConfig()

// 環境情報をログ出力（開発・ステージング環境のみ）
if (_envConfig.debug) {
  // デバッグログの出力
}

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

// ブラウザ用のSupabaseクライアント（クライアントコンポーネント用）
export const createClient = (): SupabaseClient<Database> => {
  const { url, anonKey } = validateSupabaseEnv()
  
  // デバッグ: 環境変数が正しく読み込まれているか確認（常に表示）
  if (typeof window !== 'undefined') {
    console.log('[Supabase Client] Creating client:', {
      url: url.substring(0, 30) + '...',
      anonKeySet: !!anonKey,
      anonKeyLength: anonKey?.length,
      anonKeyPrefix: anonKey ? anonKey.substring(0, 10) + '...' : 'undefined',
      envUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'not set',
      envKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'not set'
    })
  }
  
  // APIキーが設定されていない場合はエラーを投げる
  if (!anonKey) {
    const error = new Error('Supabase API key is not set')
    console.error('[Supabase Client] Error:', error)
    throw error
  }
  
  // createBrowserClientはクッキーストレージを自動的に使用
  // APIキーは自動的にリクエストヘッダーに含まれる
  const client = createBrowserClient<Database>(url, anonKey)
  
  // デバッグ: クライアントが正しく作成されたか確認
  if (typeof window !== 'undefined') {
    console.log('[Supabase Client] Client created:', {
      url: client.supabaseUrl,
      hasAuth: !!client.auth,
      // クライアントの内部状態を確認（デバッグ用）
      clientType: typeof client
    })
  }
  
  return client
}

// グローバルなSupabaseクライアント（必要な場合のみ）
// export const supabase = createClient(supabaseUrl, supabaseAnonKey)
