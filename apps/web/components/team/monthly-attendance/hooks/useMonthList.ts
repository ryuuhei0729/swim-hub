'use client'

import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { AttendanceAPI } from '@swim-hub/shared'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'
import { format, startOfMonth, endOfMonth, addMonths, parseISO } from 'date-fns'

export interface MonthItem {
  year: number
  month: number
  status: 'has_unanswered' | 'all_answered' | null
  eventCount: number
  answeredCount: number
}

export const useMonthList = (
  teamId: string,
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI
) => {
  const [monthList, setMonthList] = useState<MonthItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const calculateMonthStatus = useCallback(async (
    year: number,
    month: number
  ): Promise<{ eventCount: number; answeredCount: number; status: 'has_unanswered' | 'all_answered' | null }> => {
    const [startDateStr, endDateStr] = getMonthDateRange(year, month)

    const [practicesResult, competitionsResult] = await Promise.all([
      supabase
        .from('practices')
        .select('id')
        .eq('team_id', teamId)
        .gte('date', startDateStr)
        .lte('date', endDateStr),
      supabase
        .from('competitions')
        .select('id')
        .eq('team_id', teamId)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
    ])

    if (practicesResult.error) throw practicesResult.error
    if (competitionsResult.error) throw competitionsResult.error

    const practiceIds = (practicesResult.data || []).map(p => p.id)
    const competitionIds = (competitionsResult.data || []).map(c => c.id)
    const eventCount = practiceIds.length + competitionIds.length

    const attendanceData = await attendanceAPI.getMyAttendancesByMonth(teamId, year, month)
    const answeredCount = attendanceData.filter(a => a.status !== null).length

    const eventIds = new Set([...practiceIds, ...competitionIds])
    const answeredEventIds = new Set(
      attendanceData
        .filter(a => a.status !== null)
        .map(a => a.practice_id || a.competition_id)
        .filter((id): id is string => id !== null)
    )

    const allAnswered = eventCount > 0 && Array.from(eventIds).every(id => answeredEventIds.has(id))

    return {
      eventCount,
      answeredCount,
      status: eventCount === 0 ? null : (allAnswered ? 'all_answered' : 'has_unanswered')
    }
  }, [teamId, supabase, attendanceAPI])

  const loadMonthList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const now = new Date()
      const oneYearLater = addMonths(now, 12)
      const startDateStr = format(startOfMonth(now), 'yyyy-MM-dd')
      const endDateStr = format(endOfMonth(oneYearLater), 'yyyy-MM-dd')

      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('date')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr),
        supabase
          .from('competitions')
          .select('date')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      const monthSet = new Set<string>()
      const allDates = [
        ...(practicesResult.data || []).map(p => p.date),
        ...(competitionsResult.data || []).map(c => c.date)
      ]

      allDates.forEach(dateStr => {
        const date = parseISO(dateStr)
        const monthKey = format(date, 'yyyy-MM')
        monthSet.add(monthKey)
      })

      const monthList: MonthItem[] = []
      const sortedMonthKeys = Array.from(monthSet).sort()

      for (const monthKey of sortedMonthKeys) {
        const [yearStr, monthStr] = monthKey.split('-')
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)

        const status = await calculateMonthStatus(year, month)
        monthList.push({
          year,
          month,
          ...status
        })
      }

      setMonthList(monthList)
    } catch (err) {
      console.error('月リストの取得に失敗:', err)
      setError('月リストの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase, calculateMonthStatus])

  const updateMonthStatus = useCallback(async (year: number, month: number) => {
    try {
      const status = await calculateMonthStatus(year, month)
      setMonthList((prev) =>
        prev.map((item) =>
          item.year === year && item.month === month
            ? {
                ...item,
                status: status.status,
                answeredCount: status.answeredCount,
                eventCount: status.eventCount
              }
            : item
        )
      )
    } catch (err) {
      console.error('月ステータスの更新に失敗:', err)
    }
  }, [calculateMonthStatus])

  return {
    monthList,
    loading,
    error,
    loadMonthList,
    updateMonthStatus
  }
}
