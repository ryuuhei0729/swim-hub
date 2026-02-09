/**
 * Expo設定ファイル（動的）
 * 環境変数を読み込んで設定
 *
 * ローカル開発: dotenvx run -f .env.local -- expo start
 * EAS Build: EAS 環境変数から直接読み込み
 */

// app.jsonの基本設定を読み込む
const baseConfig = require('./app.json')

// 環境変数の確認（デバッグ用）
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const webApiUrl = process.env.EXPO_PUBLIC_WEB_API_URL

if (process.env.NODE_ENV === 'development') {
  console.log('app.config.js - 環境変数の確認:')
  console.log('EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : '未設定')
  console.log('EXPO_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '設定済み' : '未設定')
}

module.exports = {
  ...baseConfig.expo,
  // 環境変数をextraフィールドに設定（アプリ内でアクセス可能）
  extra: {
    ...baseConfig.expo.extra,
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
    googleWebClientId: googleWebClientId,
    webApiUrl: webApiUrl || 'https://swim-hub.app',
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT || 'development',
    // EASプロジェクトID
    eas: {
      projectId: 'fb40c5df-d4ba-4bb6-adea-41d49d34a6be',
    },
  },
}
