'use client'

import { useState } from 'react'
import { useQuery } from '@apollo/client/react'
import { gql } from '@apollo/client'

// チームの大会一覧を取得するクエリ
const GET_TEAM_COMPETITIONS = gql`
  query GetTeamCompetitions($teamId: ID!) {
    teamCompetitions(teamId: $teamId) {
      id
      title
      date
      place
      poolType
      note
      teamId
      isPersonal
      entryStatus
      createdAt
    }
  }
`

interface TeamCompetitionManagerProps {
  teamId: string
  teamName: string
}

export const TeamCompetitionManager: React.FC<TeamCompetitionManagerProps> = ({
  teamId,
  teamName
}) => {
  // データ取得
  const { data: competitionsData, loading: competitionsLoading } = useQuery(GET_TEAM_COMPETITIONS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  })

  // クエリは teamCompetitions を返す点に注意
  const competitions = (competitionsData as any)?.teamCompetitions || []

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    })
  }

  if (competitionsLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {teamName} - 大会記録管理
        </h2>
      </div>

      {/* 大会一覧 */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            大会スケジュール一覧
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {competitions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-400 text-4xl mb-4">🏆</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                大会スケジュールがありません
              </h3>
              <p className="text-gray-600">
                スケジュールタブで大会スケジュールを作成してください
              </p>
            </div>
          ) : (
            competitions.map((competition: any) => (
              <div key={competition.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          🏆 大会
                        </span>
                        {competition.entryStatus && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            competition.entryStatus === 'UPCOMING' ? 'bg-yellow-100 text-yellow-800' :
                            competition.entryStatus === 'OPEN' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {competition.entryStatus === 'UPCOMING' ? 'エントリー開始前' :
                             competition.entryStatus === 'OPEN' ? 'エントリー受付中' :
                             'エントリー終了'}
                          </span>
                        )}
                      </div>
                      
                      <h4 className="text-lg font-medium text-gray-900 mt-1">
                        {competition.title}
                      </h4>
                      
                      <div className="mt-1 text-sm text-gray-600">
                        <p><strong>日時:</strong> {formatDate(competition.date)}</p>
                        {competition.place && <p><strong>会場:</strong> {competition.place}</p>}
                        {competition.poolType !== undefined && (
                          <p><strong>プール:</strong> {competition.poolType === 0 ? '短水路 (25m)' : '長水路 (50m)'}</p>
                        )}
                        {competition.note && <p><strong>備考:</strong> {competition.note}</p>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right text-sm text-gray-500">
                      <p>作成: {formatDate(competition.createdAt)}</p>
                    </div>
                    <button
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                    >
                      記録一括登録
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">💡 大会記録管理について</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• 作成された大会の記録・タイムを一括登録できます</li>
          <li>• 「記録一括登録」ボタンから詳細記録を登録</li>
          <li>• 大会記録、スプリットタイムを効率的に管理</li>
          <li>• エントリー管理機能も自動的に有効になります</li>
        </ul>
      </div>
    </div>
  )
}
