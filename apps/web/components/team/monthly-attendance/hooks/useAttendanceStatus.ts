'use client'

import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAttendanceWithDetails } from '@swim-hub/shared'
import { TeamEvent } from '@swim-hub/shared/types'
import { TeamAttendancesAPI } from '@apps/shared/api/teams/attendances'
import { fetchTeamMembers, TeamMember } from '@swim-hub/shared/utils/team'

export const useAttendanceStatus = (
  teamId: string,
  supabase: SupabaseClient,
  attendancesAPI: TeamAttendancesAPI
) => {
  const [attendanceData, setAttendanceData] = useState<TeamAttendanceWithDetails[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAttendanceData = useCallback(async (event: TeamEvent) => {
    try {
      setLoading(true)

      const attendances = event.type === 'practice'
        ? await attendancesAPI.listByPractice(event.id)
        : await attendancesAPI.listByCompetition(event.id)
      setAttendanceData(attendances)

      const members = await fetchTeamMembers(supabase, teamId)
      setTeamMembers(members)
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
      setError('出欠情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase, attendancesAPI])

  return {
    attendanceData,
    teamMembers,
    loading,
    error,
    loadAttendanceData
  }
}
