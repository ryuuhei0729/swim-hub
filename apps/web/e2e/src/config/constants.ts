/**
 * E2Eテスト用の定数定義
 * タイムアウト値、セレクタ、URL等を一元管理
 */

/**
 * タイムアウト値（ミリ秒）
 */
export const TIMEOUTS = {
  DEFAULT: 10000,              // デフォルトタイムアウト
  LONG: 30000,                  // 長いタイムアウト
  SHORT: 5000,                  // 短いタイムアウト
  MODAL_ANIMATION: 1000,        // モーダルアニメーション完了待ち
  SPA_RENDERING: 2000,          // SPAレンダリング完了待ち
  REDIRECT: 3000,               // リダイレクト完了待ち
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

