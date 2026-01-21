// =============================================================================
// Google Calendar API連携ユーティリティ
// =============================================================================

import type { Competition, Practice } from '@apps/shared/types'

/**
 * Google Calendarイベントの型定義
 */
export interface GoogleCalendarEvent {
  summary: string
  description?: string
  location?: string
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
}

/**
 * PracticeをGoogle Calendarイベントに変換
 */
export function practiceToCalendarEvent(
  practice: Practice,
  teamName?: string | null
): GoogleCalendarEvent {
  const title = practice.title || '練習'
  const summary = teamName ? `[${teamName}] ${title}` : title
  
  // 日付をISO形式に変換（時刻は00:00:00）
  const dateStr = practice.date
  
  return {
    summary,
    description: practice.note || undefined,
    location: practice.place || undefined,
    start: {
      date: dateStr,
      timeZone: 'Asia/Tokyo'
    },
    end: {
      date: dateStr,
      timeZone: 'Asia/Tokyo'
    }
  }
}

/**
 * CompetitionをGoogle Calendarイベントに変換
 */
export function competitionToCalendarEvent(
  competition: Competition,
  teamName?: string | null
): GoogleCalendarEvent {
  const title = competition.title || '大会'
  const summary = teamName ? `[${teamName}] ${title}` : title
  
  // 開始日
  const startDate = competition.date
  
  // 終了日（複数日開催の場合）
  const endDate = competition.end_date || competition.date
  
  return {
    summary,
    description: competition.note || undefined,
    location: competition.place || undefined,
    start: {
      date: startDate,
      timeZone: 'Asia/Tokyo'
    },
    end: {
      // 終了日の翌日を指定（Google Calendarの終日イベントは終了日が含まれないため）
      date: endDate,
      timeZone: 'Asia/Tokyo'
    }
  }
}

/**
 * Google OAuthトークンをリフレッシュして新しいアクセストークンを取得
 * @param refreshToken リフレッシュトークン
 * @returns 新しいアクセストークン
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<string> {
  // Google OAuthクライアントIDとシークレットを環境変数から取得
  // フォールバックとしてSupabaseの環境変数を使用
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuthクライアントIDまたはシークレットが設定されていません')
  }

  // Google OAuthトークンリフレッシュエンドポイント
  const tokenUrl = 'https://oauth2.googleapis.com/token'

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google OAuthトークンリフレッシュに失敗しました: ${errorText}`)
  }

  const data = await response.json() as { access_token: string; expires_in?: number }
  
  if (!data.access_token) {
    throw new Error('Google OAuthトークンリフレッシュレスポンスにアクセストークンが含まれていません')
  }

  return data.access_token
}

/**
 * Google Calendar APIへのリクエストを実行し、401エラー時に自動的にトークンをリフレッシュして再試行
 * @param url リクエストURL
 * @param options リクエストオプション
 * @param accessToken 現在のアクセストークン
 * @param refreshToken リフレッシュトークン
 * @returns レスポンス
 */
export async function fetchGoogleCalendarWithTokenRefresh(
  url: string,
  options: RequestInit,
  accessToken: string,
  refreshToken: string
): Promise<Response> {
  // 最初のリクエストを実行
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  // 401エラーの場合、トークンをリフレッシュして再試行
  if (response.status === 401) {
    try {
      // リフレッシュトークンを使って新しいアクセストークンを取得
      const newAccessToken = await refreshGoogleAccessToken(refreshToken)
      
      // 新しいアクセストークンで再試行
      return await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newAccessToken}`,
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      // トークンリフレッシュに失敗した場合、元のレスポンスを返す
      console.error('Google OAuthトークンリフレッシュエラー（再試行時）:', error)
      return response
    }
  }

  return response
}

