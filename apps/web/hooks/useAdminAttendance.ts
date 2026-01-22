import { useState, useCallback, useMemo } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAttendancesAPI } from '@apps/shared/api/teams/attendances'
import { AttendanceStatusType, TeamEvent } from '@swim-hub/shared/types'
import { format } from 'date-fns'
import type { EventStatusEditState } from '@/types/admin-attendance'

export function useAdminAttendance(supabase: SupabaseClient, teamId: string) {
  const attendancesAPI = useMemo(() => new TeamAttendancesAPI(supabase), [supabase])

  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editStates, setEditStates] = useState<Record<string, EventStatusEditState>>({})
  const [savingEventIds, setSavingEventIds] = useState<Set<string>>(new Set())

  const loadFutureEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const todayStr = format(new Date(), 'yyyy-MM-dd')

      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', todayStr)
          .order('date', { ascending: true }),
        supabase
          .from('competitions')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', todayStr)
          .order('date', { ascending: true })
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      const practices = (practicesResult.data || []).map((p) => ({
        ...p,
        type: 'practice' as const
      }))
      const competitions = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: 'competition' as const
      }))
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      setEvents(allEvents)

      const initialEditStates: Record<string, EventStatusEditState> = {}
      allEvents.forEach((event) => {
        initialEditStates[event.id] = {
          attendanceStatus: event.attendance_status || null
        }
      })
      setEditStates(initialEditStates)
    } catch (err) {
      console.error('イベント情報の取得に失敗:', err)
      setError('イベント情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  const handleStatusChange = useCallback((eventId: string, status: AttendanceStatusType | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        attendanceStatus: status
      }
    }))
  }, [])

  const handleSaveEvent = useCallback(async (eventId: string) => {
    const event = events.find((e) => e.id === eventId)
    if (!event) return

    const editState = editStates[eventId]
    if (!editState) return

    if (event.attendance_status === editState.attendanceStatus) {
      return
    }

    try {
      setSavingEventIds((prev) => new Set(prev).add(eventId))
      setError(null)

      if (event.type === 'practice') {
        await attendancesAPI.updatePracticeAttendanceStatus(eventId, editState.attendanceStatus)
      } else {
        await attendancesAPI.updateCompetitionAttendanceStatus(eventId, editState.attendanceStatus)
      }

      setEvents((prevEvents) =>
        prevEvents.map((e) =>
          e.id === eventId
            ? { ...e, attendance_status: editState.attendanceStatus }
            : e
        )
      )

      setEditStates((prev) => ({
        ...prev,
        [eventId]: {
          attendanceStatus: editState.attendanceStatus
        }
      }))
    } catch (err) {
      console.error('出欠ステータスの保存に失敗:', err)
      setError('出欠ステータスの保存に失敗しました')
    } finally {
      setSavingEventIds((prev) => {
        const next = new Set(prev)
        next.delete(eventId)
        return next
      })
    }
  }, [events, editStates, attendancesAPI])

  const handleBulkUpdate = useCallback(async (
    selectedEventIds: Set<string>,
    status: AttendanceStatusType
  ) => {
    if (selectedEventIds.size === 0) return

    try {
      setError(null)

      const updates = Array.from(selectedEventIds)
        .map((eventId) => {
          const event = events.find((e) => e.id === eventId)
          if (!event) return null

          return {
            eventId,
            eventType: event.type,
            status
          }
        })
        .filter((u): u is { eventId: string; eventType: 'practice' | 'competition'; status: AttendanceStatusType } => u !== null)

      await Promise.all(
        updates.map((update) => {
          if (update.eventType === 'practice') {
            return attendancesAPI.updatePracticeAttendanceStatus(update.eventId, update.status)
          } else {
            return attendancesAPI.updateCompetitionAttendanceStatus(update.eventId, update.status)
          }
        })
      )

      await loadFutureEvents()
    } catch (err) {
      console.error('一括更新に失敗:', err)
      setError('一括更新に失敗しました')
    }
  }, [events, attendancesAPI, loadFutureEvents])

  return {
    events,
    loading,
    error,
    editStates,
    savingEventIds,
    loadFutureEvents,
    handleStatusChange,
    handleSaveEvent,
    handleBulkUpdate
  }
}
