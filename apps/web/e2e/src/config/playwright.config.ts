import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'

type SupabaseEnv = {
  url: string
  anonKey: string
  serviceRoleKey: string
  graphqlUrl: string
}

/**
 * ローカル開発環境専用のSupabaseデフォルト設定
 * 注意: これらのキーはローカル開発環境（Supabase CLI）のデフォルト値です。
 * 本番環境やリモート環境では使用しないでください。
 */
const DEFAULT_LOCAL_SUPABASE: SupabaseEnv = {
  url: 'http://127.0.0.1:54321',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  serviceRoleKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  graphqlUrl: 'http://127.0.0.1:54321/graphql/v1',
}

const shouldUseLocalSupabase =
  process.env.E2E_SUPABASE_MODE === 'local' ||
  (process.env.CI !== 'true' && process.env.E2E_SUPABASE_MODE !== 'remote')

function getLocalSupabaseEnv(): SupabaseEnv | null {
  try {
    // __dirnameは apps/web/e2e/src/config なので、
    // リポジトリルート（supabase/ がある場所）に到達するには ../../../../.. が必要
    const result = execSync(
      'npx supabase status --workdir supabase -o json',
      {
        cwd: path.resolve(__dirname, '../../../../..'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    )
    const match = result.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return {
      url: parsed.API_URL ?? DEFAULT_LOCAL_SUPABASE.url,
      anonKey:
        parsed.ANON_KEY ??
        parsed.PUBLISHABLE_KEY ??
        DEFAULT_LOCAL_SUPABASE.anonKey,
      serviceRoleKey:
        parsed.SERVICE_ROLE_KEY ??
        parsed.SECRET_KEY ??
        DEFAULT_LOCAL_SUPABASE.serviceRoleKey,
      graphqlUrl:
        parsed.GRAPHQL_URL ??
        `${(parsed.API_URL ?? DEFAULT_LOCAL_SUPABASE.url).replace(/\/$/, '')}/graphql/v1`,
    }
  } catch (error) {
    console.warn(
      '[Playwright] ローカルSupabase環境の取得に失敗しました:',
      (error as Error).message
    )
    return null
  }
}

const localSupabaseEnv = shouldUseLocalSupabase
  ? { ...DEFAULT_LOCAL_SUPABASE, ...(getLocalSupabaseEnv() ?? {}) }
  : null

const supabaseEnvEntries = shouldUseLocalSupabase && localSupabaseEnv
  ? {
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseEnv.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: localSupabaseEnv.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: localSupabaseEnv.serviceRoleKey,
      NEXT_PUBLIC_GRAPHQL_ENDPOINT: localSupabaseEnv.graphqlUrl,
    }
  : {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_GRAPHQL_ENDPOINT: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT,
    }

const sanitizedSupabaseEnv = Object.fromEntries(
  Object.entries(supabaseEnvEntries).filter(
    ([, value]) => typeof value === 'string' && value.length > 0
  )
) as Record<string, string>

if (shouldUseLocalSupabase) {
  for (const [key, value] of Object.entries(sanitizedSupabaseEnv)) {
    process.env[key] = value
  }
  process.env.PLAYWRIGHT_SUPABASE_MODE = 'local'
}

/**
 * Playwright設定ファイル
 * 水泳管理システムのE2Eテスト設定
 */
export default defineConfig({
  // テストディレクトリ（このファイルからの相対パス）
  testDir: '../tests',
  
  // CI環境でのみforbidOnly有効
  forbidOnly: !!process.env.CI,
  
  // CI環境でのリトライ設定（1回に削減）
  retries: process.env.CI ? 1 : 0,
  
  // ワーカー数設定（並列実行で高速化）
  workers: process.env.CI ? 4 : undefined,
  
  // レポート設定（コンソール出力のみ）
  reporter: [
    ['list']
  ],
  
  // 共通設定
  use: {
    // ベースURL（開発サーバー）
    baseURL: 'http://localhost:3000',
    
    // スクリーンショット設定
    screenshot: 'only-on-failure',
    
    // ビデオ録画設定（必要な場合はCLIの--videoオプションで有効化）
    video: 'off',
    
    // トレース設定
    trace: 'on-first-retry',
    
    // ロケール設定（日本語）
    locale: 'ja-JP',
    
    // タイムゾーン設定
    timezoneId: 'Asia/Tokyo',
    
    // デフォルトタイムアウト（短縮して高速化）
    actionTimeout: 5 * 1000,
    navigationTimeout: 15 * 1000,
  },
  
  // プロジェクト設定
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 開発サーバー設定
  webServer: {
    command: process.env.CI
      ? 'npm run build && npm run start -- --port=3000'
      : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // ビルドタイムアウトを短縮
    env: {
      ...(process.env.CI ? {} : { NEXT_DISABLE_TURBOPACK: '1' }),
      ...sanitizedSupabaseEnv,
    },
  },
  
  // グローバル設定
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  // 出力ディレクトリ（無効化）
  // outputDir: 'test-results/',
  
  // 失敗時の最大ログ
  maxFailures: process.env.CI ? 10 : undefined,

  // 期待値設定
  expect: {
    // アサーションタイムアウト（短縮して高速化）
    timeout: 5 * 1000,
    
    // スクリーンショット比較のしきい値
    toHaveScreenshot: { threshold: 0.3 },
    toMatchSnapshot: { threshold: 0.3 },
  },
})
