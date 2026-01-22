import { useState, useCallback, useMemo } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAttendancesAPI } from '@apps/shared/api/teams/attendances'
import { TeamAttendanceWithDetails, TeamEvent } from '@swim-hub/shared/types'
import { fetchTeamMembers, TeamMember } from '@swim-hub/shared/utils/team'

export function useAttendanceModal(supabase: SupabaseClient, teamId: string) {
  const attendancesAPI = useMemo(() => new TeamAttendancesAPI(supabase), [supabase])

  const [isOpen, setIsOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<TeamEvent | null>(null)
  const [attendanceData, setAttendanceData] = useState<TeamAttendanceWithDetails[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAttendanceData = useCallback(async (event: TeamEvent) => {
    try {
      setLoading(true)
      setError(null)

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

  const openModal = useCallback(async (event: TeamEvent) => {
    setSelectedEvent(event)
    setIsOpen(true)
    await loadAttendanceData(event)
  }, [loadAttendanceData])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    setSelectedEvent(null)
    setAttendanceData([])
    setTeamMembers([])
    setError(null)
  }, [])

  return {
    isOpen,
    selectedEvent,
    attendanceData,
    teamMembers,
    loading,
    error,
    openModal,
    closeModal
  }
}
