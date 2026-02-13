'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { addMonths, format } from 'date-fns'
import { notificationKeys } from './keys'

export interface UnansweredAttendance {
  teamId: string
  teamName: string
  eventId: string
  eventType: 'practice' | 'competition'
  eventName: string
  eventDate: string
}

export interface UnsubmittedEntry {
  teamId: string
  teamName: string
  competitionId: string
  competitionName: string
  competitionDate: string
}

interface TeamInfo {
  team_id: string
  team?: { name?: string }
}

/**
 * 出欠未回答の練習・大会を取得するクエリ
 */
export function useUnansweredAttendancesQuery(
  supabase: SupabaseClient,
  userId: string | undefined,
  teams: TeamInfo[]
) {
  const teamIds = teams.map(t => t.team_id)

  return useQuery<UnansweredAttendance[]>({
    queryKey: notificationKeys.unanswered(userId ?? '', teamIds),
    queryFn: async () => {
      const now = new Date()
      const oneMonthLater = addMonths(now, 1)
      const startDateStr = format(now, 'yyyy-MM-dd')
      const endDateStr = format(oneMonthLater, 'yyyy-MM-dd')

      // 全チームを並列で処理
      const results = await Promise.all(
        teams.map(async (team): Promise<UnansweredAttendance[]> => {
          const teamId = team.team_id
          const teamName = team.team?.name || 'チーム'

          // 練習と大会を並列で取得
          const [practicesResult, competitionsResult] = await Promise.all([
            supabase
              .from('practices')
              .select('id, title, date, attendance_status')
              .eq('team_id', teamId)
              .eq('attendance_status', 'open')
              .gte('date', startDateStr)
              .lte('date', endDateStr)
              .order('date', { ascending: true }),
            supabase
              .from('competitions')
              .select('id, title, date, attendance_status')
              .eq('team_id', teamId)
              .eq('attendance_status', 'open')
              .gte('date', startDateStr)
              .lte('date', endDateStr)
              .order('date', { ascending: true }),
          ])

          if (practicesResult.error || competitionsResult.error) {
            console.error(`チーム ${teamName} のデータ取得に失敗しました:`, practicesResult.error ?? competitionsResult.error)
            return []
          }

          const practices = practicesResult.data ?? []
          const competitions = competitionsResult.data ?? []

          // 出欠情報を並列で取得
          const practiceIds = practices.map(p => p.id)
          const competitionIds = competitions.map(c => c.id)

          const [practiceAttendances, competitionAttendances] = await Promise.all([
            practiceIds.length > 0
              ? supabase
                  .from('team_attendance')
                  .select('practice_id, status')
                  .eq('user_id', userId!)
                  .in('practice_id', practiceIds)
              : Promise.resolve({ data: [] as { practice_id: string; status: string | null }[], error: null }),
            competitionIds.length > 0
              ? supabase
                  .from('team_attendance')
                  .select('competition_id, status')
                  .eq('user_id', userId!)
                  .in('competition_id', competitionIds)
              : Promise.resolve({ data: [] as { competition_id: string; status: string | null }[], error: null }),
          ])

          if (practiceAttendances.error || competitionAttendances.error) {
            console.error(`チーム ${teamName} の出欠データ取得に失敗しました:`, practiceAttendances.error ?? competitionAttendances.error)
            return []
          }

          const practiceAttData = practiceAttendances.data ?? []
          const competitionAttData = competitionAttendances.data ?? []

          const items: UnansweredAttendance[] = []

          // 未回答の練習を追加
          for (const practice of practices) {
            const attendance = practiceAttData.find(a => a.practice_id === practice.id)
            if (!attendance || attendance.status === null) {
              items.push({
                teamId,
                teamName,
                eventId: practice.id,
                eventType: 'practice',
                eventName: practice.title || '練習',
                eventDate: practice.date,
              })
            }
          }

          // 未回答の大会を追加
          for (const competition of competitions) {
            const attendance = competitionAttData.find(a => a.competition_id === competition.id)
            if (!attendance || attendance.status === null) {
              items.push({
                teamId,
                teamName,
                eventId: competition.id,
                eventType: 'competition',
                eventName: competition.title || '大会',
                eventDate: competition.date,
              })
            }
          }

          return items
        })
      )

      return results.flat()
    },
    enabled: !!userId && teams.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * エントリー未提出の大会を取得するクエリ
 */
export function useUnsubmittedEntriesQuery(
  supabase: SupabaseClient,
  userId: string | undefined,
  teams: TeamInfo[]
) {
  const teamIds = teams.map(t => t.team_id)

  return useQuery<UnsubmittedEntry[]>({
    queryKey: notificationKeys.unsubmitted(userId ?? '', teamIds),
    queryFn: async () => {
      // 全チームを並列で処理
      const results = await Promise.all(
        teams.map(async (team): Promise<UnsubmittedEntry[]> => {
          const teamId = team.team_id
          const teamName = team.team?.name || 'チーム'

          const { data: openCompetitions, error: competitionsError } = await supabase
            .from('competitions')
            .select('id, title, date')
            .eq('team_id', teamId)
            .eq('entry_status', 'open')
            .order('date', { ascending: true })

          if (competitionsError) {
            console.error(`チーム ${teamName} の大会データ取得に失敗しました:`, competitionsError)
            return []
          }

          if (!openCompetitions || openCompetitions.length === 0) return []

          const competitionIds = openCompetitions.map(c => c.id)
          const { data: myEntries, error: entriesError } = await supabase
            .from('entries')
            .select('competition_id')
            .eq('user_id', userId!)
            .in('competition_id', competitionIds)

          if (entriesError) {
            console.error(`チーム ${teamName} のエントリーデータ取得に失敗しました:`, entriesError)
            return []
          }

          const submittedIds = new Set((myEntries ?? []).map(e => e.competition_id))

          const items: UnsubmittedEntry[] = []
          for (const competition of openCompetitions) {
            if (!submittedIds.has(competition.id)) {
              items.push({
                teamId,
                teamName,
                competitionId: competition.id,
                competitionName: competition.title || '大会',
                competitionDate: competition.date,
              })
            }
          }

          return items
        })
      )

      return results.flat()
    },
    enabled: !!userId && teams.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}
