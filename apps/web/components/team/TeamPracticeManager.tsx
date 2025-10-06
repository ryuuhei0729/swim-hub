'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import { gql } from '@apollo/client'
import { GET_TEAM_PRACTICES, GET_TEAM_MEMBERS } from '../../graphql/queries/teams'
import { CREATE_TEAM_PRACTICE } from '../../graphql/mutations/teamPractices'

// スタイル一覧を取得するクエリ
const GET_STYLES = gql`
  query GetStyles {
    styles {
      id
      name
    }
  }
`

// 一括練習ログ登録ミューテーション（後で実装）
const BULK_CREATE_PRACTICE_LOGS = gql`
  mutation BulkCreatePracticeLogs($inputs: [CreatePracticeLogInput!]!) {
    bulkCreatePracticeLogs(inputs: $inputs) {
      id
      practiceId
      userId
      distance
      sets
      reps
      circle
      styleId
      tags
      times
      createdAt
    }
  }
`

interface TeamPracticeManagerProps {
  teamId: string
  teamName: string
}

export const TeamPracticeManager: React.FC<TeamPracticeManagerProps> = ({
  teamId,
  teamName
}) => {
  // モーダル表示制御
  const [isPracticeModalOpen, setIsPracticeModalOpen] = useState(false)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false)
  const [selectedPractice, setSelectedPractice] = useState<any>(null)
  
  // 練習作成フォーム用の状態
  const [practiceForm, setPracticeForm] = useState({
    date: new Date().toISOString().split('T')[0],
    place: '',
    note: ''
  })

  // 練習ログ登録用の状態
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [practiceLogConfig, setPracticeLogConfig] = useState({
    distance: '',
    sets: 1,
    reps: 1,
    circle: '',
    styleId: '',
    tags: [] as string[]
  })

  // タイム入力用の状態
  const [practiceTimes, setPracticeTimes] = useState<Record<string, Record<string, string>>>({})

  // データ取得
  const { data: practicesData, loading: practicesLoading, error: practicesError, refetch: refetchPractices } = useQuery(GET_TEAM_PRACTICES, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  })

  const { data: membersData, loading: membersLoading } = useQuery(GET_TEAM_MEMBERS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  })

  const { data: stylesData } = useQuery(GET_STYLES, {
    fetchPolicy: 'cache-and-network'
  })

  const [createTeamPractice, { loading: isCreatingPractice }] = useMutation(CREATE_TEAM_PRACTICE, {
    onCompleted: () => {
      alert('チーム練習を登録しました！')
      setIsPracticeModalOpen(false)
      setPracticeForm({
        date: new Date().toISOString().split('T')[0],
        place: '',
        note: ''
      })
      refetchPractices()
    },
    onError: (error) => {
      console.error('チーム練習登録エラー:', error)
      alert('練習の登録に失敗しました')
    }
  })

  const [bulkCreatePracticeLogs, { loading: isSubmittingLogs }] = useMutation(BULK_CREATE_PRACTICE_LOGS, {
    onCompleted: (data: any) => {
      alert(`${data.bulkCreatePracticeLogs.length}件の練習ログを登録しました！`)
      setIsLogModalOpen(false)
      setIsTimeModalOpen(false)
      setSelectedPractice(null)
      setSelectedUsers([])
      setPracticeTimes({})
      refetchPractices()
    },
    onError: (error) => {
      console.error('一括練習ログ登録エラー:', error)
      alert('練習ログの登録に失敗しました')
    }
  })

  const practices = (practicesData as any)?.teamPractices || []
  const members = (membersData as any)?.teamMembers || []
  const styles = (stylesData as any)?.styles || []

  // 練習作成ハンドラー
  const handleCreatePractice = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await createTeamPractice({
        variables: {
          input: {
            date: practiceForm.date,
            place: practiceForm.place,
            note: practiceForm.note,
            teamId: teamId
          }
        }
      })
    } catch (error) {
      console.error('練習作成エラー:', error)
    }
  }


  // 練習ログ登録モーダルを開く
  const openLogModal = (practice: any) => {
    setSelectedPractice(practice)
    setIsLogModalOpen(true)
    // 状態をリセット
    setSelectedUsers([])
    setPracticeLogConfig({
      distance: '',
      sets: 1,
      reps: 1,
      circle: '',
      styleId: '',
      tags: []
    })
    setPracticeTimes({})
  }

  // タイム入力モーダルを開く
  const openTimeModal = () => {
    if (selectedUsers.length === 0) {
      alert('登録するユーザーを選択してください')
      return
    }
    setIsTimeModalOpen(true)
    
    // タイム入力用の初期状態を設定
    const initialTimes: Record<string, Record<string, string>> = {}
    selectedUsers.forEach(userId => {
      initialTimes[userId] = {}
      for (let set = 1; set <= practiceLogConfig.sets; set++) {
        for (let rep = 1; rep <= practiceLogConfig.reps; rep++) {
          initialTimes[userId][`${set}-${rep}`] = ''
        }
      }
    })
    setPracticeTimes(initialTimes)
  }

  // タイムを更新
  const updateTime = (userId: string, setRep: string, time: string) => {
    setPracticeTimes(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [setRep]: time
      }
    }))
  }

  // 練習ログを一括登録
  const handleSubmitLogs = async () => {
    if (selectedUsers.length === 0) {
      alert('登録するユーザーを選択してください')
      return
    }

    const inputs = selectedUsers.map(userId => ({
      practiceId: selectedPractice.id,
      userId,
      distance: parseInt(practiceLogConfig.distance),
      sets: practiceLogConfig.sets,
      reps: practiceLogConfig.reps,
      circle: practiceLogConfig.circle,
      styleId: practiceLogConfig.styleId,
      tags: practiceLogConfig.tags,
      times: Object.entries(practiceTimes[userId] || {}).map(([setRep, time]) => ({
        setRep,
        time: time || null
      }))
    }))

    try {
      await bulkCreatePracticeLogs({
        variables: { inputs }
      })
    } catch (error) {
      console.error('練習ログ登録エラー:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    })
  }

  if (practicesLoading || membersLoading) {
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
          {teamName} - 練習ログ管理
        </h2>
        <button
          onClick={() => setIsPracticeModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <span className="mr-2">+</span>
          練習を追加
        </button>
      </div>

      {/* 練習一覧 */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            練習スケジュール一覧
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {practices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-400 text-4xl mb-4">🏊</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                練習スケジュールがありません
              </h3>
              <p className="text-gray-600">
                スケジュールタブで練習スケジュールを作成してください
              </p>
            </div>
          ) : (
            practices.map((practice: any) => (
              <div key={practice.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          🏊 練習
                        </span>
                      </div>
                      
                      <h4 className="text-lg font-medium text-gray-900 mt-1">
                        練習
                      </h4>
                      
                      <div className="mt-1 text-sm text-gray-600">
                        <p><strong>日時:</strong> {formatDate(practice.date)}</p>
                        {practice.place && <p><strong>場所:</strong> {practice.place}</p>}
                        {practice.note && <p><strong>備考:</strong> {practice.note}</p>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right text-sm text-gray-500">
                      <p>作成: {formatDate(practice.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => openLogModal(practice)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                    >
                      練習ログ一括登録
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 練習ログ登録モーダル */}
      {isLogModalOpen && selectedPractice && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  練習ログ一括登録
                </h3>
                <button
                  onClick={() => setIsLogModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">
                  <strong>練習:</strong> {formatDate(selectedPractice.date)} {selectedPractice.place && `@ ${selectedPractice.place}`}
                </p>
              </div>

              <div className="space-y-4">
                {/* ユーザー選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    登録するメンバー <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-gray-300 rounded p-2">
                    {members.map((member: any) => (
                      <label key={member.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(member.userId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers([...selectedUsers, member.userId])
                            } else {
                              setSelectedUsers(selectedUsers.filter(id => id !== member.userId))
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{member.user.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 練習設定 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      距離 (m) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={practiceLogConfig.distance}
                      onChange={(e) => setPracticeLogConfig(prev => ({ ...prev, distance: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: 100"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      セット数
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={practiceLogConfig.sets}
                      onChange={(e) => setPracticeLogConfig(prev => ({ ...prev, sets: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      本数
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={practiceLogConfig.reps}
                      onChange={(e) => setPracticeLogConfig(prev => ({ ...prev, reps: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      サークル
                    </label>
                    <input
                      type="text"
                      value={practiceLogConfig.circle}
                      onChange={(e) => setPracticeLogConfig(prev => ({ ...prev, circle: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例: 1周"
                    />
                  </div>
                </div>

                {/* 種目選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    種目
                  </label>
                  <select
                    value={practiceLogConfig.styleId}
                    onChange={(e) => setPracticeLogConfig(prev => ({ ...prev, styleId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">種目を選択してください</option>
                    {styles.map((style: any) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* タグ入力 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    タグ (カンマ区切り)
                  </label>
                  <input
                    type="text"
                    value={practiceLogConfig.tags.join(', ')}
                    onChange={(e) => setPracticeLogConfig(prev => ({ 
                      ...prev, 
                      tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag)
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: 基本練習, 持久力"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setIsLogModalOpen(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={openTimeModal}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  タイム入力
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タイム入力モーダル */}
      {isTimeModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  タイム入力
                </h3>
                <button
                  onClick={() => setIsTimeModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        メンバー
                      </th>
                      {Array.from({ length: practiceLogConfig.sets * practiceLogConfig.reps }, (_, index) => {
                        const set = Math.floor(index / practiceLogConfig.reps) + 1
                        const rep = (index % practiceLogConfig.reps) + 1
                        return (
                          <th key={index} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {set}セット{rep}本目
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedUsers.map((userId) => {
                      const member = members.find((m: any) => m.userId === userId)
                      return (
                        <tr key={userId}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                            {member?.user.name}
                          </td>
                          {Array.from({ length: practiceLogConfig.sets * practiceLogConfig.reps }, (_, index) => {
                            const set = Math.floor(index / practiceLogConfig.reps) + 1
                            const rep = (index % practiceLogConfig.reps) + 1
                            const setRep = `${set}-${rep}`
                            return (
                              <td key={index} className="px-3 py-2 whitespace-nowrap">
                                <input
                                  type="text"
                                  value={practiceTimes[userId]?.[setRep] || ''}
                                  onChange={(e) => updateTime(userId, setRep, e.target.value)}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="mm:ss"
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setIsTimeModalOpen(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  戻る
                </button>
                <button
                  onClick={handleSubmitLogs}
                  disabled={isSubmittingLogs}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmittingLogs ? '登録中...' : '練習ログを登録'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 練習作成モーダル */}
      {isPracticeModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      チーム練習を追加
                    </h3>
                    
                    <form onSubmit={handleCreatePractice} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          練習日
                        </label>
                        <input
                          type="date"
                          value={practiceForm.date}
                          onChange={(e) => setPracticeForm(prev => ({ ...prev, date: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          練習場所
                        </label>
                        <input
                          type="text"
                          value={practiceForm.place}
                          onChange={(e) => setPracticeForm(prev => ({ ...prev, place: e.target.value }))}
                          placeholder="例: 市営プール"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          メモ
                        </label>
                        <textarea
                          value={practiceForm.note}
                          onChange={(e) => setPracticeForm(prev => ({ ...prev, note: e.target.value }))}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="練習に関する特記事項"
                        />
                      </div>
                      
                      <div className="flex justify-end space-x-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setIsPracticeModalOpen(false)}
                          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          キャンセル
                        </button>
                        <button
                          type="submit"
                          disabled={isCreatingPractice}
                          className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isCreatingPractice ? '作成中...' : '練習を追加'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
