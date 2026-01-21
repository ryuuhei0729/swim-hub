'use client'

import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { AttendanceAPI, TeamAttendanceWithDetails } from '@swim-hub/shared'
import { AttendanceStatus, TeamEvent } from '@swim-hub/shared/types'
import { sanitizeTextInput } from '@swim-hub/shared/utils/sanitize'
import { format } from 'date-fns'

export interface AttendanceEditState {
  status: AttendanceStatus | null
  note: string
}

const NOTE_MAX_LENGTH = 500

export const useAttendanceEdit = (
  teamId: string,
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI
) => {
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const initializeEditStates = useCallback((
    events: TeamEvent[],
    attendances: TeamAttendanceWithDetails[]
  ) => {
    const initialEditStates: Record<string, AttendanceEditState> = {}

    attendances.forEach((attendance) => {
      const eventId = attendance.practice_id || attendance.competition_id
      if (eventId) {
        initialEditStates[eventId] = {
          status: attendance.status,
          note: attendance.note || ''
        }
      }
    })

    events.forEach((event) => {
      if (!initialEditStates[event.id]) {
        initialEditStates[event.id] = {
          status: null,
          note: ''
        }
      }
    })

    setEditStates(initialEditStates)
  }, [])

  const saveAll = useCallback(async (
    events: TeamEvent[],
    attendances: TeamAttendanceWithDetails[],
    onSuccess?: () => void
  ) => {
    try {
      setSaving(true)
      setError(null)

      const updates = events
        .map((event) => {
          const editState = editStates[event.id]
          if (!editState) return null

          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id
          )

          if (existingAttendance) {
            if (
              existingAttendance.status === editState.status &&
              (existingAttendance.note || '') === editState.note
            ) {
              return null
            }
          } else if (editState.status === null && editState.note === '') {
            return null
          }

          const sanitizedNote = editState.note ? sanitizeTextInput(editState.note, NOTE_MAX_LENGTH) : null

          return {
            attendanceId: existingAttendance?.id || '',
            status: editState.status,
            note: sanitizedNote,
            eventId: event.id,
            eventAttendanceStatus: event.attendance_status,
            isNew: !existingAttendance
          }
        })
        .filter((u): u is { attendanceId: string; status: AttendanceStatus | null; note: string | null; eventId: string; eventAttendanceStatus: 'open' | 'closed' | null | undefined; isNew: boolean } => u !== null)

      if (updates.length === 0) {
        return
      }

      const closedEvents = updates
        .filter((update) => {
          const event = events.find((e) => e.id === update.eventId)
          return event && event.attendance_status === 'closed'
        })
        .map((update) => {
          const event = events.find((e) => e.id === update.eventId)
          return event
        })
        .filter((e): e is TeamEvent => e !== undefined)

      if (closedEvents.length > 0) {
        const eventDates = closedEvents
          .map((event) => {
            const date = new Date(event.date)
            return `${date.getMonth() + 1}/${date.getDate()}`
          })
          .join('、')

        const confirmed = window.confirm(
          `提出締め切り後の編集になります（${eventDates}）。備考に編集日時が自動的に追加されます。保存しますか？`
        )
        if (!confirmed) {
          setSaving(false)
          return
        }
      }

      const processedUpdates = updates.map((update) => ({
        attendanceId: update.attendanceId,
        status: update.status,
        note: update.note
      }))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const newAttendances = events
        .filter((event) => {
          const editState = editStates[event.id]
          if (!editState) return false
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id
          )
          return !existingAttendance && (editState.status !== null || editState.note !== '')
        })
        .map((event) => {
          const editState = editStates[event.id]
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

          return {
            user_id: user.id,
            practice_id: event.type === 'practice' ? event.id : null,
            competition_id: event.type === 'competition' ? event.id : null,
            status: editState.status,
            note
          }
        })

      if (newAttendances.length > 0) {
        const { error: insertError } = await supabase
          .from('team_attendance')
          .insert(newAttendances)

        if (insertError) throw insertError
      }

      const updateOnly = processedUpdates.filter((u) => u.attendanceId !== '')
      if (updateOnly.length > 0) {
        await attendanceAPI.bulkUpdateMyAttendances(updateOnly)
      }

      onSuccess?.()
    } catch (err) {
      console.error('出欠情報の保存に失敗:', err)
      setError('出欠情報の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [editStates, supabase, attendanceAPI])

  return {
    editStates,
    saving,
    error,
    handleStatusChange,
    handleNoteChange,
    initializeEditStates,
    saveAll,
    setEditStates
  }
}
