import { createClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types'
import Constants from 'expo-constants'

// 環境変数からSupabase設定を取得
// app.config.jsのextraフィールドから読み込む（dotenvxで復号化済み）
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey

// デバッグ用: 環境変数の確認（開発環境のみ）
if (__DEV__) {
  console.log('Supabase環境変数の確認:')
  console.log('supabaseUrl (from Constants.expoConfig.extra):', supabaseUrl ? `${supabaseUrl.substring(0, 50)}...` : '未設定')
  console.log('supabaseAnonKey (from Constants.expoConfig.extra):', supabaseAnonKey ? '設定済み' : '未設定')
}

// 環境変数の検証（エラーをthrowせず、nullを返す）
let supabase: ReturnType<typeof createClient<Database>> | null = null

if (supabaseUrl && supabaseAnonKey) {
  try {
    // React Native用Supabaseクライアント
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  } catch (error) {
    console.error('Supabaseクライアントの初期化に失敗しました:', error)
  }
} else {
  console.error(
    'Supabase環境変数が設定されていません。\n' +
    'EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。\n' +
    `現在の設定状態:\n` +
    `EXPO_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'set' : 'unset'}\n` +
    `EXPO_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? 'set' : 'unset'}`
  )
}

export { supabase }
