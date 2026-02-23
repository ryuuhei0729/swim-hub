'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthProvider'
import {
  PlusIcon,
  CalendarDaysIcon,
  MapPinIcon,
  TrophyIcon,
  PencilSquareIcon,
  ClipboardDocumentListIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useCompetitionFormStore } from '@/stores/competition/competitionStore'
import type { CompetitionImageData } from '@/components/forms/CompetitionBasicForm'
import TeamCompetitionEntryModal from './TeamCompetitionEntryModal'
import TeamCompetitionRecordsModal from './TeamCompetitionRecordsModal'
import Pagination from '@/components/ui/Pagination'

const CompetitionBasicForm = dynamic(
  () => import('@/components/forms/CompetitionBasicForm'),
  { ssr: false }
)

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

// Supabaseクエリ結果の型定義
// Note: Supabaseはリレーションを配列として返す場合がある
interface RawCompetitionUser {
  name: string
}

interface RawCompetitionRecord {
  id: string
  time: number
  users?: RawCompetitionUser | RawCompetitionUser[] | null
}

interface RawCompetitionEntry {
  id: string
  user_id: string
  style_id: number
  entry_time: number | null
  users?: RawCompetitionUser | RawCompetitionUser[] | null
}

interface RawCompetitionData {
  id: string
  user_id: string
  team_id: string
  title: string
  date: string
  place: string | null
  entry_status: string | null
  note: string | null
  created_at: string
  created_by: string | null
  users?: RawCompetitionUser | RawCompetitionUser[] | null
  created_by_user?: RawCompetitionUser | RawCompetitionUser[] | null
  records?: RawCompetitionRecord[] | null
  entries?: RawCompetitionEntry[] | null
}

/**
 * Supabaseが返すユーザー情報（配列または単一オブジェクト）を単一オブジェクトに正規化
 */
function normalizeUser(
  user: RawCompetitionUser | RawCompetitionUser[] | null | undefined
): { name: string } | undefined {
  if (!user) return undefined
  if (Array.isArray(user)) {
    return user.length > 0 ? { name: user[0].name } : undefined
  }
  return { name: user.name }
}

/**
 * Supabaseのクエリ結果をTeamCompetition[]に変換するマッパー関数
 */
function mapToTeamCompetitions(data: RawCompetitionData[] | null): TeamCompetition[] {
  if (!data) return []

  return data.map((item): TeamCompetition => ({
    id: item.id,
    user_id: item.user_id,
    team_id: item.team_id,
    title: item.title,
    date: item.date,
    place: item.place,
    entry_status: isValidEntryStatus(item.entry_status) ? item.entry_status : undefined,
    note: item.note,
    created_at: item.created_at,
    created_by: item.created_by,
    users: normalizeUser(item.users),
    created_by_user: normalizeUser(item.created_by_user),
    records: item.records?.map(record => ({
      id: record.id,
      time: record.time,
      users: normalizeUser(record.users),
    })),
    entries: item.entries?.map(entry => ({
      id: entry.id,
      user_id: entry.user_id,
      style_id: entry.style_id,
      entry_time: entry.entry_time,
      users: normalizeUser(entry.users),
    })),
  }))
}

function isValidEntryStatus(status: string | null): status is 'before' | 'open' | 'closed' {
  return status === 'before' || status === 'open' || status === 'closed'
}

