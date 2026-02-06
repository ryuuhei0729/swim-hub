/**
 * iOSカレンダー同期フック
 * expo-calendarを使用してiOSネイティブカレンダーと同期
 */
import { useState, useCallback, useEffect } from 'react'
import { Platform } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'
import {
  requestCalendarPermissions,
  getCalendarPermissionStatus,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  practiceToIOSEvent,
  competitionToIOSEvent,
} from '@/services/iosCalendarSync'
import type { Practice, Competition } from '@swim-hub/shared/types'

export interface UseIOSCalendarSyncReturn {
  /** iOS カレンダー連携が利用可能か */
  isAvailable: boolean
  /** パーミッション状態 */
  permissionStatus: 'granted' | 'denied' | 'undetermined' | null
  /** パーミッションをリクエスト */
  requestPermission: () => Promise<boolean>
  /** 連携を有効化 */
  enableSync: () => Promise<boolean>
  /** 連携を無効化 */
  disableSync: () => Promise<boolean>
  /** 練習記録を同期 */
  syncPractice: (
    practice: Practice,
    action: 'create' | 'update' | 'delete',
    teamName?: string
  ) => Promise<{ success: boolean; eventId?: string }>
  /** 大会記録を同期 */
  syncCompetition: (
    competition: Competition,
    action: 'create' | 'update' | 'delete',
    teamName?: string
  ) => Promise<{ success: boolean; eventId?: string }>
  /** 同期設定を更新 */
  updateSyncSettings: (
    field: 'ios_calendar_sync_practices' | 'ios_calendar_sync_competitions',
    value: boolean
  ) => Promise<boolean>
  /** ローディング状態 */
  loading: boolean
  /** エラーメッセージ */
  error: string | null
  /** エラーをクリア */
  clearError: () => void
}

export const useIOSCalendarSync = (): UseIOSCalendarSyncReturn => {
  const { supabase, user } = useAuth()
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'undetermined' | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAvailable = Platform.OS === 'ios'

  // パーミッション状態を確認
  useEffect(() => {
    if (isAvailable) {
      getCalendarPermissionStatus().then(setPermissionStatus)
    }
  }, [isAvailable])

  // パーミッションリクエスト
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestCalendarPermissions()
    setPermissionStatus(granted ? 'granted' : 'denied')
    return granted
  }, [])

  // 連携有効化
  const enableSync = useCallback(async (): Promise<boolean> => {
    if (!user || !supabase) return false

    setLoading(true)
    setError(null)

    try {
      // パーミッション確認
      if (permissionStatus !== 'granted') {
        const granted = await requestPermission()
        if (!granted) {
          setError('カレンダーへのアクセス許可が必要です')
          return false
        }
      }

      // DB更新
      const { error: updateError } = await supabase
        .from('users')
        .update({ ios_calendar_enabled: true })
        .eq('id', user.id)

      if (updateError) throw updateError

      return true
    } catch {
      setError('連携の有効化に失敗しました')
      return false
    } finally {
      setLoading(false)
    }
  }, [user, supabase, permissionStatus, requestPermission])

  // 連携無効化
  const disableSync = useCallback(async (): Promise<boolean> => {
    if (!user || !supabase) return false

    setLoading(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ ios_calendar_enabled: false })
        .eq('id', user.id)

      if (updateError) throw updateError

      return true
    } catch {
      setError('連携の無効化に失敗しました')
      return false
    } finally {
      setLoading(false)
    }
  }, [user, supabase])

  // 同期設定更新
  const updateSyncSettings = useCallback(
    async (
      field: 'ios_calendar_sync_practices' | 'ios_calendar_sync_competitions',
      value: boolean
    ): Promise<boolean> => {
      if (!user || !supabase) return false

      setLoading(true)
      setError(null)

      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({ [field]: value })
          .eq('id', user.id)

        if (updateError) throw updateError

        return true
      } catch {
        setError('設定の更新に失敗しました')
        return false
      } finally {
        setLoading(false)
      }
    },
    [user, supabase]
  )

  // 練習記録同期
  const syncPractice = useCallback(
    async (
      practice: Practice,
      action: 'create' | 'update' | 'delete',
      teamName?: string
    ): Promise<{ success: boolean; eventId?: string }> => {
      if (!user || !supabase) return { success: false }

      try {
        if (action === 'delete' && practice.ios_calendar_event_id) {
          const result = await deleteCalendarEvent(practice.ios_calendar_event_id)
          if (result.success) {
            // DB更新: event_idをクリア
            await supabase
              .from('practices')
              .update({ ios_calendar_event_id: null })
              .eq('id', practice.id)
          }
          return { success: result.success }
        }

        const event = practiceToIOSEvent(practice, teamName)

        if (action === 'update' && practice.ios_calendar_event_id) {
          const result = await updateCalendarEvent(practice.ios_calendar_event_id, event)
          return { success: result.success, eventId: result.eventId }
        }

        const result = await createCalendarEvent(event)

        // event_idをDBに保存
        if (result.success && result.eventId) {
          await supabase
            .from('practices')
            .update({ ios_calendar_event_id: result.eventId })
            .eq('id', practice.id)
        }

        return { success: result.success, eventId: result.eventId }
      } catch {
        return { success: false }
      }
    },
    [user, supabase]
  )

  // 大会記録同期
  const syncCompetition = useCallback(
    async (
      competition: Competition,
      action: 'create' | 'update' | 'delete',
      teamName?: string
    ): Promise<{ success: boolean; eventId?: string }> => {
      if (!user || !supabase) return { success: false }

      try {
        if (action === 'delete' && competition.ios_calendar_event_id) {
          const result = await deleteCalendarEvent(competition.ios_calendar_event_id)
          if (result.success) {
            // DB更新: event_idをクリア
            await supabase
              .from('competitions')
              .update({ ios_calendar_event_id: null })
              .eq('id', competition.id)
          }
          return { success: result.success }
        }

        const event = competitionToIOSEvent(competition, teamName)

        if (action === 'update' && competition.ios_calendar_event_id) {
          const result = await updateCalendarEvent(competition.ios_calendar_event_id, event)
          return { success: result.success, eventId: result.eventId }
        }

        const result = await createCalendarEvent(event)

        // event_idをDBに保存
        if (result.success && result.eventId) {
          await supabase
            .from('competitions')
            .update({ ios_calendar_event_id: result.eventId })
            .eq('id', competition.id)
        }

        return { success: result.success, eventId: result.eventId }
      } catch {
        return { success: false }
      }
    },
    [user, supabase]
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    isAvailable,
    permissionStatus,
    requestPermission,
    enableSync,
    disableSync,
    syncPractice,
    syncCompetition,
    updateSyncSettings,
    loading,
    error,
    clearError,
  }
}
