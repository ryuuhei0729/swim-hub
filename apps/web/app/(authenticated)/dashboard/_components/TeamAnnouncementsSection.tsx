'use client'

import React from 'react'
import Link from 'next/link'
import { formatDate } from '@apps/shared/utils/date'
import { useAuth } from '@/contexts'
import { TeamAnnouncements } from '@/components/team/TeamAnnouncements'
import { useUnansweredAttendancesQuery, useUnsubmittedEntriesQuery } from '@apps/shared/hooks/queries/notifications'
import type { TeamMembership, Team } from '@apps/shared/types'

interface TeamAnnouncementsSectionProps {
  teams: Array<TeamMembership & { team?: Team }>
  openEntryLogForm: (competitionId: string) => void
  refreshKey?: number
}

/**
 * チームのお知らせセクションコンポーネント
 * DashboardClientから分離
 */
export default function TeamAnnouncementsSection({
  teams,
  openEntryLogForm,
}: TeamAnnouncementsSectionProps) {
  const { supabase, user } = useAuth()

  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(supabase, user?.id, teams)
  const { data: unsubmittedEntries = [] } = useUnsubmittedEntriesQuery(supabase, user?.id, teams)

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
