'use client'

import React, { useState } from 'react'
import { CalendarDaysIcon, ClockIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import PracticeTimeModal from './_components/PracticeTimeModal'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { usePractices } from '@apps/shared/hooks/usePractices'
import { PracticeAPI, StyleAPI } from '@apps/shared/api'

export default function PracticePage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingLog, setEditingLog] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editingData, setEditingData] = useState<any>(null)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [selectedPracticeForTime, setSelectedPracticeForTime] = useState<any>(null)
  
  // タグフィルタリング用の状態
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showTagFilter, setShowTagFilter] = useState(false)
  const [styles, setStyles] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])

  const supabase = createClient()
  
  // 練習記録を取得
  const {
    practices,
    loading,
    error,
    createPractice,
    updatePractice,
    deletePractice,
    createPracticeLog,
    updatePracticeLog,
    deletePracticeLog,
    refetch
  } = usePractices(supabase, {})

  // practice_logsを平坦化し、タグデータを整形
  const practiceLogs = practices.flatMap(practice => 
    (practice.practice_logs || []).map(log => {
      // タグデータを整形（practice_log_tags -> tags に変換）
      const tags = (log as any).practice_log_tags?.map((plt: any) => ({
        id: plt.practice_tags?.id || plt.practice_tag_id,
        name: plt.practice_tags?.name || '',
        color: plt.practice_tags?.color || '#gray'
      })) || []

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
  )

  // スタイルデータとタグデータを取得
  React.useEffect(() => {
    const loadMasterData = async () => {
      try {
        const styleAPI = new StyleAPI(supabase)
        const stylesData = await styleAPI.getStyles()
        setStyles(stylesData)

        // タグデータ取得
        const { data: tagsData } = await supabase
          .from('practice_tags')
          .select('*')
          .order('name')
        
        if (tagsData) {
          setTags(tagsData)
        }
      } catch (err) {
        console.error('マスターデータの取得に失敗:', err)
      }
    }
    loadMasterData()
  }, [])

  // タグフィルタリングロジック
  const filteredPracticeLogs = practiceLogs.filter((log: any) => {
    if (selectedTagIds.length === 0) return true
    
    const logTagIds = (log.tags || []).map((tag: any) => tag.id)
    return selectedTagIds.some(tagId => logTagIds.includes(tagId))
  })
  
  // 日付の降順でソート
  const sortedPracticeLogs = [...filteredPracticeLogs].sort((a, b) => {
    const dateA = new Date(a.practice?.date || a.created_at)
    const dateB = new Date(b.practice?.date || b.created_at)
    return dateB.getTime() - dateA.getTime()
  })

  // セットごとの平均タイムを計算する関数
  const calculateSetAverages = (times: any[], repCount: number, setCount: number) => {
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
        const sum = setTimes.reduce((acc: number, time: any) => acc + (time.time || 0), 0)
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

  // タグの保存処理
  const savePracticeLogTags = async (practiceLogId: string, newTags: any[]) => {
    try {
      // 既存のタグをすべて削除
      await supabase
        .from('practice_log_tags')
        .delete()
        .eq('practice_log_id', practiceLogId)
      
      // 新しいタグを追加
      if (newTags.length > 0) {
        await (supabase as any)
          .from('practice_log_tags')
          .insert(newTags.map(tag => ({
            practice_log_id: practiceLogId,
            practice_tag_id: tag.id
          })))
      }
    } catch (error) {
      console.error('タグの保存処理でエラーが発生しました:', error)
    }
  }

  const handleEditLog = (log: any) => {
    setEditingItem({
      id: log.practiceId,
      item_type: 'practice',
      item_date: log.practice?.date
    })
    setSelectedDate(new Date(log.practice?.date || new Date()))
    setEditingLog(log)
    
    // 編集データを設定
    // タイムデータをフォームが期待する形式に変換
    const formattedTimes = (log.practice_times || []).map((time: any) => ({
      setNumber: time.set_number,
      repNumber: time.rep_number,
      time: time.time
    }))

    setEditingData({
      id: log.id,
      practiceId: log.practiceId,
      date: log.practice?.date || new Date().toISOString().split('T')[0],
      place: log.practice?.place || '',
      note: log.practice?.note || '',
      style: log.style,
      rep_count: log.rep_count,
      set_count: log.set_count || 1,
      distance: log.distance,
      circle: log.circle,
      times: formattedTimes,
      tags: log.tags || []
    })
    
    setIsFormOpen(true)
  }

  const handleTimeLog = (log: any) => {
    setSelectedPracticeForTime({
      id: log.practiceId,
      location: log.practice?.place
    })
    setShowTimeModal(true)
  }

  const handlePracticeSubmit = async (formDataArray: any[]) => {
    setIsLoading(true)
    try {
      const menus = Array.isArray(formDataArray) ? formDataArray : []

      if (editingData && editingItem?.item_type === 'practice') {
        // 編集時の処理
        const firstMenu = menus[0] || {}
        const practiceInput = {
          date: firstMenu.practiceDate || editingData.date,
          place: firstMenu.location || editingData.place,
          note: firstMenu.note || editingData.note
        }
        
        await updatePractice(editingData.practiceId, practiceInput)
        
        // Practice_log更新
        for (const menu of menus) {
          const logInput = {
            practice_id: editingData.practiceId,
            style: menu.style || 'Fr',
            rep_count: menu.reps || 1,
            set_count: menu.sets || 1,
            distance: menu.distance || 100,
            circle: menu.circleTime || null,
            note: menu.note || ''
          }
          
          await updatePracticeLog(editingData.id, logInput)
          
          // タグの保存
          await savePracticeLogTags(editingData.id, menu.tags || [])
        }
      } else {
        // 新規作成時の処理
        const firstMenu = menus[0] || {}
        const practiceInput = {
          date: firstMenu.practiceDate || new Date().toISOString().split('T')[0],
          place: firstMenu.location || '',
          note: firstMenu.note || ''
        }
        
        const newPractice = await createPractice(practiceInput)

        // 各メニューをPracticeLogとして作成
        for (const menu of menus) {
          const logInput = {
            practice_id: newPractice.id,
            style: menu.style || 'Fr',
            rep_count: menu.reps || 1,
            set_count: menu.sets || 1,
            distance: menu.distance || 100,
            circle: menu.circleTime || null,
            note: menu.note || ''
          }
          
          const newLog = await createPracticeLog(logInput)
          
          // タグの保存
          if (menu.tags && menu.tags.length > 0) {
            await savePracticeLogTags(newLog.id, menu.tags)
          }
        }
      }

      // データを再取得
      await refetch()
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
      alert('練習記録の保存に失敗しました。')
    } finally {
      setIsLoading(false)
      setIsFormOpen(false)
      setEditingLog(null)
      setSelectedDate(null)
      setEditingItem(null)
      setEditingData(null)
    }
  }

  const handleFormClose = () => {
    setIsFormOpen(false)
    setEditingLog(null)
    setSelectedDate(null)
  }

  const handleTimeModalClose = () => {
    setShowTimeModal(false)
    setSelectedPracticeForTime(null)
  }

  const handleDeleteLog = async (logId: string) => {
    if (confirm('この練習記録を削除しますか？')) {
      setIsLoading(true)
      try {
        // 削除対象のPractice_Logの情報を取得
        const logToDelete = practiceLogs.find((log: any) => log.id === logId)
        const practiceId = logToDelete?.practiceId

        // Practice_Logを削除
        await deletePracticeLog(logId)

        // Practice_Log削除後、そのPracticeに紐づく他のPractice_Logがあるかチェック
        if (practiceId) {
          const remainingLogs = practiceLogs.filter((log: any) => 
            log.practiceId === practiceId && log.id !== logId
          )

          // 紐づくPractice_Logがない場合は、Practiceも削除
          if (remainingLogs.length === 0) {
            try {
              await deletePractice(practiceId)
            } catch (practiceDeleteError) {
              console.error('Practiceの削除に失敗しました:', practiceDeleteError)
            }
          }
        }

        // 明示的にrefetchを実行
        await refetch()
      } catch (error) {
        console.error('削除エラー:', error)
        alert('削除に失敗しました')
      } finally {
        setIsLoading(false)
      }
    }
  }

  if (loading || isLoading) {
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

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">練習記録</h1>
          <div className="text-red-600">
            エラーが発生しました: {error.message}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
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
              onClick={() => setShowTagFilter(!showTagFilter)}
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
              {tags.map((tag: any) => (
                <button
                  key={tag.id}
                  onClick={() => {
                    if (selectedTagIds.includes(tag.id)) {
                      setSelectedTagIds(selectedTagIds.filter(id => id !== tag.id))
                    } else {
                      setSelectedTagIds([...selectedTagIds, tag.id])
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
                  onClick={() => setSelectedTagIds([])}
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

      {/* 統計情報 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CalendarDaysIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
            <div className="ml-3 sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-gray-600">総練習日数</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">
                {practices.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 練習記録一覧（表形式） */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-3 sm:px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            練習記録一覧
          </h2>
        </div>
        
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
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      場所
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      距離・本数・セット
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      サークル
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      種目
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タグ
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タイム
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      メモ
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedPracticeLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {log.practice?.date ? format(new Date(log.practice.date), 'MM/dd', { locale: ja }) : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {log.practice?.place || '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {log.distance}m × {log.rep_count}本 × {log.set_count}セット
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {log.style}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {log.tags && log.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {log.tags.map((tag: any) => (
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
                      <td className="px-3 py-3 whitespace-nowrap">
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
                      <td className="px-3 py-3 text-sm text-gray-900 max-w-xs truncate">
                        {log.note || '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          {log.practice_times && log.practice_times.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTimeLog(log)}
                              className="flex items-center space-x-1"
                            >
                              <ClockIcon className="h-4 w-4" />
                              <span>タイム</span>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditLog(log)}
                            className="flex items-center space-x-1"
                          >
                            <PencilIcon className="h-4 w-4" />
                            <span>編集</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteLog(log.id)}
                            disabled={isLoading}
                            className="flex items-center space-x-1 text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <TrashIcon className="h-4 w-4" />
                            <span>{isLoading ? '削除中...' : '削除'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* タブレット・モバイル表示（カード形式） */}
            <div className="lg:hidden">
              <div className="divide-y divide-gray-200">
                {sortedPracticeLogs.map((log: any) => (
                  <div key={log.id} className="p-4 hover:bg-gray-50">
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
                              {log.tags.map((tag: any) => (
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
                        {log.practice_times && log.practice_times.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTimeLog(log)}
                            className="flex items-center justify-center space-x-1 text-xs px-2 py-1"
                          >
                            <ClockIcon className="h-3 w-3" />
                            <span>タイム</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditLog(log)}
                          className="flex items-center justify-center space-x-1 text-xs px-2 py-1"
                        >
                          <PencilIcon className="h-3 w-3" />
                          <span>編集</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteLog(log.id)}
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
      </div>

      {/* フォームモーダル */}
      <PracticeLogForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          setSelectedDate(null)
          setEditingItem(null)
          setEditingData(null)
          setEditingLog(null)
        }}
        onSubmit={handlePracticeSubmit}
        practiceId={editingData?.practiceId || ''}
        editData={editingData}
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
          location={selectedPracticeForTime.location}
        />
      )}
    </div>
  )
}
