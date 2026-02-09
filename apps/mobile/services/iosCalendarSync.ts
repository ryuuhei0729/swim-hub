/**
 * iOSカレンダー同期サービス
 * expo-calendarを使用してネイティブカレンダーと同期
 */
import * as Calendar from 'expo-calendar'
import { Platform } from 'react-native'
import { parseISO } from 'date-fns/parseISO'
import { isValid } from 'date-fns/isValid'
import type { Practice, Competition } from '@swim-hub/shared/types'

export interface IOSCalendarEvent {
  title: string
  startDate: Date
  endDate: Date
  location?: string
  notes?: string
  allDay?: boolean
}

export interface SyncResult {
  success: boolean
  eventId?: string
  error?: string
}

/**
 * カレンダーパーミッションをリクエスト
 */
export const requestCalendarPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    return false
  }

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

/**
 * パーミッション状態を確認
 */
export const getCalendarPermissionStatus = async (): Promise<'granted' | 'denied' | 'undetermined'> => {
  if (Platform.OS !== 'ios') {
    return 'denied'
  }

  try {
    const { status } = await Calendar.getCalendarPermissionsAsync()
    return status
  } catch (err) {
    console.error('[IOSCalendarSync] Failed to get calendar permissions:', err)
    return 'undetermined'
  }
}

/**
 * SwimHub専用カレンダーを取得または作成
 */
export const getOrCreateSwimHubCalendar = async (): Promise<string | null> => {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)

    // 既存のSwimHubカレンダーを検索
    const existingCalendar = calendars.find((cal) => cal.title === 'SwimHub')
    if (existingCalendar) {
      return existingCalendar.id
    }

    // iCloudまたはローカルカレンダーソースを取得
    const defaultSource = calendars.find(
      (cal) => cal.source.type === Calendar.SourceType.CALDAV && cal.source.name === 'iCloud'
    )?.source || calendars.find((cal) => cal.allowsModifications)?.source

    if (!defaultSource) {
      return null
    }

    // SwimHubカレンダーを作成
    const newCalendarId = await Calendar.createCalendarAsync({
      title: 'SwimHub',
      color: '#2563EB',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultSource.id,
      source: defaultSource,
      name: 'SwimHub',
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    })

    return newCalendarId
  } catch {
    return null
  }
}

/**
 * デフォルトカレンダーを取得（SwimHubカレンダーがない場合のフォールバック）
 */
export const getDefaultCalendarId = async (): Promise<string | null> => {
  try {
    // まずSwimHubカレンダーを試す
    const swimHubCalendar = await getOrCreateSwimHubCalendar()
    if (swimHubCalendar) {
      return swimHubCalendar
    }

    // フォールバック: 書き込み可能なカレンダーを探す
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    const defaultCalendar = calendars.find((cal) => cal.allowsModifications)

    return defaultCalendar?.id || null
  } catch {
    return null
  }
}

/**
 * PracticeをiOSカレンダーイベントに変換
 */
export const practiceToIOSEvent = (
  practice: Practice,
  teamName?: string | null
): IOSCalendarEvent | null => {
  const title = practice.title || '練習'
  const eventTitle = teamName ? `[${teamName}] ${title}` : title

  const date = parseISO(practice.date)
  if (!isValid(date)) {
    return null
  }

  return {
    title: eventTitle,
    startDate: date,
    endDate: date,
    location: practice.place || undefined,
    notes: practice.note || undefined,
    allDay: true,
  }
}

/**
 * CompetitionをiOSカレンダーイベントに変換
 */
export const competitionToIOSEvent = (
  competition: Competition,
  teamName?: string | null
): IOSCalendarEvent | null => {
  const title = competition.title || '大会'
  const eventTitle = teamName ? `[${teamName}] ${title}` : title

  const startDate = parseISO(competition.date)
  if (!isValid(startDate)) {
    return null
  }

  let endDate = startDate
  if (competition.end_date) {
    const parsedEndDate = parseISO(competition.end_date)
    if (isValid(parsedEndDate)) {
      endDate = parsedEndDate
    }
  }

  return {
    title: eventTitle,
    startDate,
    endDate,
    location: competition.place || undefined,
    notes: competition.note || undefined,
    allDay: true,
  }
}

/**
 * イベントをカレンダーに追加
 */
export const createCalendarEvent = async (
  event: IOSCalendarEvent,
  calendarId?: string
): Promise<SyncResult> => {
  try {
    const targetCalendarId = calendarId || await getDefaultCalendarId()

    if (!targetCalendarId) {
      return { success: false, error: 'カレンダーが見つかりません' }
    }

    const eventId = await Calendar.createEventAsync(targetCalendarId, {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      notes: event.notes,
      allDay: event.allDay,
      timeZone: 'Asia/Tokyo',
    })

    return { success: true, eventId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'イベントの作成に失敗しました',
    }
  }
}

/**
 * カレンダーイベントを更新
 */
export const updateCalendarEvent = async (
  eventId: string,
  event: IOSCalendarEvent
): Promise<SyncResult> => {
  try {
    await Calendar.updateEventAsync(eventId, {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      notes: event.notes,
      allDay: event.allDay,
      timeZone: 'Asia/Tokyo',
    })

    return { success: true, eventId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'イベントの更新に失敗しました',
    }
  }
}

/**
 * カレンダーイベントを削除
 */
export const deleteCalendarEvent = async (eventId: string): Promise<SyncResult> => {
  try {
    await Calendar.deleteEventAsync(eventId)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'イベントの削除に失敗しました',
    }
  }
}
