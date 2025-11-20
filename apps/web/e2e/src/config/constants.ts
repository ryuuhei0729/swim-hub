/**
 * E2Eテスト用の定数定義
 * タイムアウト値、セレクタ、URL等を一元管理
 */

/**
 * タイムアウト値（ミリ秒）
 */
export const TIMEOUTS = {
  DEFAULT: 5000,               // デフォルトタイムアウト（短縮）
  LONG: 15000,                 // 長いタイムアウト（短縮）
  SHORT: 2000,                 // 短いタイムアウト（短縮）
  MODAL_ANIMATION: 500,        // モーダルアニメーション完了待ち（短縮）
  SPA_RENDERING: 500,          // SPAレンダリング完了待ち（短縮）
  REDIRECT: 2000,              // リダイレクト完了待ち（短縮）
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

