// =============================================================================
// Google Calendar API連携
// =============================================================================

import type { Competition, Practice } from '../types'

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
 */
export async function syncPracticeToGoogleCalendar(
  practice: Practice,
  action: 'create' | 'update' | 'delete',
  googleEventId?: string
): Promise<GoogleCalendarSyncResult> {
  try {
    const appUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${appUrl}/api/google-calendar/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
 */
export async function syncCompetitionToGoogleCalendar(
  competition: Competition,
  action: 'create' | 'update' | 'delete',
  googleEventId?: string
): Promise<GoogleCalendarSyncResult> {
  try {
    const appUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${appUrl}/api/google-calendar/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
