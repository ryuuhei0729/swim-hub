'use client'

import React from 'react'
import { TeamAnnouncements } from '@/components/team'
import type { TeamMembership, Team } from '@apps/shared/types/database'

interface TeamAnnouncementsSectionProps {
  teams: Array<TeamMembership & { team?: Team }>
}

/**
 * チームのお知らせセクションコンポーネント
 * DashboardClientから分離
 */
export default function TeamAnnouncementsSection({ teams }: TeamAnnouncementsSectionProps) {
  if (teams.length === 0) {
    return null
  }

  return (
    <div className="mb-4 space-y-3">
      {teams.map((teamMembership) => (
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

            <div className="border-t border-gray-200">
              <TeamAnnouncements 
                teamId={teamMembership.team_id}
                isAdmin={teamMembership.role === 'admin'}
                viewOnly={true}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

