'use client'

import React from 'react'
import Link from 'next/link'
import { UsersIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { TeamMembershipWithUser } from '@apps/shared/types'

interface AdminTeamsClientProps {
  // サーバー側で取得したデータ
  initialTeams: TeamMembershipWithUser[]
}

/**
 * 管理者チーム一覧ページのインタラクティブ部分を担当するClient Component
 */
export default function AdminTeamsClient({
  initialTeams
}: AdminTeamsClientProps) {
  // 表示用のデータ
  const displayTeams = initialTeams

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            チーム管理
          </h1>
          <p className="text-gray-600">
            管理者権限を持つチームの一覧
          </p>
        </div>
      </div>

      {/* チーム一覧 */}
      {displayTeams.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <ShieldCheckIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            管理権限を持つチームがありません
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            チームを作成すると、自動的に管理者権限が付与されます
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayTeams.map((membership) => (
            <Link
              key={membership.team_id}
              href={`/teams-admin/${membership.team_id}`}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <UsersIcon className="h-10 w-10 text-blue-600" />
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    管理者
                  </span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {'teams' in membership ? membership.teams?.name : ''}
                </h3>
                {'teams' in membership && membership.teams?.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {membership.teams.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}


