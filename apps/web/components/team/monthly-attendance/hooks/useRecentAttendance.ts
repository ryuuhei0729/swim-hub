'use client'

import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { AttendanceAPI } from '@swim-hub/shared/api/attendance'
import type { TeamAttendanceWithDetails } from '@swim-hub/shared/types/attendance'
import { AttendanceStatus, TeamEvent } from '@swim-hub/shared/types'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'
import { sanitizeTextInput } from '@swim-hub/shared/utils/sanitize'
import { format, parseISO } from 'date-fns'

interface AttendanceEditState {
  status: AttendanceStatus | null
  note: string
}

const NOTE_MAX_LENGTH = 500

export const useRecentAttendance = (
  teamId: string,
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI,
  onMonthStatusUpdate: (year: number, month: number) => Promise<void>
) => {
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({})
  const [loading, setLoading] = useState(false)
  const [savingEventIds, setSavingEventIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const loadRecentAttendances = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true)
      setError(null)

      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
      const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear

      const [currentStart] = getMonthDateRange(currentYear, currentMonth)
      const [, nextEnd] = getMonthDateRange(nextYear, nextMonth)

      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', currentStart)
          .lte('date', nextEnd)
          .order('date', { ascending: true }),
        supabase
          .from('competitions')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', currentStart)
          .lte('date', nextEnd)
          .order('date', { ascending: true })
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      const practices: TeamEvent[] = (practicesResult.data || []).map((p) => ({
        ...p,
        type: 'practice' as const
      }))
      const competitions: TeamEvent[] = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: 'competition' as const
      }))
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
      )
      setEvents(allEvents)

      if (signal?.aborted) return

      const [currentAttendances, nextAttendances] = await Promise.all([
        attendanceAPI.getMyAttendancesByMonth(teamId, currentYear, currentMonth),
        attendanceAPI.getMyAttendancesByMonth(teamId, nextYear, nextMonth)
      ])

      if (signal?.aborted) return

      const allAttendances = [...currentAttendances, ...nextAttendances]
      setAttendances(allAttendances)

      const initialEditStates: Record<string, AttendanceEditState> = {}
      allAttendances.forEach((attendance) => {
        const eventId = attendance.practice_id || attendance.competition_id
        if (eventId) {
          initialEditStates[eventId] = {
            status: attendance.status,
            note: attendance.note || ''
          }
        }
      })

      allEvents.forEach((event) => {
        if (!initialEditStates[event.id]) {
          initialEditStates[event.id] = {
            status: null,
            note: ''
          }
        }
      })

      if (signal?.aborted) return

      setEditStates(initialEditStates)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      if (signal?.aborted) return

      console.error('直近の出欠情報の取得に失敗:', err)
      setError('直近の出欠情報の取得に失敗しました')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [teamId, supabase, attendanceAPI])

  const handleStatusChange = useCallback((eventId: string, status: AttendanceStatus | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        status
      }
    }))
  }, [])

  const handleNoteChange = useCallback((eventId: string, note: string) => {
    const trimmedNote = note.length > NOTE_MAX_LENGTH ? note.substring(0, NOTE_MAX_LENGTH) : note

    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        note: trimmedNote
      }
    }))
  }, [])

  const saveEvent = useCallback(async (eventId: string) => {
    const event = events.find((e) => e.id === eventId)
    if (!event) return

    const editState = editStates[eventId]
    if (!editState) return

    const existingAttendance = attendances.find(
      (a) => (a.practice_id || a.competition_id) === eventId
    )

    if (existingAttendance) {
      if (
        existingAttendance.status === editState.status &&
        (existingAttendance.note || '') === editState.note
      ) {
        return
      }
    } else if (editState.status === null && editState.note === '') {
      return
    }

    if (event.attendance_status === 'closed') {
      const date = parseISO(event.date)
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
      const confirmed = window.confirm(
        `提出締め切り後の編集になります（${dateStr}）。備考に編集日時が自動的に追加されます。保存しますか？`
      )
      if (!confirmed) {
        return
      }
    }

    try {
      setSavingEventIds((prev) => new Set(prev).add(eventId))
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      let note = editState.note ? sanitizeTextInput(editState.note, NOTE_MAX_LENGTH) : null

      if (event.attendance_status === 'closed') {
        const now = new Date()
        const editTimestamp = format(now, 'MM/dd HH:mm')
        const editNote = `(${editTimestamp}締切後編集)`

        if (note) {
          note = note.replace(/\s*\(\d{2}\/\d{2}\s+\d{2}:\d{2}締切後編集\)/g, '').trim()
          const combinedNote = note ? `${note} ${editNote}` : editNote
          note = combinedNote.length > NOTE_MAX_LENGTH
            ? combinedNote.substring(0, NOTE_MAX_LENGTH)
            : combinedNote
        } else {
          note = editNote
        }
      }

      if (existingAttendance) {
        const { error: updateError } = await supabase
          .from('team_attendance')
          .update({
            status: editState.status,
            note
          })
          .eq('id', existingAttendance.id)

        if (updateError) throw updateError

        setAttendances((prev) =>
          prev.map((a) =>
            a.id === existingAttendance.id
              ? { ...a, status: editState.status, note }
              : a
          )
        )
        setEditStates((prev) => ({
          ...prev,
          [eventId]: {
            status: editState.status,
            note: note || ''
          }
        }))
      } else {
        const { error: insertError } = await supabase
          .from('team_attendance')
          .insert({
            user_id: user.id,
            practice_id: event.type === 'practice' ? event.id : null,
            competition_id: event.type === 'competition' ? event.id : null,
            status: editState.status,
            note
          })

        if (insertError) throw insertError

        const { data: insertedData, error: selectError } = await supabase
          .from('team_attendance')
          .select(`
            *,
            user:users(*),
            practice:practices(*),
            competition:competitions(*)
          `)
          .eq('user_id', user.id)
          .eq(event.type === 'practice' ? 'practice_id' : 'competition_id', eventId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (selectError) {
          await loadRecentAttendances(undefined)
        } else if (insertedData) {
          const isValidAttendance = (
            data: unknown
          ): data is TeamAttendanceWithDetails => {
            if (!data || typeof data !== 'object') return false

            const d = data as Record<string, unknown>

            if (!d.id || typeof d.id !== 'string') return false
            if (!d.user_id || typeof d.user_id !== 'string') return false
            if (d.status !== null && typeof d.status !== 'string') return false
            if (d.note !== null && typeof d.note !== 'string') return false

            if (!d.user || typeof d.user !== 'object') return false
            const user = d.user as Record<string, unknown>
            if (!user.id || typeof user.id !== 'string') return false
            if (!user.name || typeof user.name !== 'string') return false

            if (d.practice !== null && d.practice !== undefined) {
              if (typeof d.practice !== 'object') return false
              const practice = d.practice as Record<string, unknown>
              if (!practice.id || typeof practice.id !== 'string') return false
            }

            if (d.competition !== null && d.competition !== undefined) {
              if (typeof d.competition !== 'object') return false
              const competition = d.competition as Record<string, unknown>
              if (!competition.id || typeof competition.id !== 'string') return false
            }

            return true
          }

          if (isValidAttendance(insertedData)) {
            setAttendances((prev) => [...prev, insertedData])
            setEditStates((prev) => ({
              ...prev,
              [eventId]: {
                status: editState.status,
                note: note || ''
              }
            }))
          } else {
            console.warn('insertedDataの形状が不正です。再取得します。', insertedData)
            await loadRecentAttendances(undefined)
          }
        }
      }

      const eventDate = parseISO(event.date)
      const eventYear = eventDate.getFullYear()
      const eventMonth = eventDate.getMonth() + 1

      await onMonthStatusUpdate(eventYear, eventMonth)
    } catch (err) {
      console.error('出欠情報の保存に失敗:', err)
      setError('出欠情報の保存に失敗しました')
    } finally {
      setSavingEventIds((prev) => {
        const next = new Set(prev)
        next.delete(eventId)
        return next
      })
    }
  }, [events, editStates, attendances, supabase, loadRecentAttendances, onMonthStatusUpdate])

  return {
    events,
    attendances,
    editStates,
    loading,
    savingEventIds,
    error,
    loadRecentAttendances,
    handleStatusChange,
    handleNoteChange,
    saveEvent
  }
}
