'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@apollo/client/react'
import { TeamAnnouncements } from '@/components/team'
import { useAuth } from '@/contexts'
import { GET_MY_TEAMS } from '@/graphql'

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'ADMIN' | 'USER'>('USER')

  // ユーザーのチーム一覧を取得
  const { data: teamsData, loading: teamsLoading } = useQuery(GET_MY_TEAMS, {
    skip: !user,
    fetchPolicy: 'cache-and-network'
  })

  const teams = (teamsData as any)?.myTeams || []

  // チーム選択時にユーザーの役割を設定
  useEffect(() => {
    if (selectedTeamId && teams.length > 0) {
      const selectedTeam = teams.find((t: any) => t.teamId === selectedTeamId)
      if (selectedTeam) {
        setUserRole(selectedTeam.role)
      }
    }
  }, [selectedTeamId, teams])

  if (teamsLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          お知らせ
        </h1>
        <p className="text-gray-600">
          チームのお知らせを確認・管理します。
        </p>
      </div>

      {/* チーム選択 */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              参加しているチームがありません
            </p>
            <p className="text-sm text-gray-400">
              チームに参加すると、お知らせを確認できるようになります
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* チーム選択セクション */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              チームを選択
            </h2>
            <div className="space-y-3">
              {teams.map((teamMembership: any) => (
                <div
                  key={teamMembership.teamId}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedTeamId === teamMembership.teamId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedTeamId(teamMembership.teamId)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {teamMembership.team.name}
                      </h3>
                      {teamMembership.team.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {teamMembership.team.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          teamMembership.role === 'ADMIN'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {teamMembership.role === 'ADMIN' ? '管理者' : 'メンバー'}
                        </span>
                        <span className="text-xs text-gray-500">
                          参加日: {new Date(teamMembership.team.createdAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                    </div>
                    {selectedTeamId === teamMembership.teamId && (
                      <div className="text-blue-600">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* お知らせ表示 */}
          {selectedTeamId && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {teams.find((t: any) => t.teamId === selectedTeamId)?.team.name} のお知らせ
              </h2>
              <TeamAnnouncements 
                teamId={selectedTeamId}
                isAdmin={userRole === 'ADMIN'}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
