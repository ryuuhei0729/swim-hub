import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types'

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

// ブラウザ用のSupabaseクライアント（シングルトン）
// 重要: Browser Clientは1箇所だけに統一することで、PKCE code verifierが確実にCookieに保存・読み取りされる
// 環境変数を検証
const { url, anonKey } = (() => {
  try {
    return validateSupabaseEnv()
  } catch {
    // サーバー側（ビルド時）では環境変数が取得できない場合がある
    // その場合は後でエラーを投げる
    return { url: '', anonKey: '' }
  }
})()

// ローカル環境かどうかを判定する関数
function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

// ブラウザ環境でのみSupabaseクライアントを作成
// サーバー側（ビルド時）ではundefinedを返す
// Cookie設定は環境に応じて変更
// - ローカル開発（HTTP）: secure: false, sameSite: 'lax'
// - 本番（HTTPS）: secure: true, sameSite: 'lax'
// 重要: pathを明示的に設定することで、PKCE code verifierが確実にCookieに保存される
export const supabase: SupabaseClient<Database> | undefined = 
  typeof window !== 'undefined' 
    ? createBrowserClient<Database>(
        url || process.env.NEXT_PUBLIC_SUPABASE_URL!, 
        anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookieOptions: {
            sameSite: 'lax',
            secure: !isLocalEnvironment(), // ローカルはHTTP、本番はHTTPS
            path: '/', // すべてのパスでCookieが有効になるように設定
          },
        }
      )
    : undefined

// 後方互換性のため、createClient関数もエクスポート（supabaseを返す）
export const createClient = (): SupabaseClient<Database> => {
  if (typeof window === 'undefined') {
    throw new Error('createClient()はブラウザ環境でのみ使用できます')
  }
  if (!supabase) {
    throw new Error('Supabaseクライアントが初期化されていません')
  }
  return supabase
}
