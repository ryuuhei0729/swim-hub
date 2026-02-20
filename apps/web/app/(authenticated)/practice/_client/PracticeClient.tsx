'use client'

import React, { useState, useMemo, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { CalendarDaysIcon, PencilIcon, TrashIcon, ShareIcon } from '@heroicons/react/24/outline'
import Button from '@/components/ui/Button'
import Pagination from '@/components/ui/Pagination'
const PracticeLogForm = dynamic(() => import('@/components/forms/PracticeLogForm'), { ssr: false })
import PracticeTimeModal from '../_components/PracticeTimeModal'

const ShareCardModal = dynamic(
  () => import('@/components/share/ShareCardModal').then(mod => ({ default: mod.ShareCardModal })),
  { ssr: false }
)
import type { PracticeShareData, PracticeMenuItem } from '@/components/share'
import { format, isAfter, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts'
import {
  usePracticesQuery,
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useDeletePracticeMutation,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  useDeletePracticeLogMutation,
} from '@apps/shared/hooks/queries/practices'
import type {
  PracticeTag,
  PracticeLogWithTags,
  PracticeTime,
  PracticeWithLogs,
  Style
} from '@apps/shared/types'
import { usePracticeFilterStore } from '@/stores/practice/practiceStore'
import { usePracticeRecordStore } from '@/stores/form/practiceRecordStore'
import type {
  PracticeLogWithFormattedData
} from '@/stores/form/practiceRecordStore'
import type { PracticeMenuFormData } from '@/stores/types'

interface PracticeClientProps {
  // サーバー側で取得したデータ
  initialPractices: PracticeWithLogs[]
  styles: Style[]
  tags: PracticeTag[]
}

/**
 * 練習記録ページのインタラクティブ部分を担当するClient Component
 */
export default function PracticeClient({
  initialPractices,
  styles,
  tags
}: PracticeClientProps) {
  const { supabase } = useAuth()
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareData, setShareData] = useState<PracticeShareData | null>(null)
  const [, startTransition] = useTransition()

  // Zustandストア
  const {
    selectedTagIds,
    showTagFilter,
    setSelectedTags,
    toggleTagFilter,
  } = usePracticeFilterStore()
  
  const {
    isFormOpen,
    selectedDate: _selectedDate,
    editingLog: _editingLog,
    isLoading,
    editingItem,
    editingData,
    showTimeModal,
    selectedPracticeForTime,
    openForm,
    closeForm,
    setSelectedDate,
    setEditingLog,
    setEditingItem,
    setEditingData,
    openTimeModal,
    closeTimeModal,
    setStyles,
    setTags,
    setLoading,
  } = usePracticeRecordStore()

  // サーバー側から取得したデータをストアに設定（初回のみ）
  const initializedRef = React.useRef(false)
  if (!initializedRef.current) {
    setStyles(styles)
    setTags(tags)
    initializedRef.current = true
  }

  // 練習記録を取得（リアルタイム更新用）
  const {
    data: practices = [],
    isLoading: loading,
    error,
    refetch
  } = usePracticesQuery(supabase, {
    initialData: initialPractices,
  })

  // ミューテーションフック
  const createPracticeMutation = useCreatePracticeMutation(supabase)
  const updatePracticeMutation = useUpdatePracticeMutation(supabase)
  const deletePracticeMutation = useDeletePracticeMutation(supabase)
  const createPracticeLogMutation = useCreatePracticeLogMutation(supabase)
  const updatePracticeLogMutation = useUpdatePracticeLogMutation(supabase)
  const deletePracticeLogMutation = useDeletePracticeLogMutation(supabase)

  // React Query mutation状態から派生
  const isAnyMutating = createPracticeMutation.isPending
    || updatePracticeMutation.isPending
    || deletePracticeMutation.isPending
    || createPracticeLogMutation.isPending
    || updatePracticeLogMutation.isPending
    || deletePracticeLogMutation.isPending

  // サーバー側で取得した初期データとリアルタイム更新されたデータを統合
  // React Queryのキャッシュを使用
  const displayPractices = practices

  // practice_logsを平坦化し、タグデータを整形
  const practiceLogs = useMemo<PracticeLogWithFormattedData[]>(() =>
    displayPractices.flatMap(practice =>
      (practice.practice_logs || []).map((log: PracticeLogWithTags): PracticeLogWithFormattedData => {
        // タグデータを整形（practice_log_tags -> tags に変換）
        const tags: PracticeTag[] = log.practice_log_tags.map((plt) => plt.practice_tags)

        return {
          ...log,
          tags, // 整形したタグを追加
          practice: {
            id: practice.id,
            date: practice.date,
            place: practice.place,
            note: practice.note
          },
          practiceId: practice.id
        }
      })
    ), [displayPractices])

  // 今日の日付（時刻を0時0分0秒にリセット）
  const today = useMemo(() => startOfDay(new Date()), [])

  // タグフィルタリングロジック + 日付フィルタリング（今日以前のみ）
  const filteredPracticeLogs = useMemo(() => practiceLogs.filter((log) => {
    // 日付フィルタリング：今日より未来の日付は除外
    if (log.practice?.date) {
      const practiceDate = startOfDay(new Date(log.practice.date))
      if (isAfter(practiceDate, today)) {
        return false
      }
    }

    // タグフィルタリング
    if (selectedTagIds.length === 0) return true

    const logTagIds = (log.tags || []).map((tag) => tag.id)
    return selectedTagIds.some(tagId => logTagIds.includes(tagId))
  }), [practiceLogs, selectedTagIds, today])
  
  // 日付の降順でソート
  const sortedPracticeLogs = useMemo(() => {
    return [...filteredPracticeLogs].sort((a, b) => {
      const dateA = new Date(a.practice?.date || a.created_at)
      const dateB = new Date(b.practice?.date || b.created_at)
      return dateB.getTime() - dateA.getTime()
    })
  }, [filteredPracticeLogs])

  // ページング適用
  const paginatedPracticeLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return sortedPracticeLogs.slice(startIndex, endIndex)
  }, [sortedPracticeLogs, currentPage, pageSize])

  const totalPages = Math.ceil(sortedPracticeLogs.length / pageSize)

  // タグフィルター変更ハンドラー（useTransitionでUI応答性を維持 + ページリセット）
  const handleTagFilterChange = (newTagIds: string[]) => {
    startTransition(() => {
      setSelectedTags(newTagIds)
      setCurrentPage(1)
    })
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // ページトップにスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // セットごとの平均タイムを計算する関数
  const calculateSetAverages = (times: PracticeTime[], repCount: number, setCount: number) => {
    if (!times || times.length === 0 || repCount === 0 || setCount === 0) {
      return []
    }

    const averages: number[] = []
    const expectedTimesPerSet = repCount

    for (let setIndex = 0; setIndex < setCount; setIndex++) {
      const startIndex = setIndex * expectedTimesPerSet
      const endIndex = Math.min(startIndex + expectedTimesPerSet, times.length)
      const setTimes = times.slice(startIndex, endIndex)

      if (setTimes.length > 0) {
        const sum = setTimes.reduce((acc: number, time) => acc + (time.time || 0), 0)
        const average = sum / setTimes.length
        averages.push(average)
      }
    }

    return averages
  }

  // タイムをフォーマットする関数
  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
      : `${remainingSeconds.toFixed(2)}`
  }

  // タグの保存処理（原子性のある操作）
  const savePracticeLogTags = async (practiceLogId: string, newTags: PracticeTag[]) => {
    try {
      const tagIds = newTags.map(tag => tag.id)
      
      const { error } = await supabase.rpc('replace_practice_log_tags', {
        p_practice_log_id: practiceLogId,
        p_tag_ids: tagIds
      })
      
      if (error) throw error
    } catch (error) {
      console.error('タグの保存処理でエラーが発生しました:', error)
      throw error // エラーを呼び出し元に再スロー
    }
  }

  const handleEditLog = (log: PracticeLogWithFormattedData) => {
    setEditingItem({
      id: log.practiceId,
      item_type: 'practice',
      item_date: log.practice?.date
    })
    setSelectedDate(new Date(log.practice?.date || new Date()))
    setEditingLog(log)
    
    // 編集データを設定
    // タイムデータをフォームが期待する形式に変換
    const formattedTimes = (log.practice_times || []).map((time: PracticeTime) => ({
      setNumber: time.set_number,
      repNumber: time.rep_number,
      time: time.time
    }))

    setEditingData({
      id: log.id,
      practiceId: log.practiceId,
      date: log.practice?.date || format(new Date(), 'yyyy-MM-dd'),
      place: log.practice?.place || '',
      note: log.practice?.note || '',
      style: log.style,
      swim_category: log.swim_category || 'Swim',
      rep_count: log.rep_count,
      set_count: log.set_count || 1,
      distance: log.distance,
      circle: log.circle,
      times: formattedTimes,
      tags: log.tags || []
    })
    
    openForm()
  }

  const handleTimeLog = (log: PracticeLogWithFormattedData) => {
    openTimeModal({
      id: log.practiceId,
      place: log.practice?.place
    })
  }

  // シェアボタンのハンドラー
  const handleSharePractice = (log: PracticeLogWithFormattedData) => {
    // この日の全ログを取得
    const practiceDate = log.practice?.date
    const logsForDate = practiceLogs.filter(l => l.practice?.date === practiceDate)

    // メニュー項目に変換
    const menuItems: PracticeMenuItem[] = logsForDate.map(l => ({
      style: l.style,
      category: l.swim_category || 'Swim',
      distance: l.distance,
      repCount: l.rep_count,
      setCount: l.set_count || 1,
      circle: l.circle ?? undefined,
      times: l.practice_times?.map(t => ({
        setNumber: t.set_number,
        repNumber: t.rep_number,
        time: t.time
      })),
      note: l.note ?? undefined
    }))

    // 合計距離と合計セット数を計算
    const totalDistance = logsForDate.reduce((sum, l) =>
      sum + (l.distance * l.rep_count * (l.set_count || 1)), 0)
    const totalSets = logsForDate.length

    setShareData({
      date: practiceDate
        ? format(new Date(practiceDate), 'yyyy年M月d日（E）', { locale: ja })
        : '',
      title: log.practice?.note || '練習',
      place: log.practice?.place ?? undefined,
      menuItems,
      totalDistance,
      totalSets,
      userName: '', // TODO: ユーザー名を取得
      teamName: undefined
    })
    setShowShareModal(true)
  }
  
  const handlePracticeSubmit = async (formDataArray: PracticeMenuFormData[]) => {
    setLoading(true)
    try {
      const menus = Array.isArray(formDataArray) ? formDataArray : []

      if (editingData && editingItem?.item_type === 'practice') {
        // 編集時の処理
        const firstMenu = menus[0] || {}
        const practiceInput = {
          date: firstMenu.practiceDate || editingData.date,
          title: firstMenu.title || editingData.title || null,
          place: firstMenu.place || editingData.place,
          note: firstMenu.note || editingData.note
        }
        
        await updatePracticeMutation.mutateAsync({
          id: editingData.practiceId,
          updates: practiceInput
        })
        
        // Practice_log更新
        for (const menu of menus) {
          const logInput = {
            practice_id: editingData.practiceId,
            style: menu.style || 'Fr',
            swim_category: menu.swimCategory || 'Swim',
            rep_count: menu.reps || 1,
            set_count: menu.sets || 1,
            distance: menu.distance || 100,
            circle: menu.circleTime || null,
            note: menu.note || ''
          }
          
          await updatePracticeLogMutation.mutateAsync({
            id: editingData.id,
            updates: logInput
          })
          
          // タグの保存
          await savePracticeLogTags(editingData.id, menu.tags || [])
        }
      } else {
        // 新規作成時の処理
        const firstMenu = menus[0] || {}
        const practiceInput = {
          date: firstMenu.practiceDate || format(new Date(), 'yyyy-MM-dd'),
          title: firstMenu.title || null,
          place: firstMenu.place || null,
          note: firstMenu.note || null
        }
        
        const newPractice = await createPracticeMutation.mutateAsync(practiceInput)

        // 各メニューをPracticeLogとして作成
        for (const menu of menus) {
          const logInput = {
            practice_id: newPractice.id,
            style: menu.style || 'Fr',
            swim_category: menu.swimCategory || 'Swim',
            rep_count: menu.reps || 1,
            set_count: menu.sets || 1,
            distance: menu.distance || 100,
            circle: menu.circleTime || null,
            note: menu.note || ''
          }
          
          const newLog = await createPracticeLogMutation.mutateAsync(logInput)
          
          // タグの保存
          if (menu.tags && menu.tags.length > 0) {
            await savePracticeLogTags(newLog.id, menu.tags)
          }
        }
      }

      // 成功時にミューテーションのエラー状態をリセット
      createPracticeMutation.reset()
      updatePracticeMutation.reset()
      createPracticeLogMutation.reset()
      updatePracticeLogMutation.reset()

      // データを再取得
      await refetch()
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
      const errorMessage = error instanceof Error ? error.message : '練習記録の保存に失敗しました'
      alert(`エラー: ${errorMessage}`)
    } finally {
      setLoading(false)
      // フォームを閉じる時にミューテーションのエラー状態をリセット
      createPracticeMutation.reset()
      updatePracticeMutation.reset()
      createPracticeLogMutation.reset()
      updatePracticeLogMutation.reset()
      closeForm()
    }
  }

  const _handleFormClose = () => {
    closeForm()
  }

  const handleTimeModalClose = () => {
    closeTimeModal()
  }

  const handleDeleteLog = async (logId: string) => {
    if (confirm('この練習記録を削除しますか？')) {
      setLoading(true)
      try {
        // 削除対象のPractice_Logの情報を取得
        const logToDelete = practiceLogs.find((log) => log.id === logId)
        const practiceId = logToDelete?.practiceId

        // Practice_Logを削除
        await deletePracticeLogMutation.mutateAsync(logId)

        // Practice_Log削除後、そのPracticeに紐づく他のPractice_Logがあるかチェック
        if (practiceId) {
          const remainingLogs = practiceLogs.filter((log) => 
            log.practiceId === practiceId && log.id !== logId
          )

          // 紐づくPractice_Logがない場合は、Practiceも削除
          if (remainingLogs.length === 0) {
            try {
              await deletePracticeMutation.mutateAsync(practiceId)
              deletePracticeMutation.reset()
            } catch (practiceDeleteError) {
              console.error('Practiceの削除に失敗しました:', practiceDeleteError)
              const errorMessage = practiceDeleteError instanceof Error ? practiceDeleteError.message : 'Practiceの削除に失敗しました'
              alert(`エラー: ${errorMessage}`)
            }
          }
        }

        // 成功時にミューテーションのエラー状態をリセット
        deletePracticeLogMutation.reset()

        // 明示的にrefetchを実行
        await refetch()
      } catch (error) {
        console.error('削除エラー:', error)
        const errorMessage = error instanceof Error ? error.message : '削除に失敗しました'
        alert(`エラー: ${errorMessage}`)
      } finally {
        setLoading(false)
      }
    }
  }

  if (loading || isLoading || isAnyMutating) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">練習記録</h1>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // クエリエラーのみをページレベルのエラーとして扱う
  const queryErrorMessage = error?.message

  if (queryErrorMessage && !loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">練習記録</h1>
          <div className="text-red-600">
            エラーが発生しました: {queryErrorMessage}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              練習記録
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              日々の練習内容を記録・分析します。新しい練習記録の追加はダッシュボードのカレンダーから行えます。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <Button
              onClick={() => toggleTagFilter()}
              variant="outline"
              className="flex items-center space-x-2 w-full sm:w-auto justify-center"
            >
              <span>タグでフィルター</span>
            </Button>
          </div>
        </div>
        
        {/* タグフィルタリングUI */}
        {showTagFilter && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: PracticeTag) => (
                <button
                  key={tag.id}
                  onClick={() => {
                    if (selectedTagIds.includes(tag.id)) {
                      handleTagFilterChange(selectedTagIds.filter(id => id !== tag.id))
                    } else {
                      handleTagFilterChange([...selectedTagIds, tag.id])
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? 'text-white'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                  style={{
                    backgroundColor: selectedTagIds.includes(tag.id) ? tag.color : undefined
                  }}
                >
                  {tag.name}
                </button>
              ))}
              {selectedTagIds.length > 0 && (
                <button
                  onClick={() => handleTagFilterChange([])}
                  className="px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200"
                >
                  クリア
                </button>
              )}
            </div>
            {selectedTagIds.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                {selectedTagIds.length}個のタグでフィルタリング中
              </p>
            )}
          </div>
        )}
      </div>

      {/* 練習記録一覧（表形式） */}
      <div className="bg-white rounded-lg shadow">
        {practiceLogs.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">練習記録がありません</h3>
            <p className="mt-1 text-sm text-gray-500">
              ダッシュボードのカレンダーから練習記録を追加できます。
            </p>
            <div className="mt-4">
              <Button
                onClick={() => window.location.href = '/dashboard'}
                className="bg-blue-600 hover:bg-blue-700"
              >
                ダッシュボードに移動
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* デスクトップ表示（テーブル） */}
            <div className="hidden lg:block overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      場所
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      距離・本数・セット
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      サークル
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      種目
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タグ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      平均タイム
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedPracticeLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleTimeLog(log)}
                      tabIndex={0}
                      role="button"
                      aria-label="練習詳細を表示"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleTimeLog(log)
                        }
                      }}
                    >
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.practice?.date ? format(new Date(log.practice.date), 'MM/dd', { locale: ja }) : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.practice?.place || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.distance}m × {log.rep_count}本 × {log.set_count}セット
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.style}{log.swim_category && log.swim_category !== 'Swim' ? `(${log.swim_category})` : ''}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {log.tags && log.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {log.tags.map((tag: PracticeTag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-black"
                                style={{ 
                                  backgroundColor: tag.color
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {log.practice_times && log.practice_times.length > 0 ? (
                          <div className="text-sm">
                            {calculateSetAverages(log.practice_times, log.rep_count, log.set_count).map((avgTime: number, setIndex: number) => (
                              <div key={setIndex} className="text-gray-900">
                                {formatTime(avgTime)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSharePractice(log)
                            }}
                            className="flex items-center space-x-1 text-cyan-600 hover:text-cyan-700"
                          >
                            <ShareIcon className="h-4 w-4" />
                            <span className="text-xs">シェア</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditLog(log)
                            }}
                            className="flex items-center space-x-1"
                          >
                            <PencilIcon className="h-4 w-4" />
                            <span className="text-xs">編集</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteLog(log.id)
                            }}
                            disabled={isLoading}
                            className="flex items-center space-x-1 text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <TrashIcon className="h-4 w-4" />
                            <span className="text-xs">{isLoading ? '削除中...' : '削除'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
              </div>
            </div>

            {/* タブレット・モバイル表示（カード形式） */}
            <div className="lg:hidden">
              <div className="divide-y divide-gray-200">
                {paginatedPracticeLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-5 sm:p-6 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleTimeLog(log)}
                    tabIndex={0}
                    role="button"
                    aria-label="練習詳細を表示"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleTimeLog(log)
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="text-sm font-medium text-gray-900">
                            {log.practice?.date ? format(new Date(log.practice.date), 'MM/dd', { locale: ja }) : '-'}
                          </div>
                          {log.practice?.place && (
                            <div className="text-xs text-gray-500">
                              {log.practice.place}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            {log.distance}m × {log.rep_count}本 × {log.set_count}セット
                          </div>
                          <div className="text-sm text-gray-600">
                            {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'} {log.style}
                          </div>

                          {log.tags && log.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {log.tags.map((tag: PracticeTag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-black"
                                  style={{
                                    backgroundColor: tag.color
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {log.practice_times && log.practice_times.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs text-gray-500 mb-1">平均タイム:</div>
                              <div className="text-sm">
                                {calculateSetAverages(log.practice_times, log.rep_count, log.set_count).map((avgTime: number, setIndex: number) => (
                                  <span key={setIndex} className="text-gray-900 mr-2">
                                    {formatTime(avgTime)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {log.note && (
                            <div className="text-xs text-gray-600 mt-2 truncate">
                              {log.note}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSharePractice(log)
                          }}
                          className="flex items-center justify-center space-x-1 text-xs px-2 py-1 text-cyan-600 hover:text-cyan-700"
                        >
                          <ShareIcon className="h-3 w-3" />
                          <span>シェア</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditLog(log)
                          }}
                          className="flex items-center justify-center space-x-1 text-xs px-2 py-1"
                        >
                          <PencilIcon className="h-3 w-3" />
                          <span>編集</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteLog(log.id)
                          }}
                          disabled={isLoading}
                          className="flex items-center justify-center space-x-1 text-xs px-2 py-1 text-red-600 hover:text-red-700"
                        >
                          <TrashIcon className="h-3 w-3" />
                          <span>{isLoading ? '削除中...' : '削除'}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ページング */}
        {sortedPracticeLogs.length > pageSize && (
          <div className="mt-4 pt-4 px-4 sm:px-6 pb-6 border-t border-gray-200">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedPracticeLogs.length}
              itemsPerPage={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* フォームモーダル */}
      <PracticeLogForm
        isOpen={isFormOpen}
        onClose={() => {
          // フォームを閉じる時にミューテーションのエラー状態をリセット
          createPracticeMutation.reset()
          updatePracticeMutation.reset()
          createPracticeLogMutation.reset()
          updatePracticeLogMutation.reset()
          closeForm()
        }}
        onSubmit={handlePracticeSubmit}
        practiceId={editingData?.practiceId || ''}
        editData={editingData ? {
          id: editingData.id,
          style: editingData.style,
          distance: editingData.distance,
          rep_count: editingData.rep_count,
          set_count: editingData.set_count,
          circle: editingData.circle,
          note: editingData.note,
          tags: editingData.tags,
          times: editingData.times.map(t => ({
            memberId: '',
            times: [{
              setNumber: t.setNumber,
              repNumber: t.repNumber,
              time: t.time
            }]
          }))
        } : undefined}
        isLoading={isLoading}
        availableTags={tags}
        styles={styles}
        setAvailableTags={setTags}
      />

      {/* 練習記録表示モーダル（編集・削除・追加ボタンなし） */}
      {selectedPracticeForTime && (
        <PracticeTimeModal
          isOpen={showTimeModal}
          onClose={handleTimeModalClose}
          practiceId={selectedPracticeForTime.id}
          place={selectedPracticeForTime.place || undefined}
        />
      )}

      {/* シェアカードモーダル */}
      {showShareModal && shareData && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setShareData(null)
          }}
          type="practice"
          data={shareData}
        />
      )}
    </div>
  )
}

