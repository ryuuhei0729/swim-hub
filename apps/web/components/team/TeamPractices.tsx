'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthProvider'
import { 
  PlusIcon, 
  CalendarDaysIcon,
  MapPinIcon,
  ClockIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import TeamPracticeForm from './TeamPracticeForm'
import { Pagination } from '@/components/ui'

// Supabase から返されるスネークケースの型
// Supabaseのリレーションは配列または単一オブジェクトで返る可能性がある
interface PracticeRecord {
  id: string
  user_id: string
  date: string
  title: string | null
  place: string | null
  note: string | null
  created_at: string
  created_by: string | null
  users?: { name: string } | { name: string }[]
  created_by_user?: { name: string } | { name: string }[]
  practice_logs?: {
    id: string
    style: string
    distance: number
    practice_times?: {
      time: number
    }[]
  }[]
}

// UI で使用するキャメルケースの型
export interface TeamPractice {
  id: string
  userId: string
  date: string
  title: string | null
  place: string | null
  note: string | null
  createdAt: string
  createdBy: string | null
  users?: {
    name: string
  }
  createdByUser?: {
    name: string
  }
  practiceLogs?: {
    id: string
    style: string
    distance: number
    practiceTimes?: {
      time: number
    }[]
  }[]
}

// ヘルパー: 配列または単一オブジェクトを単一オブジェクトに正規化
function normalizeUser(
  user: { name: string } | { name: string }[] | undefined
): { name: string } | undefined {
  if (!user) return undefined
  return Array.isArray(user) ? user[0] : user
}

// スネークケース → キャメルケース変換関数
function mapPracticeRecordToTeamPractice(record: PracticeRecord): TeamPractice {
  return {
    id: record.id,
    userId: record.user_id,
    date: record.date,
    title: record.title,
    place: record.place,
    note: record.note,
    createdAt: record.created_at,
    createdBy: record.created_by,
    users: normalizeUser(record.users),
    createdByUser: normalizeUser(record.created_by_user),
    practiceLogs: record.practice_logs?.map((log) => ({
      id: log.id,
      style: log.style,
      distance: log.distance,
      practiceTimes: log.practice_times?.map((pt) => ({
        time: pt.time,
      })),
    })),
  }
}

export interface TeamPracticesProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamPractices({ teamId, isAdmin = false }: TeamPracticesProps) {
  const { supabase } = useAuth()
  const router = useRouter()
  const [practices, setPractices] = useState<TeamPractice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPracticeForm, setShowPracticeForm] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 20

  // チームの練習記録を取得（関数として抽出）
  const loadTeamPractices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * pageSize

      // 総件数とデータを並列取得（パフォーマンス最適化）
      const [countResult, practicesResult] = await Promise.all([
        // 総件数を取得
        supabase
          .from('practices')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId),
        // チームIDが設定された練習記録を取得
        supabase
          .from('practices')
          .select(`
            id,
            user_id,
            date,
            title,
            place,
            note,
            created_at,
            created_by,
            users!practices_user_id_fkey (
              name
            ),
            created_by_user:users!practices_created_by_fkey (
              name
            ),
            practice_logs (
              id,
              style,
              distance,
              practice_times (time)
            )
          `)
          .eq('team_id', teamId)
          .order('date', { ascending: false })
          .range(offset, offset + pageSize - 1)
      ])

      if (countResult.error) throw countResult.error
      if (practicesResult.error) throw practicesResult.error

      setTotalCount(countResult.count || 0)
      const mappedPractices = (practicesResult.data || []).map((record) =>
        mapPracticeRecordToTeamPractice(record as PracticeRecord)
      )
      setPractices(mappedPractices)
    } catch (err) {
      console.error('チーム練習情報の取得に失敗:', err)
      setError('チーム練習情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase, currentPage, pageSize])

  // 初回読み込みとページ変更時の読み込み
  useEffect(() => {
    loadTeamPractices()
  }, [loadTeamPractices])

  const handleAddPractice = () => {
    setShowPracticeForm(true)
  }

  const handlePracticeCreated = () => {
    // 練習記録一覧を再読み込み（画面全体ではなくデータのみ）
    // 新しいデータが追加された場合、最初のページに戻る
    setCurrentPage(1)
    loadTeamPractices()
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // loadTeamPracticesはuseEffectで自動実行される
  }

  // 練習ログ入力ページへ遷移
  const handlePracticeClick = (practiceId: string) => {
    if (isAdmin) {
      router.push(`/teams/${teamId}/practices/${practiceId}/logs`)
    }
  }

  // キーボード操作ハンドラー
  const handlePracticeKeyDown = (e: React.KeyboardEvent, practiceId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handlePracticeClick(practiceId)
    }
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
            チーム練習記録 ({practices.length}件)
          </h2>
          {isAdmin && (
            <button
              onClick={handleAddPractice}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              練習記録追加
            </button>
          )}
        </div>

      {/* 練習記録一覧 */}
      <div className="space-y-4">
        {practices.map((practice) => {
          const practiceDate = format(new Date(practice.date), 'M月d日(E)', { locale: ja })
          const hasLogs = practice.practiceLogs && practice.practiceLogs.length > 0
          const ariaLabel = isAdmin 
            ? `${practiceDate}の練習記録${hasLogs ? 'を編集' : 'を追加'}`
            : undefined

          if (isAdmin) {
            return (
              <button
                key={practice.id}
                onClick={() => handlePracticeClick(practice.id)}
                onKeyDown={(e) => handlePracticeKeyDown(e, practice.id)}
                aria-label={ariaLabel}
                className="w-full text-left border border-gray-200 rounded-lg p-4 transition-colors duration-200 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-lg font-medium text-gray-900">
                        {practiceDate}
                      </span>
                      <span className="text-sm text-gray-500">
                        by {practice.users?.name || practice.createdByUser?.name || 'Unknown'}
                      </span>
                    </div>
                    
                    {practice.title && (
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{practice.title}</span>
                      </div>
                    )}
                    
                    {practice.place && (
                      <div className="flex items-center space-x-2 mb-1">
                        <MapPinIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{practice.place}</span>
                      </div>
                    )}
                    
                    {practice.note && (
                      <p className="text-sm text-gray-600 mb-2">{practice.note}</p>
                    )}
                    
                    {hasLogs ? (
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 font-medium">
                          {practice.practiceLogs!.length}セットの練習記録あり
                        </span>
                        <span className="text-xs text-gray-500 flex items-center">
                          <PencilSquareIcon className="h-3 w-3 mr-1" />
                          クリックで編集
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          練習記録なし
                        </span>
                        <span className="text-xs text-blue-600 flex items-center">
                          <PlusIcon className="h-3 w-3 mr-1" />
                          クリックで追加
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {format(new Date(practice.createdAt), 'M/d HH:mm')}
                    </p>
                  </div>
                </div>
              </button>
            )
          } else {
            return (
              <div
                key={practice.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-lg font-medium text-gray-900">
                        {practiceDate}
                      </span>
                      <span className="text-sm text-gray-500">
                        by {practice.users?.name || practice.createdByUser?.name || 'Unknown'}
                      </span>
                    </div>
                    
                    {practice.place && (
                      <div className="flex items-center space-x-2 mb-1">
                        <MapPinIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{practice.place}</span>
                      </div>
                    )}
                    
                    {practice.note && (
                      <p className="text-sm text-gray-600 mb-2">{practice.note}</p>
                    )}
                    
                    {hasLogs ? (
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 font-medium">
                          {practice.practiceLogs!.length}セットの練習記録あり
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <ClockIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          練習記録なし
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {format(new Date(practice.createdAt), 'M/d HH:mm')}
                    </p>
                  </div>
                </div>
              </div>
            )
          }
        })}
        
        {practices.length === 0 && !loading && (
          <div className="text-center py-8">
            <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">練習記録がありません</p>
            {isAdmin && (
              <button
                onClick={handleAddPractice}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                最初の練習記録を追加
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

      {/* チーム練習記録作成モーダル */}
      <TeamPracticeForm
        isOpen={showPracticeForm}
        onClose={() => setShowPracticeForm(false)}
        teamId={teamId}
        onSuccess={handlePracticeCreated}
      />
    </>
  )
}
