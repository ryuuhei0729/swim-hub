// =============================================================================
// Google Calendar API連携ユーティリティ
// =============================================================================

import type { Competition, Practice } from '@apps/shared/types/database'

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



