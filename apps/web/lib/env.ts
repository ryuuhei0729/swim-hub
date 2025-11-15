/**
 * 環境設定管理
 * 開発・ステージング・本番環境の切り分けを行う
 */

export type Environment = 'development' | 'preview' | 'production'

/**
 * 現在の環境を取得
 */
export function getEnvironment(): Environment {
  // Vercel環境変数を優先
  if (process.env.VERCEL_ENV === 'production') {
    return 'production'
  }
  if (process.env.VERCEL_ENV === 'preview') {
    return 'preview'
  }
  
  // Next.js環境変数をフォールバック
  if (process.env.NODE_ENV === 'production') {
    return 'production'
  }
  
  // 明示的な環境指定
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'preview') {
    return 'preview'
  }
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'production') {
    return 'production'
  }
  
  // デフォルトは開発環境
  return 'development'
}

/**
 * 環境別設定
 */
export const envConfig = {
  development: {
    name: '開発環境',
    supabaseProject: 'swimmer-dev',
    appUrl: 'http://localhost:3000',
    debug: true,
  },
  preview: {
    name: 'プレビュー環境', 
    supabaseProject: 'swimmer-dev', // 開発用DBを使用
    appUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://preview.example.com',
    debug: true,
  },
  production: {
    name: '本番環境',
    supabaseProject: 'swimmer-prod', // 本番用DBを使用
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app',
    debug: false,
  },
} as const

/**
 * 現在の環境設定を取得
 */
export function getCurrentEnvConfig() {
  const env = getEnvironment()
  return {
    environment: env,
    ...envConfig[env],
  }
}

/**
 * Supabase接続情報を取得
 */
export function getSupabaseConfig() {
  const env = getEnvironment()
  const config = envConfig[env]
  
  // 環境変数の検証
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  // 環境変数が設定されていない場合のデフォルト値を使用
  if (!supabaseUrl || !supabaseAnonKey) {
    // 開発環境またはビルド時にはプレースホルダーを使用
    if (env === 'development' || process.env.NODE_ENV === 'production') {
      console.warn(`Supabase環境変数が設定されていません。プレースホルダー値を使用します。(環境: ${env})`)
      return {
        url: supabaseUrl || 'https://placeholder.supabase.co',
        anonKey: supabaseAnonKey || 'placeholder-anon-key',
        serviceRoleKey: supabaseServiceRoleKey || 'placeholder-service-role-key',
        project: config.supabaseProject,
        environment: env,
      }
    }
    throw new Error(`Supabase設定が不足しています (環境: ${env})`)
  }
  
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
    project: config.supabaseProject,
    environment: env,
  }
}

/**
 * GraphQL エンドポイントを取得
 */
export function getGraphQLEndpoint() {
  const { url } = getSupabaseConfig()
  return process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || `${url}/functions/v1/graphql`
}

/**
 * 開発環境かどうかを判定
 */
export function isDevelopment() {
  return getEnvironment() === 'development'
}

/**
 * プレビュー環境かどうかを判定
 */
export function isPreview() {
  return getEnvironment() === 'preview'
}

/**
 * 本番環境かどうかを判定
 */
export function isProduction() {
  return getEnvironment() === 'production'
}

/**
 * デバッグモードかどうかを判定
 */
export function isDebugMode() {
  const config = getCurrentEnvConfig()
  return config.debug
}
