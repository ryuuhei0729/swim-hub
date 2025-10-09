import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright設定ファイル
 * 水泳管理システムのE2Eテスト設定
 */
export default defineConfig({
  // テストディレクトリ
  testDir: './e2e',
  
  // 並列実行設定
  fullyParallel: true,
  
  // CI環境でのみforbidOnly有効
  forbidOnly: !!process.env.CI,
  
  // CI環境でのリトライ設定
  retries: process.env.CI ? 2 : 0,
  
  // ワーカー数設定
  workers: process.env.CI ? 1 : undefined,
  
  // レポート設定
  reporter: [
    ['html', { outputFolder: 'e2e/playwright-report' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list']
  ],
  
  // 共通設定
  use: {
    // ベースURL（開発サーバー）
    baseURL: 'http://localhost:3000',
    
    // スクリーンショット設定
    screenshot: 'only-on-failure',
    
    // ビデオ録画設定
    video: 'retain-on-failure',
    
    // トレース設定
    trace: 'on-first-retry',
    
    // ロケール設定（日本語）
    locale: 'ja-JP',
    
    // タイムゾーン設定
    timezoneId: 'Asia/Tokyo',
    
    // デフォルトタイムアウト
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
  },

  // プロジェクト設定（ブラウザ別）
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    // モバイルテスト
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // 開発サーバー設定
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  
  // グローバル設定
  globalSetup: './e2e/utils/global-setup.ts',
  globalTeardown: './e2e/utils/global-teardown.ts',

  // 出力ディレクトリ
  outputDir: 'test-results/',
  
  // 失敗時の最大ログ
  maxFailures: process.env.CI ? 10 : undefined,

  // 期待値設定
  expect: {
    // アサーションタイムアウト
    timeout: 10 * 1000,
    
    // スクリーンショット比較のしきい値
    toHaveScreenshot: { threshold: 0.3 },
    toMatchSnapshot: { threshold: 0.3 },
  },
})
