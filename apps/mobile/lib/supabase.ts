import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types/database'

// 環境変数からSupabase設定を取得
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// デバッグ用: 環境変数の確認（開発環境のみ）
if (__DEV__) {
  console.log('Supabase環境変数の確認:')
  console.log('EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl ? '設定済み' : '未設定')
  console.log('EXPO_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '設定済み' : '未設定')
}

// 環境変数の検証
if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage = 
    'Supabase環境変数が設定されていません。\n' +
    'EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。\n' +
    '.env.local ファイルを作成して設定を追加してください。\n\n' +
    `現在の設定状態:\n` +
    `EXPO_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'set' : 'unset'}\n` +
    `EXPO_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? 'set' : 'unset'}`
  
  console.error(errorMessage)
  throw new Error(errorMessage)
}

// React Native用Supabaseクライアント
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
