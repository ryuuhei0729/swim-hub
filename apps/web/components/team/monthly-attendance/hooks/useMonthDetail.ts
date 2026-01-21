'use client'

import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { AttendanceAPI, TeamAttendanceWithDetails } from '@swim-hub/shared'
import { TeamEvent } from '@swim-hub/shared/types'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'

export const useMonthDetail = (
  teamId: string,
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI
) => {
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAttendances = useCallback(async (year: number, month: number) => {
    try {
      setLoading(true)
      setError(null)

      const [startDateStr, endDateStr] = getMonthDateRange(year, month)

      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true }),
        supabase
          .from('competitions')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
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
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      setEvents(allEvents)

      const attendanceData = await attendanceAPI.getMyAttendancesByMonth(
        teamId,
        year,
        month
      )
      setAttendances(attendanceData)

      return { events: allEvents, attendances: attendanceData }
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
      setError('出欠情報の取得に失敗しました')
      return null
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase, attendanceAPI])

  return {
    events,
    attendances,
    loading,
    error,
    loadAttendances
  }
}
