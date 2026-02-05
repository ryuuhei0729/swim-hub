// =============================================================================
// Google Calendar API連携
// =============================================================================

import type { Competition, Practice } from '../types'

// グローバル変数でWeb API URLを設定可能にする（React Native用）
declare global {
  // eslint-disable-next-line no-var
  var __SWIM_HUB_WEB_API_URL__: string | undefined
}

/**
 * Web API URLを取得
 * React Native環境ではグローバル変数から、Web環境ではwindow.locationから取得
 */
function getAppUrl(): string {
  // グローバル変数が設定されている場合（React Native等）
  if (typeof globalThis !== 'undefined' && globalThis.__SWIM_HUB_WEB_API_URL__) {
    return globalThis.__SWIM_HUB_WEB_API_URL__
  }

  // Web環境（ブラウザ）- window.locationが存在する場合のみ
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  // サーバーサイド（Next.js）
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

/**
 * Google Calendar同期結果
 */
export interface GoogleCalendarSyncResult {
  success: boolean
  googleEventId?: string
  error?: string
}

/**
 * PracticeをGoogle Calendarに同期
 * @param accessToken - オプション。React Native環境ではBearerトークン認証に必要
 */
export async function syncPracticeToGoogleCalendar(
  practice: Practice,
  action: 'create' | 'update' | 'delete',
  googleEventId?: string,
  accessToken?: string
): Promise<GoogleCalendarSyncResult> {
  try {
    const appUrl = getAppUrl()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // アクセストークンがある場合はAuthorizationヘッダーを追加（React Native用）
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const response = await fetch(`${appUrl}/api/google-calendar/sync`, {
      method: 'POST',
      headers,
      // アクセストークンがある場合はcredentialsを省略（React Native互換）
      ...(accessToken ? {} : { credentials: 'include' as RequestCredentials }),
      body: JSON.stringify({
        type: 'practice',
        data: practice,
        action,
        googleEventId
      })
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      return {
        success: false,
        error: error.error || '同期に失敗しました'
      }
    }

    const result = await response.json() as { googleEventId?: string }
    return {
      success: true,
      googleEventId: result.googleEventId
    }
  } catch (error) {
    console.error('Google Calendar同期エラー:', error)
    return {
      success: false,
      error: '予期しないエラーが発生しました'
    }
  }
}

/**
 * CompetitionをGoogle Calendarに同期
 * @param accessToken - オプション。React Native環境ではBearerトークン認証に必要
 */
export async function syncCompetitionToGoogleCalendar(
  competition: Competition,
  action: 'create' | 'update' | 'delete',
  googleEventId?: string,
  accessToken?: string
): Promise<GoogleCalendarSyncResult> {
  try {
    const appUrl = getAppUrl()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // アクセストークンがある場合はAuthorizationヘッダーを追加（React Native用）
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const response = await fetch(`${appUrl}/api/google-calendar/sync`, {
      method: 'POST',
      headers,
      // アクセストークンがある場合はcredentialsを省略（React Native互換）
      ...(accessToken ? {} : { credentials: 'include' as RequestCredentials }),
      body: JSON.stringify({
        type: 'competition',
        data: competition,
        action,
        googleEventId
      })
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      return {
        success: false,
        error: error.error || '同期に失敗しました'
      }
    }

    const result = await response.json() as { googleEventId?: string }
    return {
      success: true,
      googleEventId: result.googleEventId
    }
  } catch (error) {
    console.error('Google Calendar同期エラー:', error)
    return {
      success: false,
      error: '予期しないエラーが発生しました'
    }
  }
}
