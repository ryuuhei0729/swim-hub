/**
 * E2Eテスト用の設定ファイル
 * 定数、環境変数、URL等を一元管理
 */
import * as dotenv from 'dotenv'
import path from 'node:path'

// .envファイルを読み込む（相対パスで解決）
// process.cwd()はapps/webディレクトリなので、直接.env.local/.envを参照
const envLocalPath = path.resolve(process.cwd(), '.env.local')
const envPath = path.resolve(process.cwd(), '.env')

dotenv.config({ path: envLocalPath })
dotenv.config({ path: envPath })

/**
 * タイムアウト値（ミリ秒）
 */
export const TIMEOUTS = {
  DEFAULT: 10000,              // デフォルトタイムアウト
  LONG: 20000,                 // 長いタイムアウト
  SHORT: 3000,                 // 短いタイムアウト
  MODAL_ANIMATION: 1000,       // モーダルアニメーション完了待ち
  SPA_RENDERING: 2000,         // SPAレンダリング完了待ち（Supabaseデータ取得を含む）
  REDIRECT: 3000,              // リダイレクト完了待ち
} as const

/**
 * 共通セレクタ（複数ページで使用されるもの）
 * data-testidが存在する場合は優先して使用
 * 存在しない場合はCSSセレクタ + :has-text() / :text-is() を使用
 */
export const SELECTORS = {
  // モーダル
  MODAL: '[role="dialog"]',
  
  // ボタン
  SUBMIT_BUTTON: 'button[type="submit"]',
  
  // エラーメッセージ
  ERROR_ALERT: '.bg-red-50, .text-red-700',
  SUCCESS_ALERT: '.bg-green-50, .text-green-700',
} as const

/**
 * URLパス
 */
export const URLS = {
  LOGIN: '/login',
  SIGNUP: '/signup',
  DASHBOARD: '/dashboard',
  PRACTICE: '/practice',
  RECORD: '/record',
  MYPAGE: '/mypage',
  TEAMS: '/teams',
  SETTINGS: '/settings',
} as const

/**
 * テスト環境の設定
 */
export interface TestEnvironment {
  baseUrl: string
  credentials: {
    email: string
    password: string
  }
}

/**
 * 環境設定クラス
 */
export class EnvConfig {
  /**
   * テスト環境の設定を取得
   * 必要な環境変数が設定されていない場合はエラーを投げる
   */
  static getTestEnvironment(): TestEnvironment {
    // E2E_BASE_URLを取得（後方互換性のためPLAYWRIGHT_BASE_URLとBASE_URLもサポート）
    const baseUrl = 
      process.env.E2E_BASE_URL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.BASE_URL

    if (!baseUrl) {
      throw new Error(
        '必要な環境変数が設定されていません。\n' +
        'E2E_BASE_URL を設定してください。\n' +
        '例: apps/web/.env.local に以下を追加:\n' +
        'E2E_BASE_URL=http://localhost:3000'
      )
    }
    
    // E2E_EMAILとE2E_PASSWORDを優先し、後方互換性のためE2E_TEST_EMAILとE2E_TEST_PASSWORDもサポート
    const email = process.env.E2E_EMAIL || process.env.E2E_TEST_EMAIL
    const password = process.env.E2E_PASSWORD || process.env.E2E_TEST_PASSWORD

    if (!email || !password) {
      throw new Error(
        '必要な環境変数が設定されていません。\n' +
        'E2E_EMAIL と E2E_PASSWORD を設定してください。\n' +
        '（後方互換性のため E2E_TEST_EMAIL と E2E_TEST_PASSWORD もサポートしています）\n' +
        '例: apps/web/.env.local に以下を追加:\n' +
        'E2E_EMAIL=test@example.com\n' +
        'E2E_PASSWORD=testpassword123'
      )
    }

    return {
      baseUrl,
      credentials: { email, password }
    }
  }
}

