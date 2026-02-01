'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { addMonthsImmutable, formatDate, toISODateString } from '@apps/shared/utils/date'
import { useAuth } from '@/contexts'
import { TeamAnnouncements } from '@/components/team'
import type { TeamMembership, Team } from '@apps/shared/types'

interface TeamAnnouncementsSectionProps {
  teams: Array<TeamMembership & { team?: Team }>
  openEntryLogForm: (competitionId: string) => void
  refreshKey?: number
}

interface UnansweredAttendance {
  teamId: string
  teamName: string
  eventId: string
  eventType: 'practice' | 'competition'
  eventName: string
  eventDate: string
}

interface UnsubmittedEntry {
  teamId: string
  teamName: string
  competitionId: string
  competitionName: string
  competitionDate: string
}

/**
 * チームのお知らせセクションコンポーネント
 * DashboardClientから分離
 */
export default function TeamAnnouncementsSection({ 
  teams, 
  openEntryLogForm,
  refreshKey
}: TeamAnnouncementsSectionProps) {
  const { supabase, user } = useAuth()
  const [unansweredAttendances, setUnansweredAttendances] = useState<UnansweredAttendance[]>([])
  const [unsubmittedEntries, setUnsubmittedEntries] = useState<UnsubmittedEntry[]>([])

  useEffect(() => {
    if (!user || teams.length === 0) {
      return
    }

    const loadNotifications = async () => {
      try {
        // 直近1ヶ月の日付範囲を計算（今日～1ヶ月後）
        const now = new Date()
        const oneMonthLater = addMonthsImmutable(now, 1)
        const startDateStr = toISODateString(now)
        const endDateStr = toISODateString(oneMonthLater)

        // 出欠未回答情報を取得
        const unansweredList: UnansweredAttendance[] = []

        for (const teamMembership of teams) {
          const teamId = teamMembership.team_id

          // 直近1ヶ月の練習を取得（出欠提出受付中のもののみ）
          const { data: practices, error: practicesError } = await supabase
            .from('practices')
            .select('id, title, date, attendance_status')
            .eq('team_id', teamId)
            .eq('attendance_status', 'open')
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .order('date', { ascending: true })

          if (practicesError) {
            console.error('練習の取得エラー:', practicesError)
            continue
          }

          // 直近1ヶ月の大会を取得（出欠提出受付中のもののみ）
          const { data: competitions, error: competitionsError } = await supabase
            .from('competitions')
            .select('id, title, date, attendance_status')
            .eq('team_id', teamId)
            .eq('attendance_status', 'open')
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .order('date', { ascending: true })

          if (competitionsError) {
            console.error('大会の取得エラー:', competitionsError)
            continue
          }

          // 練習の出欠情報を確認
          if (practices && practices.length > 0) {
            const practiceIds = practices.map(p => p.id)
            
            // 全ての出欠情報を取得
            const { data: allAttendances, error: allError } = await supabase
              .from('team_attendance')
              .select('practice_id, status')
              .eq('user_id', user.id)
              .in('practice_id', practiceIds)

            if (allError) {
              console.error('出欠情報の取得エラー:', allError)
            }

            // 未回答の練習をリストに追加（レコードが存在しない、またはstatusがnull）
            for (const practice of practices) {
              const attendance = allAttendances?.find(a => a.practice_id === practice.id)
              const isUnanswered = !attendance || attendance.status === null
              
              if (isUnanswered) {
                unansweredList.push({
                  teamId,
                  teamName: teamMembership.team?.name || 'チーム',
                  eventId: practice.id,
                  eventType: 'practice',
                  eventName: practice.title || '練習',
                  eventDate: practice.date
                })
              }
            }
          }

          // 大会の出欠情報を確認
          if (competitions && competitions.length > 0) {
            const competitionIds = competitions.map(c => c.id)
            
            // 全ての出欠情報を取得
            const { data: allAttendances, error: allError } = await supabase
              .from('team_attendance')
              .select('competition_id, status')
              .eq('user_id', user.id)
              .in('competition_id', competitionIds)

            if (allError) {
              console.error('出欠情報の取得エラー:', allError)
            }

            // 未回答の大会をリストに追加（レコードが存在しない、またはstatusがnull）
            for (const competition of competitions) {
              const attendance = allAttendances?.find(a => a.competition_id === competition.id)
              const isUnanswered = !attendance || attendance.status === null
              
              if (isUnanswered) {
                unansweredList.push({
                  teamId,
                  teamName: teamMembership.team?.name || 'チーム',
                  eventId: competition.id,
                  eventType: 'competition',
                  eventName: competition.title || '大会',
                  eventDate: competition.date
                })
              }
            }
          }
        }

        setUnansweredAttendances(unansweredList)

        // エントリー未提出情報を取得
        const unsubmittedList: UnsubmittedEntry[] = []

        for (const teamMembership of teams) {
          const teamId = teamMembership.team_id

          // エントリー受付中の大会を取得
          const { data: openCompetitions, error: compsError } = await supabase
            .from('competitions')
            .select('id, title, date')
            .eq('team_id', teamId)
            .eq('entry_status', 'open')
            .order('date', { ascending: true })

          if (compsError) {
            console.error('大会の取得エラー:', compsError)
            continue
          }

          if (openCompetitions && openCompetitions.length > 0) {
            const competitionIds = openCompetitions.map(c => c.id)

            // 自分のエントリーを取得
            const { data: myEntries, error: entriesError } = await supabase
              .from('entries')
              .select('competition_id')
              .eq('user_id', user.id)
              .in('competition_id', competitionIds)

            if (!entriesError && myEntries) {
              const submittedCompetitionIds = new Set(myEntries.map(e => e.competition_id))
              for (const competition of openCompetitions) {
                if (!submittedCompetitionIds.has(competition.id)) {
                  unsubmittedList.push({
                    teamId,
                    teamName: teamMembership.team?.name || 'チーム',
                    competitionId: competition.id,
                    competitionName: competition.title || '大会',
                    competitionDate: competition.date
                  })
                }
              }
            }
          }
        }

        setUnsubmittedEntries(unsubmittedList)
      } catch (error) {
        console.error('お知らせ情報の取得エラー:', error)
      }
    }

    loadNotifications()
  }, [teams, supabase, user, refreshKey])

  if (teams.length === 0) {
    return null
  }

  return (
    <div className="mb-4 space-y-3">
      {/* チームのお知らせセクション */}
      {teams.map((teamMembership) => {
        const teamId = teamMembership.team_id
        const teamUnansweredAttendances = unansweredAttendances.filter(
          (attendance) => attendance.teamId === teamId
        )
        const teamUnsubmittedEntries = unsubmittedEntries.filter(
          (entry) => entry.teamId === teamId
        )
        const hasTeamNotifications = teamUnansweredAttendances.length > 0 || teamUnsubmittedEntries.length > 0

        return (
        <div key={teamMembership.team_id} className="bg-white rounded-lg shadow">
          <div className="px-4 py-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {teamMembership.team?.name} のお知らせ
              </h2>
              {teamMembership.role === 'admin' && (
                <span className="text-xs text-gray-500">管理者</span>
              )}
            </div>

              <div className="space-y-3">
                {/* 出欠未回答 */}
                {teamUnansweredAttendances.length > 0 && (
                  <div>
                    <Link
                      href={`/teams/${teamId}?tab=attendance`}
                      className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      直近1ヶ月で出欠が未回答の練習・大会があります。（{teamUnansweredAttendances.length}件）
                    </Link>
                  </div>
                )}

                {/* エントリー未提出 */}
                {teamUnsubmittedEntries.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      エントリー未提出 ({teamUnsubmittedEntries.length}件)
                    </h3>
                    <ul className="space-y-1">
                      {teamUnsubmittedEntries.map((entry) => (
                        <li key={entry.competitionId}>
                          <button
                            onClick={() => openEntryLogForm(entry.competitionId)}
                            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <span>{entry.competitionName}</span>
                            {' '}
                            <span className="text-gray-500">
                              ({formatDate(entry.competitionDate, 'short')})
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* チームのお知らせ */}
                <div className={hasTeamNotifications ? 'border-t border-gray-200 pt-3' : ''}>
                  <TeamAnnouncements 
                    teamId={teamMembership.team_id}
                    isAdmin={teamMembership.role === 'admin'}
                    viewOnly={true}
                    hideEmptyMessage={hasTeamNotifications}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