export interface TeamCompetitionsProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamCompetitions({ teamId, isAdmin = false }: TeamCompetitionsProps) {
  const { supabase, user } = useAuth()
  const router = useRouter()
  const [competitions, setCompetitions] = useState<TeamCompetition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCompetition, setSelectedCompetition] = useState<TeamCompetition | null>(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [showRecordsModal, setShowRecordsModal] = useState(false)
  const [selectedCompetitionForRecords, setSelectedCompetitionForRecords] = useState<TeamCompetition | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 20

  const {
    isBasicFormOpen,
    selectedDate,
    isLoading: formLoading,
    openBasicForm,
    closeBasicForm,
    setLoading: setFormLoading,
  } = useCompetitionFormStore()

  // チームの大会一覧を取得（関数として抽出）
  const loadTeamCompetitions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * pageSize

      // 総件数とデータを並列取得（パフォーマンス最適化）
      const [countResult, competitionsResult] = await Promise.all([
        // 総件数を取得
        supabase
          .from('competitions')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId),
        // チームIDが設定された大会を取得（エントリー情報も含む）
        supabase
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
          .range(offset, offset + pageSize - 1)
      ])

      if (countResult.error) throw countResult.error
      if (competitionsResult.error) throw competitionsResult.error

      setTotalCount(countResult.count || 0)
      setCompetitions(mapToTeamCompetitions(competitionsResult.data as RawCompetitionData[] | null))
    } catch (err) {
      console.error('チーム大会情報の取得に失敗:', err)
      setError('チーム大会情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase, currentPage, pageSize])

  // 初回読み込み
  useEffect(() => {
    loadTeamCompetitions()
  }, [loadTeamCompetitions])

  const handleAddCompetition = () => {
    openBasicForm(new Date())
  }

  const handleCompetitionBasicSubmit = async (
    basicData: { date: string; endDate: string; title: string; place: string; poolType: number; note: string },
    _imageData?: CompetitionImageData,
    _options?: { continueToNext?: boolean; skipEntry?: boolean }
  ) => {
    if (!user) {
      console.error('大会の作成に失敗: ユーザーがログインしていません')
      return
    }

    setFormLoading(true)
    try {
      const { error } = await supabase.from('competitions').insert({
        user_id: user.id,
        team_id: teamId,
        date: basicData.date,
        end_date: basicData.endDate || null,
        title: basicData.title || null,
        place: basicData.place || null,
        pool_type: basicData.poolType,
        note: basicData.note || null,
      })

      if (error) {
        console.error('大会の作成に失敗:', error)
        return
      }

      closeBasicForm()
      setCurrentPage(1)
      // useEffectがcurrentPageの変更を検知して自動的にloadTeamCompetitionsを呼び出す
    } catch (err) {
      console.error('大会の作成に失敗:', err)
    } finally {
      setFormLoading(false)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // loadTeamCompetitionsはuseEffectで自動実行される
  }

  // 記録入力ページへ遷移
  const handleRecordClick = (e: React.MouseEvent, competitionId: string) => {
    e.stopPropagation() // 親要素のクリックイベントを停止
    router.push(`/teams/${teamId}/competitions/${competitionId}/records`)
  }

  // エントリー管理モーダルを開く
  const handleEntryClick = (e: React.MouseEvent, competition: TeamCompetition) => {
    e.stopPropagation()
    setSelectedCompetition(competition)
    setShowEntryModal(true)
  }

  // 記録一覧モーダルを開く
  const handleOpenRecords = (competition: TeamCompetition) => {
    setSelectedCompetitionForRecords(competition)
    setShowRecordsModal(true)
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
        {competitions.map((competition) => {
          const hasRecords = competition.records && competition.records.length > 0
          const canViewRecords = isAdmin && hasRecords
          return (
          <div
            key={competition.id}
            onClick={() => canViewRecords ? handleOpenRecords(competition) : undefined}
            onKeyDown={(e) => { if (canViewRecords && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleOpenRecords(competition); } }}
            aria-label={canViewRecords ? `${competition.title || '大会'}の記録を閲覧` : undefined}
            tabIndex={canViewRecords ? 0 : undefined}
            role={canViewRecords ? 'button' : undefined}
            className={`w-full text-left border border-gray-200 rounded-lg p-4 transition-colors duration-200 ${
              canViewRecords ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500' : 'cursor-default'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <TrophyIcon className="h-5 w-5 text-blue-500" />
                  <span className="text-lg font-medium text-gray-900">
                    {competition.title || '大会'}
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
                
                {/* 記録情報（管理者のみ表示） */}
                {isAdmin && (
                  competition.records && competition.records.length > 0 ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-green-600 font-medium">
                        📊 登録記録: {competition.records.length}件
                      </span>
                      <span className="text-xs text-gray-500 flex items-center">
                        <EyeIcon className="h-3 w-3 mr-1" />
                        タップで詳細
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        📊 登録記録なし
                      </span>
                      <span className="text-xs text-blue-600 flex items-center">
                        <PlusIcon className="h-3 w-3 mr-1" />
                        追加可能
                      </span>
                    </div>
                  )
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
                    onClick={(e) => handleEntryClick(e, competition)}
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
          )
        })}
        
        {competitions.length === 0 && !loading && (
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

      {/* ページング */}
      {totalCount > 0 && (
        <div className="mt-4 pt-4 px-4 sm:px-6 pb-6 border-t border-gray-200">
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / pageSize)}
            totalItems={totalCount}
            itemsPerPage={pageSize}
            onPageChange={handlePageChange}
          />
        </div>
      )}
      </div>

      {/* チーム大会作成モーダル */}
      <Suspense fallback={null}>
        <CompetitionBasicForm
          isOpen={isBasicFormOpen}
          onClose={closeBasicForm}
          onSubmit={handleCompetitionBasicSubmit}
          selectedDate={selectedDate || new Date()}
          isLoading={formLoading}
          teamMode={true}
        />
      </Suspense>

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
          competitionTitle={selectedCompetition.title || '大会'}
          teamId={teamId}
        />
      )}

      {/* 記録一覧モーダル（管理者のみ） */}
      {isAdmin && showRecordsModal && selectedCompetitionForRecords && (
        <TeamCompetitionRecordsModal
          isOpen={showRecordsModal}
          onClose={() => {
            setShowRecordsModal(false)
            setSelectedCompetitionForRecords(null)
          }}
          competitionId={selectedCompetitionForRecords.id}
          competitionTitle={selectedCompetitionForRecords.title || '大会'}
        />
      )}
    </>
  )
}
