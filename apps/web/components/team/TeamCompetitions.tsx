'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthProvider'
import { 
  PlusIcon, 
  CalendarDaysIcon,
  MapPinIcon,
  TrophyIcon,
  PencilSquareIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import TeamCompetitionForm from './TeamCompetitionForm'
import TeamCompetitionEntryModal from './TeamCompetitionEntryModal'

export interface TeamCompetition {
  id: string
  user_id: string
  team_id: string
  title: string
  date: string
  place: string | null
  entry_status?: 'before' | 'open' | 'closed'
  note: string | null
  created_at: string
  created_by: string | null
  users?: {
    name: string
  }
  created_by_user?: {
    name: string
  }
  records?: {
    id: string
    time: number
    users?: {
      name: string
    }
  }[]
  entries?: {
    id: string
    user_id: string
    style_id: number
    entry_time: number | null
    users?: {
      name: string
    }
  }[]
}

export interface TeamCompetitionsProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamCompetitions({ teamId, isAdmin = false }: TeamCompetitionsProps) {
  const { supabase } = useAuth()
  const router = useRouter()
  const [competitions, setCompetitions] = useState<TeamCompetition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCompetitionForm, setShowCompetitionForm] = useState(false)
  const [selectedCompetition, setSelectedCompetition] = useState<TeamCompetition | null>(null)
  const [showEntryModal, setShowEntryModal] = useState(false)

  // チームの大会一覧を取得（関数として抽出）
  const loadTeamCompetitions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // チームIDが設定された大会を取得（エントリー情報も含む）
      const { data: competitionsData, error: competitionsError } = await supabase
        .from('competitions')
        .select(`
          id,
          user_id,
          team_id,
          title,
          date,
          place,
          entry_status,
          note,
          created_at,
          created_by,
          users!competitions_user_id_fkey (
            name
          ),
          created_by_user:users!competitions_created_by_fkey (
            name
          ),
          records (
            id,
            time,
            users!records_user_id_fkey (
              name
            )
          ),
          entries (
            id,
            user_id,
            style_id,
            entry_time,
            users!entries_user_id_fkey (
              name
            )
          )
        `)
        .eq('team_id', teamId)
        .order('date', { ascending: false })
        .limit(20) // 最新20件のみ

      if (competitionsError) throw competitionsError

      setCompetitions((competitionsData || []) as unknown as TeamCompetition[])
    } catch (err) {
      console.error('チーム大会情報の取得に失敗:', err)
      setError('チーム大会情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  // 初回読み込み
  useEffect(() => {
    loadTeamCompetitions()
  }, [loadTeamCompetitions])

  const handleAddCompetition = () => {
    setShowCompetitionForm(true)
  }

  const handleCompetitionCreated = () => {
    // 大会一覧を再読み込み（画面全体ではなくデータのみ）
    loadTeamCompetitions()
  }

  // 記録入力ページへ遷移
  const handleRecordClick = (e: React.MouseEvent, competitionId: string) => {
    e.stopPropagation() // 親要素のクリックイベントを停止
    router.push(`/teams/${teamId}/competitions/${competitionId}/records`)
  }

  // エントリー管理モーダルを開く
  const handleEntryClick = (competition: TeamCompetition) => {
    setSelectedCompetition(competition)
    setShowEntryModal(true)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.refresh()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            チーム大会 ({competitions.length}件)
          </h2>
          {isAdmin && (
            <button
              onClick={handleAddCompetition}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              大会追加
            </button>
          )}
        </div>

      {/* 大会一覧 */}
      <div className="space-y-4">
        {competitions.map((competition) => (
          <div 
            key={competition.id}
            className="border border-gray-200 rounded-lg p-4 transition-colors duration-200 hover:bg-gray-50"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <TrophyIcon className="h-5 w-5 text-blue-500" />
                  <span className="text-lg font-medium text-gray-900">
                    {competition.title}
                  </span>
                  {/* エントリーステータスバッジ */}
                  {competition.entry_status && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      competition.entry_status === 'open' ? 'bg-green-100 text-green-800' :
                      competition.entry_status === 'closed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {competition.entry_status === 'open' ? '受付中' :
                       competition.entry_status === 'closed' ? '受付終了' :
                       '受付前'}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2 mb-1">
                  <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {format(new Date(competition.date + 'T00:00:00'), 'yyyy年M月d日(EEE)', { locale: ja })}
                  </span>
                </div>
                
                {competition.place && (
                  <div className="flex items-center space-x-2 mb-1">
                    <MapPinIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{competition.place}</span>
                  </div>
                )}
                
                {competition.note && (
                  <p className="text-sm text-gray-600 mb-2 mt-2">{competition.note}</p>
                )}
                
                {/* 記録情報 */}
                {competition.records && competition.records.length > 0 ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-green-600 font-medium">
                      📊 登録記録: {competition.records.length}件
                    </span>
                    {isAdmin && (
                      <span className="text-xs text-gray-500 flex items-center">
                        <PencilSquareIcon className="h-3 w-3 mr-1" />
                        編集可能
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      📊 登録記録なし
                    </span>
                    {isAdmin && (
                      <span className="text-xs text-blue-600 flex items-center">
                        <PlusIcon className="h-3 w-3 mr-1" />
                        追加可能
                      </span>
                    )}
                  </div>
                )}
                
                {/* エントリー情報 */}
                {competition.entries && competition.entries.length > 0 && (
                  <div className="mt-1">
                    <span className="text-sm text-blue-600">
                      📝 エントリー: {competition.entries.length}件
                    </span>
                  </div>
                )}
                
                <div className="mt-2">
                  <span className="text-xs text-gray-500">
                    作成者: {competition.users?.name || competition.created_by_user?.name || 'Unknown'}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <p className="text-xs text-gray-500">
                  {format(new Date(competition.created_at), 'M/d HH:mm')}
                </p>
                
                {/* アクションボタン */}
                <div className="flex gap-2">
                  {/* エントリー管理ボタン */}
                  <button
                    onClick={() => handleEntryClick(competition)}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    title="エントリー管理"
                  >
                    <ClipboardDocumentListIcon className="h-4 w-4 mr-1" />
                    エントリー
                  </button>
                  
                  {/* 記録入力ボタン（adminのみ） */}
                  {isAdmin && (
                    <button
                      onClick={(e) => handleRecordClick(e, competition.id)}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                      title="記録を入力"
                    >
                      <PencilSquareIcon className="h-4 w-4 mr-1" />
                      記録入力
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {competitions.length === 0 && (
          <div className="text-center py-8">
            <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">大会がありません</p>
            {isAdmin && (
              <button
                onClick={handleAddCompetition}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                最初の大会を追加
              </button>
            )}
          </div>
        )}
      </div>
      </div>

      {/* チーム大会作成モーダル */}
      <TeamCompetitionForm
        isOpen={showCompetitionForm}
        onClose={() => setShowCompetitionForm(false)}
        teamId={teamId}
        onSuccess={handleCompetitionCreated}
      />

      {/* エントリー管理モーダル */}
      {showEntryModal && selectedCompetition && (
        <TeamCompetitionEntryModal
          isOpen={showEntryModal}
          onClose={() => {
            setShowEntryModal(false)
            setSelectedCompetition(null)
            // モーダルを閉じた後、リストを再読み込み（ステータス変更が反映されるように）
            loadTeamCompetitions()
          }}
          competitionId={selectedCompetition.id}
          competitionTitle={selectedCompetition.title}
          teamId={teamId}
        />
      )}
    </>
  )
}
