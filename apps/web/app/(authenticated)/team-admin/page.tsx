'use client'

import React, { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import { GET_MY_TEAMS } from '@/graphql'
import { TeamPracticeManager, TeamCompetitionManager, TeamScheduleManager } from '@/components/team'

export default function TeamAdminPage() {
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [activeSection, setActiveSection] = useState<'practices' | 'competitions' | 'schedules'>('practices')

  // ユーザーのチーム一覧を取得
  const { data: teamsData, loading: teamsLoading } = useQuery(GET_MY_TEAMS, {
    fetchPolicy: 'cache-and-network'
  })

  const myTeams = (teamsData as any)?.myTeams || []
  
  // 管理者権限を持つチームのみをフィルタリング
  const adminTeams = myTeams.filter((membership: any) => 
    membership.role === 'ADMIN' && membership.isActive
  )

  // 管理者権限を持つチームが存在し、選択されていない場合は最初のチームをデフォルト選択
  React.useEffect(() => {
    if (adminTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(adminTeams[0].teamId)
    }
  }, [adminTeams, selectedTeamId])

  const selectedTeam = adminTeams.find((membership: any) => 
    membership.teamId === selectedTeamId
  )

  if (teamsLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              チーム統合管理
            </h1>
            <p className="text-gray-600">
              チームの練習・大会・スケジュールを一括管理します
            </p>
          </div>
        </div>
      </div>

      {/* チーム選択 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              管理するチームを選択 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">チームを選択してください</option>
              {adminTeams.map((membership: any) => (
                <option key={membership.teamId} value={membership.teamId}>
                  {membership.team?.name || 'チーム名不明'}
                </option>
              ))}
            </select>
          </div>

          {adminTeams.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                管理者権限を持つチームがありません。チームの管理者として招待される必要があります。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 選択されたチームの管理機能 */}
      {selectedTeamId && selectedTeam && (
        <>
          {/* チーム情報表示 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  選択中: {selectedTeam.team?.name}
                </h2>
                {selectedTeam.team?.description && (
                  <p className="text-gray-600 text-sm">
                    {selectedTeam.team.description}
                  </p>
                )}
              </div>
              <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                管理者権限
              </span>
            </div>
          </div>

          {/* 管理機能セクション */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6">
                {[
                  { id: 'practices', name: '練習管理', icon: '🏊' },
                  { id: 'competitions', name: '大会管理', icon: '🏆' },
                  { id: 'schedules', name: 'スケジュール', icon: '📅' }
                ].map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id as any)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeSection === section.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span className="mr-2">{section.icon}</span>
                    {section.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* セクションコンテンツ */}
            <div className="p-6">
              {activeSection === 'practices' && (
                <TeamPracticeManager 
                  teamId={selectedTeamId}
                  teamName={selectedTeam.team?.name}
                />
              )}
              
              {activeSection === 'competitions' && (
                <TeamCompetitionManager 
                  teamId={selectedTeamId}
                  teamName={selectedTeam.team?.name}
                />
              )}
              
              {activeSection === 'schedules' && (
                <TeamScheduleManager 
                  teamId={selectedTeamId}
                  teamName={selectedTeam.team?.name}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* チームが選択されていない場合 */}
      {!selectedTeamId && adminTeams.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">🏊‍♂️</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              チームを選択してください
            </h3>
            <p className="text-gray-600">
              上記のドロップダウンから管理したいチームを選択してください
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
