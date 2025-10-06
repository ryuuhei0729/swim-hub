'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import { gql } from '@apollo/client'
import { GET_TEAM_PRACTICES, GET_TEAM_COMPETITIONS } from '../../graphql/queries/teams'

// チームのスケジュールを取得するクエリ（練習と大会を同時に取得）
const GET_TEAM_SCHEDULES = gql`
  query GetTeamSchedules($teamId: ID!) {
    teamPractices(teamId: $teamId) {
      id
      date
      place
      note
      teamId
      isPersonal
      createdAt
    }
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

// デバッグ用：チームメンバーシップ確認
const GET_MY_TEAMS_DEBUG = gql`
  query GetMyTeamsDebug {
    myTeams {
      id
      teamId
      userId
      role
      isActive
      team {
        id
        name
        description
      }
    }
  }
`

// 一括練習作成ミューテーション
const BULK_CREATE_TEAM_PRACTICES = gql`
  mutation BulkCreateTeamPractices($teamId: ID!, $inputs: [CreatePracticeInput!]!) {
    bulkCreateTeamPractices(teamId: $teamId, inputs: $inputs) {
      id
      date
      place
      note
      teamId
      isPersonal
      createdAt
    }
  }
`

// 一括大会作成ミューテーション
const BULK_CREATE_TEAM_COMPETITIONS = gql`
  mutation BulkCreateTeamCompetitions($teamId: ID!, $inputs: [CreateCompetitionInput!]!) {
    bulkCreateTeamCompetitions(teamId: $teamId, inputs: $inputs) {
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

interface TeamScheduleManagerProps {
  teamId: string
  teamName: string
}

export const TeamScheduleManager: React.FC<TeamScheduleManagerProps> = ({
  teamId,
  teamName
}) => {
  const [viewType, setViewType] = useState<'calendar' | 'list' | 'create'>('create')
  const [activeTab, setActiveTab] = useState<'practice' | 'competition'>('practice')
  
  // スケジュール作成用の状態
  const [practices, setPractices] = useState<Array<{
    date: string
    place: string
    note: string
  }>>([{ date: '', place: '', note: '' }])

  const [competitions, setCompetitions] = useState<Array<{
    title: string
    date: string
    place: string
    poolType: number
    note: string
  }>>([{ title: '', date: '', place: '', poolType: 0, note: '' }])
  
  const { data, loading, error, refetch } = useQuery(GET_TEAM_SCHEDULES, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  })

  // デバッグ用：チームメンバーシップ確認
  const { data: teamsData } = useQuery(GET_MY_TEAMS_DEBUG, {
    fetchPolicy: 'cache-and-network'
  })

  // デバッグ用：データの変化を監視
  useEffect(() => {
    console.log('GET_TEAM_SCHEDULES data changed:', {
      loading,
      error: error?.message,
      data,
      teamId
    })
  }, [data, loading, error, teamId])

  useEffect(() => {
    if (teamsData) {
      console.log('GET_MY_TEAMS_DEBUG data:', teamsData)
      const currentTeamMembership = (teamsData as any)?.myTeams?.find((t: any) => t.teamId === teamId)
      console.log('Current team membership:', currentTeamMembership)
    }
  }, [teamsData, teamId])

  const [bulkCreateTeamPractices, { loading: isSubmittingPractices }] = useMutation(BULK_CREATE_TEAM_PRACTICES, {
    onCompleted: (data: any) => {
      alert(`${data.bulkCreateTeamPractices.length}件の練習を登録しました！`)
      setPractices([{ date: '', place: '', note: '' }])
      refetch()
    },
    onError: (error) => {
      console.error('一括練習登録エラー:', error)
      alert('練習の登録に失敗しました')
    }
  })

  const [bulkCreateTeamCompetitions, { loading: isSubmittingCompetitions }] = useMutation(BULK_CREATE_TEAM_COMPETITIONS, {
    onCompleted: (data: any) => {
      alert(`${data.bulkCreateTeamCompetitions.length}件の大会を登録しました！`)
      setCompetitions([{ title: '', date: '', place: '', poolType: 0, note: '' }])
      refetch()
    },
    onError: (error) => {
      console.error('一括大会登録エラー:', error)
      alert('大会の登録に失敗しました')
    }
  })

  const existingPractices = (data as any)?.teamPractices || []
  const existingCompetitions = (data as any)?.teamCompetitions || []
  
  // デバッグ用ログ（一時的）
  console.log('TeamScheduleManager Data:', {
    teamId,
    data,
    teamPractices: (data as any)?.teamPractices,
    teamCompetitions: (data as any)?.teamCompetitions,
    existingPractices,
    existingCompetitions,
    practicesCount: existingPractices.length,
    competitionsCount: existingCompetitions.length
  })

  // 日付順でソート
  const allSchedules = [
    ...existingPractices.map((p: any) => ({ ...p, type: 'practice' as const })),
    ...existingCompetitions.map((c: any) => ({ ...c, type: 'competition' as const }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    })
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 練習作成用のヘルパー関数
  const addPracticeRow = () => {
    setPractices([...practices, { date: '', place: '', note: '' }])
  }

  const removePracticeRow = (index: number) => {
    if (practices.length > 1) {
      setPractices(practices.filter((_, i) => i !== index))
    }
  }

  const updatePractice = (index: number, field: string, value: string) => {
    const updated = practices.map((practice, i) => 
      i === index ? { ...practice, [field]: value } : practice
    )
    setPractices(updated)
  }

  // 大会作成用のヘルパー関数
  const addCompetitionRow = () => {
    setCompetitions([...competitions, { title: '', date: '', place: '', poolType: 0, note: '' }])
  }

  const removeCompetitionRow = (index: number) => {
    if (competitions.length > 1) {
      setCompetitions(competitions.filter((_, i) => i !== index))
    }
  }

  const updateCompetition = (index: number, field: string, value: string | number) => {
    const updated = competitions.map((competition, i) => 
      i === index ? { ...competition, [field]: value } : competition
    )
    setCompetitions(updated)
  }

  // 練習一括作成
  const handleCreatePractices = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validPractices = practices.filter(p => p.date.trim())
    
    if (validPractices.length === 0) {
      alert('少なくとも1つの練習を入力してください')
      return
    }

    try {
      await bulkCreateTeamPractices({
        variables: {
          teamId,
          inputs: validPractices
        }
      })
    } catch (error) {
      console.error('練習登録エラー:', error)
    }
  }

  // 大会一括作成
  const handleCreateCompetitions = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validCompetitions = competitions.filter(c => c.title.trim() && c.date.trim())
    
    if (validCompetitions.length === 0) {
      alert('少なくとも1つの大会を入力してください')
      return
    }

    try {
      await bulkCreateTeamCompetitions({
        variables: {
          teamId,
          inputs: validCompetitions
        }
      })
    } catch (error) {
      console.error('大会登録エラー:', error)
    }
  }

  if (loading) {
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

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">スケジュールの読み込みに失敗しました</p>
        <button 
          onClick={() => refetch()}
          className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          再試行
        </button>
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {teamName} - スケジュール管理
        </h2>
        
        <div className="flex gap-2">
          <button
            onClick={() => setViewType('list')}
            className={`px-3 py-1 text-sm rounded ${
              viewType === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            リスト表示
          </button>
          <button
            onClick={() => setViewType('calendar')}
            className={`px-3 py-1 text-sm rounded ${
              viewType === 'calendar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            カレンダー表示
          </button>
          <button
            onClick={() => setViewType('create')}
            className={`px-4 py-2 text-sm font-medium rounded-md border ${
              viewType === 'create'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
            }`}
          >
            ➕ スケジュール作成
          </button>
        </div>
      </div>

      {/* 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-blue-600 text-2xl mr-3">🏊</div>
            <div>
              <p className="text-sm text-blue-600 font-medium">練習</p>
              <p className="text-2xl font-bold text-blue-800">{existingPractices.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-green-600 text-2xl mr-3">🏆</div>
            <div>
              <p className="text-sm text-green-600 font-medium">大会</p>
              <p className="text-2xl font-bold text-green-800">{existingCompetitions.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-purple-600 text-2xl mr-3">📅</div>
            <div>
              <p className="text-sm text-purple-600 font-medium">総計</p>
              <p className="text-2xl font-bold text-purple-800">{allSchedules.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 作成ビュー */}
      {viewType === 'create' && (
        <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-blue-900">
                スケジュール一括作成
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                チームの練習・大会スケジュールを一括で作成します
              </p>
            </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('practice')}
                  className={`px-3 py-1 text-sm rounded ${
                    activeTab === 'practice'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  🏊 練習
                </button>
                <button
                  onClick={() => setActiveTab('competition')}
                  className={`px-3 py-1 text-sm rounded ${
                    activeTab === 'competition'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  🏆 大会
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {activeTab === 'practice' && (
              <form onSubmit={handleCreatePractices} className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-700">
                      練習スケジュール一括作成
                    </h4>
                    <button
                      type="button"
                      onClick={addPracticeRow}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      + 行を追加
                    </button>
                  </div>

                  <div className="space-y-3">
                    {practices.map((practice, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-white rounded border">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            日付 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={practice.date}
                            onChange={(e) => updatePractice(index, 'date', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            required
                          />
                        </div>
                        
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            場所
                          </label>
                          <input
                            type="text"
                            value={practice.place}
                            onChange={(e) => updatePractice(index, 'place', e.target.value)}
                            placeholder="練習場所"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div className="flex-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            備考
                          </label>
                          <input
                            type="text"
                            value={practice.note}
                            onChange={(e) => updatePractice(index, 'note', e.target.value)}
                            placeholder="練習内容やメモ"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div className="flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => removePracticeRow(index)}
                            disabled={practices.length === 1}
                            className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPractices([{ date: '', place: '', note: '' }])}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    リセット
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPractices}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmittingPractices ? '登録中...' : '練習を一括作成'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'competition' && (
              <form onSubmit={handleCreateCompetitions} className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-700">
                      大会スケジュール一括作成
                    </h4>
                    <button
                      type="button"
                      onClick={addCompetitionRow}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      + 行を追加
                    </button>
                  </div>

                  <div className="space-y-3">
                    {competitions.map((competition, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-white rounded border">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            大会名 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={competition.title}
                            onChange={(e) => updateCompetition(index, 'title', e.target.value)}
                            placeholder="大会名"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            required
                          />
                        </div>
                        
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            開催日 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={competition.date}
                            onChange={(e) => updateCompetition(index, 'date', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            required
                          />
                        </div>
                        
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            会場
                          </label>
                          <input
                            type="text"
                            value={competition.place}
                            onChange={(e) => updateCompetition(index, 'place', e.target.value)}
                            placeholder="会場名"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            プール種別
                          </label>
                          <select
                            value={competition.poolType}
                            onChange={(e) => updateCompetition(index, 'poolType', parseInt(e.target.value))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value={0}>短水路 (25m)</option>
                            <option value={1}>長水路 (50m)</option>
                          </select>
                        </div>
                        
                        <div className="flex-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            備考
                          </label>
                          <input
                            type="text"
                            value={competition.note}
                            onChange={(e) => updateCompetition(index, 'note', e.target.value)}
                            placeholder="大会の詳細やメモ"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div className="flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => removeCompetitionRow(index)}
                            disabled={competitions.length === 1}
                            className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCompetitions([{ title: '', date: '', place: '', poolType: 0, note: '' }])}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    リセット
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCompetitions}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmittingCompetitions ? '登録中...' : '大会を一括作成'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* スケジュール一覧 */}
      {viewType !== 'create' && (
        <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            スケジュール一覧
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {allSchedules.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-400 text-4xl mb-4">📅</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                スケジュールがありません
              </h3>
              <p className="text-gray-600">
                練習や大会のスケジュールが登録されていません
              </p>
            </div>
          ) : (
            allSchedules.map((schedule: any) => (
              <div key={`${schedule.type}-${schedule.id}`} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${
                      schedule.type === 'practice' ? 'bg-blue-500' : 'bg-green-500'
                    }`}></div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          schedule.type === 'practice'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {schedule.type === 'practice' ? '🏊 練習' : '🏆 大会'}
                        </span>
                        {schedule.type === 'competition' && schedule.entryStatus && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            schedule.entryStatus === 'UPCOMING' ? 'bg-yellow-100 text-yellow-800' :
                            schedule.entryStatus === 'OPEN' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {schedule.entryStatus === 'UPCOMING' ? 'エントリー開始前' :
                             schedule.entryStatus === 'OPEN' ? 'エントリー受付中' :
                             'エントリー終了'}
                          </span>
                        )}
                      </div>
                      
                      <h4 className="text-lg font-medium text-gray-900 mt-1">
                        {schedule.type === 'practice' ? '練習' : schedule.title}
                      </h4>
                      
                      <div className="mt-1 text-sm text-gray-600">
                        <p><strong>日時:</strong> {formatDate(schedule.date)}</p>
                        {schedule.place && <p><strong>場所:</strong> {schedule.place}</p>}
                        {schedule.type === 'competition' && schedule.poolType !== undefined && (
                          <p><strong>プール:</strong> {schedule.poolType === 0 ? '短水路 (25m)' : '長水路 (50m)'}</p>
                        )}
                        {schedule.note && <p><strong>備考:</strong> {schedule.note}</p>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right text-sm text-gray-500">
                    <p>作成: {formatDate(schedule.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">💡 スケジュール管理について</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• 「スケジュール作成」で練習・大会の基本情報を一括作成</li>
          <li>• 「練習管理」タブで作成された練習の詳細記録を一括登録</li>
          <li>• 「大会管理」タブで作成された大会の記録・タイムを一括登録</li>
          <li>• 作成されたスケジュールは自動的に出欠・エントリー管理機能が付与されます</li>
        </ul>
      </div>
    </div>
  )
}
