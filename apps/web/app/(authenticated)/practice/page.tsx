'use client'

import React, { useState } from 'react'
import { PlusIcon, CalendarDaysIcon, ClockIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import PracticeTimeForm from '@/components/forms/PracticeTimeForm'
import PracticeTimeModal from './_components/PracticeTimeModal'
import { useMyPracticeLogs, useDeletePracticeLog } from '@/hooks/useGraphQL'
import { useMutation, useQuery } from '@apollo/client/react'
import { CREATE_PRACTICE, CREATE_PRACTICE_LOG, UPDATE_PRACTICE, UPDATE_PRACTICE_LOG, DELETE_PRACTICE, DELETE_PRACTICE_LOG, CREATE_PRACTICE_TIME, UPDATE_PRACTICE_TIME, DELETE_PRACTICE_TIME, ADD_PRACTICE_LOG_TAG, REMOVE_PRACTICE_LOG_TAG } from '@/graphql/mutations'
import { GET_STYLES, GET_PRACTICE } from '@/graphql/queries'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'

export default function PracticePage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isTimeFormOpen, setIsTimeFormOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingLog, setEditingLog] = useState<any>(null)
  const [selectedLogForTime, setSelectedLogForTime] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editingData, setEditingData] = useState<any>(null)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [selectedPracticeForTime, setSelectedPracticeForTime] = useState<any>(null)

  // 練習記録を取得（全てのデータを表示）
  const { data: practiceLogsData, loading, error, refetch } = useMyPracticeLogs()

  const [deletePracticeLog] = useDeletePracticeLog()

  // スタイルデータを取得
  const { data: stylesData } = useQuery(GET_STYLES)
  const styles = (stylesData as any)?.styles || []

  // 編集時の詳細データを取得
  const { data: practiceData, loading: practiceDataLoading, error: practiceDataError } = useQuery(GET_PRACTICE, {
    variables: { id: editingItem?.id },
    skip: !editingItem || editingItem.item_type !== 'practice',
  })

  // 編集データの設定（ダッシュボードと同じ処理）
  React.useEffect(() => {
    if (practiceData && editingItem?.item_type === 'practice') {
      const practice = (practiceData as any)?.practice
      if (practice) {
        const practiceLogs = practice.practiceLogs || []
        let newEditingData: any = null

        if (practiceLogs.length > 1) {
          // 複数のPractice_logがある場合
          newEditingData = {
            id: practice.id,
            practiceId: practice.id,
            date: practice.date || new Date().toISOString().split('T')[0],
            place: practice.place || '',
            note: practice.note || '',
            practiceLogs: practiceLogs // 複数のPractice_logを渡す
          }
        } else if (practiceLogs.length === 1) {
          // 単一のPractice_logの場合、従来の構造を維持
          const practiceLog = practiceLogs[0]
          newEditingData = {
            id: practiceLog.id, // Practice_log ID
            practiceId: practice.id,
            date: practice.date || new Date().toISOString().split('T')[0],
            place: practice.place || '',
            note: practice.note || '',
            style: practiceLog.style,
            repCount: practiceLog.repCount,
            setCount: practiceLog.setCount,
            distance: practiceLog.distance,
            circle: practiceLog.circle,
            times: practiceLog.times || [], // 単一のPractice_logのタイムデータ
            tags: practiceLog.tags || [] // 単一のPractice_logのタグデータ
          }
        } else {
          // Practice_logがない場合（通常は発生しない）
          newEditingData = {
            id: practice.id,
            practiceId: practice.id,
            date: practice.date || new Date().toISOString().split('T')[0],
            place: practice.place || '',
            note: practice.note || ''
          }
        }

        setEditingData(newEditingData)
      }
    }
  }, [practiceData, editingItem])

  // ミューテーション
  const [createPractice] = useMutation(CREATE_PRACTICE)
  const [updatePractice] = useMutation(UPDATE_PRACTICE)
  const [deletePractice] = useMutation(DELETE_PRACTICE)
  const [createPracticeLog] = useMutation(CREATE_PRACTICE_LOG)
  const [updatePracticeLog] = useMutation(UPDATE_PRACTICE_LOG)
  const [deletePracticeLogMutation] = useMutation(DELETE_PRACTICE_LOG)
  const [createPracticeTime] = useMutation(CREATE_PRACTICE_TIME)
  const [updatePracticeTime] = useMutation(UPDATE_PRACTICE_TIME)
  const [deletePracticeTime] = useMutation(DELETE_PRACTICE_TIME)
  const [addPracticeLogTag] = useMutation(ADD_PRACTICE_LOG_TAG)
  const [removePracticeLogTag] = useMutation(REMOVE_PRACTICE_LOG_TAG)

  const practiceLogs = (practiceLogsData as any)?.myPracticeLogs || []
  
  // 日付の降順でソート
  const sortedPracticeLogs = [...practiceLogs].sort((a, b) => {
    const dateA = new Date(a.practice?.date || a.createdAt)
    const dateB = new Date(b.practice?.date || b.createdAt)
    return dateB.getTime() - dateA.getTime()
  })

  // タグの保存処理（ダッシュボードと同じ）
  const savePracticeLogTags = async (practiceLogId: string, tags: any[], existingTags: any[] = []) => {
    try {
      // 既存のタグをすべて削除
      for (const existingTag of existingTags) {
        try {
          await removePracticeLogTag({
            variables: {
              practiceLogId: practiceLogId,
              practiceTagId: existingTag.id
            }
          })
        } catch (error) {
          console.error('既存タグの削除に失敗しました:', error)
        }
      }
      
      // 新しいタグを追加
      for (const tag of tags) {
        try {
          await addPracticeLogTag({
            variables: {
              practiceLogId: practiceLogId,
              practiceTagId: tag.id
            }
          })
        } catch (error) {
          console.error('タグの追加に失敗しました:', error)
        }
      }
    } catch (error) {
      console.error('タグの保存処理でエラーが発生しました:', error)
    }
  }

  const handleCreateLog = () => {
    setEditingLog(null)
    setSelectedDate(null)
    setEditingItem(null)
    setEditingData(null)
    setIsFormOpen(true)
  }

  const handleEditLog = (log: any) => {
    // ダッシュボードと同じ処理
    setEditingItem({
      id: log.practiceId,
      item_type: 'practice',
      item_date: log.practice?.date
    })
    setSelectedDate(new Date(log.practice?.date || new Date()))
    setEditingLog(log)
    setIsFormOpen(true)
  }

  const handleTimeLog = (log: any) => {
    // ダッシュボードと同じ表示にするため、Practice情報を取得
    setSelectedPracticeForTime({
      id: log.practiceId,
      location: log.practice?.place
    })
    setShowTimeModal(true)
  }

  const handlePracticeSubmit = async (formData: any) => {
    setIsLoading(true)
    try {
      const menus = Array.isArray(formData.sets) ? formData.sets : []
      const createdPracticeLogIds: string[] = []

      if (editingData && editingItem?.item_type === 'practice') {
        // 編集時の処理（簡略化）
        const practiceInput = {
          date: formData.practiceDate,
          place: formData.location,
          note: formData.note
        }
        await updatePractice({ variables: { id: editingData.practiceId, input: practiceInput } })
        
        // 編集時: 複数のPractice_logがある場合の処理
        if (editingData.practiceLogs && editingData.practiceLogs.length > 0) {
          // 複数のPractice_logを更新
          for (let i = 0; i < menus.length && i < editingData.practiceLogs.length; i++) {
            const m = menus[i]
            const existingLog = editingData.practiceLogs[i]
            const repsPerSet = (m?.reps as number) || 0
            const setCount = (m?.setCount as number) || 1
            const distancePerRep = (m?.distance as number) || 0
            const input = {
              practiceId: editingData.practiceId,
              style: m?.style || 'Fr',
              repCount: repsPerSet,
              setCount: setCount,
              distance: distancePerRep,
              circle: m?.circleTime || null,
              note: m?.note || ''
            }
            await updatePracticeLog({ variables: { id: existingLog.id, input } })
            
            // タグの保存
            const existingTags = existingLog.tags || []
            await savePracticeLogTags(existingLog.id, m?.tags || [], existingTags)
          }
        } else {
          // 単一のPractice_logの場合の従来の処理
          const m = menus[0] || {}
          const repsPerSet = (m?.reps as number) || 0
          const setCount = (m?.setCount as number) || 1
          const distancePerRep = (m?.distance as number) || 0
          const input = {
            practiceId: editingData.practiceId, // 既存のPractice IDを使用
            style: m?.style || 'Fr',
            repCount: repsPerSet,
            setCount: setCount,
            distance: distancePerRep,
            circle: m?.circleTime || null,
            note: m?.note || ''
          }
          await updatePracticeLog({ variables: { id: editingData.id, input } })
          
          // タグの保存
          const existingTags = editingData.tags || []
          await savePracticeLogTags(editingData.id, m?.tags || [], existingTags)
        }
      } else {
        // 新規作成時の処理
        const practiceInput = {
          date: formData.practiceDate,
          place: formData.location,
          note: formData.note
        }
        const practiceResult = await createPractice({ variables: { input: practiceInput } })
        const practiceId = (practiceResult.data as any)?.createPractice?.id

        if (practiceId) {
          // 各メニューをPracticeLogとして作成
          for (const m of menus) {
            const repsPerSet = (m?.reps as number) || 0
            const setCount = (m?.setCount as number) || 1
            const distancePerRep = (m?.distance as number) || 0
            const input = {
              practiceId: practiceId,
              style: m?.style || 'Fr',
              repCount: repsPerSet,
              setCount: setCount,
              distance: distancePerRep,
              circle: m?.circleTime || null,
              note: m?.note || ''
            }
            const result = await createPracticeLog({ variables: { input } })
            const id = (result.data as any)?.createPracticeLog?.id
            if (id) {
              createdPracticeLogIds.push(id)
              
              // タグの保存
              if (m?.tags && m.tags.length > 0) {
                for (const tag of m.tags) {
                  try {
                    await addPracticeLogTag({
                      variables: {
                        practiceLogId: id,
                        practiceTagId: tag.id
                      }
                    })
                  } catch (tagError) {
                    console.error('タグの保存に失敗しました:', tagError)
                  }
                }
              }
            }
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

  const handleTimeFormClose = () => {
    setIsTimeFormOpen(false)
    setSelectedLogForTime(null)
    // データを再取得
    refetch()
  }

  const handleTimeModalClose = () => {
    setShowTimeModal(false)
    setSelectedPracticeForTime(null)
  }

  const handleDeleteLog = async (logId: string) => {
    // ダッシュボードと同じ処理
    if (confirm('この練習記録を削除しますか？')) {
      setIsLoading(true)
      try {
        // 削除対象のPractice_Logの情報を取得
        const logToDelete = practiceLogs.find((log: any) => log.id === logId)
        const practiceId = logToDelete?.practiceId

        // Practice_Logを削除
        await deletePracticeLog({
          variables: { id: logId }
        })

        // Practice_Log削除後、そのPracticeに紐づく他のPractice_Logがあるかチェック
        if (practiceId) {
          const remainingLogs = practiceLogs.filter((log: any) => 
            log.practiceId === practiceId && log.id !== logId
          )

          // 紐づくPractice_Logがない場合は、Practiceも削除
          if (remainingLogs.length === 0) {
            try {
              await deletePractice({
                variables: { id: practiceId }
              })
              console.log('Practice_Logが紐づいていないPracticeを削除しました:', practiceId)
            } catch (practiceDeleteError) {
              console.error('Practiceの削除に失敗しました:', practiceDeleteError)
              // Practice削除に失敗してもエラーを表示しない（Practice_Logは削除済み）
            }
          }
        }

        // 明示的にrefetchを実行（キャッシュを無視）
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
              日々の練習内容を記録・分析します。
            </p>
          </div>
          <Button
            onClick={handleCreateLog}
            className="flex items-center space-x-2 w-full sm:w-auto justify-center"
          >
            <PlusIcon className="h-5 w-5" />
            <span>新しい練習記録</span>
          </Button>
        </div>
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
                {practiceLogs.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 練習記録一覧（表形式） */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            練習記録一覧
          </h2>
        </div>
        
        {practiceLogs.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">練習記録がありません</h3>
            <p className="mt-1 text-sm text-gray-500">
              最初の練習記録を作成しましょう。
            </p>
            <div className="mt-6">
              <Button onClick={handleCreateLog}>
                練習記録を作成
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      場所
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      距離・本数・セット
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      サークル
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      種目
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タグ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タイム
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      メモ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedPracticeLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.practice?.date ? format(new Date(log.practice.date), 'MM/dd', { locale: ja }) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.practice?.place || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.distance}m × {log.repCount}本{log.setCount > 1 ? ` × ${log.setCount}セット` : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.style}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.times && log.times.length > 0 ? (
                          <div className="text-sm">
                            {log.times.map((time: any, index: number) => {
                              const formatTime = (seconds: number): string => {
                                if (seconds === 0) return '0.00'
                                const minutes = Math.floor(seconds / 60)
                                const remainingSeconds = seconds % 60
                                return minutes > 0 
                                  ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
                                  : `${remainingSeconds.toFixed(2)}`
                              }
                              return (
                                <div key={time.id} className="text-gray-900">
                                  {formatTime(time.time)}
                                  {index < log.times.length - 1 && <br />}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {log.note || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          {log.times && log.times.length > 0 && (
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

            {/* タブレット表示（簡略テーブル） */}
            <div className="hidden md:block lg:hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      内容
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タイム
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedPracticeLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div className="font-medium">
                            {log.practice?.date ? format(new Date(log.practice.date), 'MM/dd', { locale: ja }) : '-'}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {log.practice?.place || '-'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {log.distance}m × {log.repCount}本{log.setCount > 1 ? ` × ${log.setCount}セット` : ''}
                          </div>
                          <div className="text-gray-600">
                            {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'} {log.style}
                          </div>
                          {log.tags && log.tags.length > 0 && (
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
                          )}
                          {log.note && (
                            <div className="text-gray-600 text-xs truncate max-w-xs">
                              {log.note}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.times && log.times.length > 0 ? (
                          <div className="text-sm">
                            {log.times.slice(0, 3).map((time: any, index: number) => {
                              const formatTime = (seconds: number): string => {
                                if (seconds === 0) return '0.00'
                                const minutes = Math.floor(seconds / 60)
                                const remainingSeconds = seconds % 60
                                return minutes > 0 
                                  ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
                                  : `${remainingSeconds.toFixed(2)}`
                              }
                              return (
                                <div key={time.id} className="text-gray-900">
                                  {formatTime(time.time)}
                                  {index < Math.min(log.times.length, 3) - 1 && <br />}
                                </div>
                              )
                            })}
                            {log.times.length > 3 && (
                              <div className="text-gray-500 text-xs">
                                +{log.times.length - 3}件
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-col space-y-1">
                          {log.times && log.times.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTimeLog(log)}
                              className="flex items-center justify-center space-x-1 text-xs"
                            >
                              <ClockIcon className="h-3 w-3" />
                              <span>タイム</span>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditLog(log)}
                            className="flex items-center justify-center space-x-1 text-xs"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>編集</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteLog(log.id)}
                            disabled={isLoading}
                            className="flex items-center justify-center space-x-1 text-xs text-red-600 hover:text-red-700"
                          >
                            <TrashIcon className="h-3 w-3" />
                            <span>{isLoading ? '削除中...' : '削除'}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* モバイル表示（カード形式） */}
            <div className="md:hidden">
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
                            {log.distance}m × {log.repCount}本{log.setCount > 1 ? ` × ${log.setCount}セット` : ''}
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
                          
                          {log.times && log.times.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs text-gray-500 mb-1">タイム:</div>
                              <div className="text-sm">
                                {log.times.slice(0, 3).map((time: any, index: number) => {
                                  const formatTime = (seconds: number): string => {
                                    if (seconds === 0) return '0.00'
                                    const minutes = Math.floor(seconds / 60)
                                    const remainingSeconds = seconds % 60
                                    return minutes > 0 
                                      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
                                      : `${remainingSeconds.toFixed(2)}`
                                  }
                                  return (
                                    <span key={time.id} className="text-gray-900">
                                      {formatTime(time.time)}
                                      {index < Math.min(log.times.length, 3) - 1 && ', '}
                                    </span>
                                  )
                                })}
                                {log.times.length > 3 && (
                                  <span className="text-gray-500 text-xs ml-1">
                                    +{log.times.length - 3}件
                                  </span>
                                )}
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
                        {log.times && log.times.length > 0 && (
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
        onDeletePracticeLog={async (practiceLogId: string) => {
          try {
            await deletePracticeLogMutation({
              variables: { id: practiceLogId }
            })
          } catch (error) {
            console.error('Practice_logの削除に失敗しました:', error)
            throw error
          }
        }}
        initialDate={selectedDate}
        editData={editingData}
        isLoading={isLoading}
      />

      {/* タイム記録フォームモーダル */}
      {selectedLogForTime && (
        <PracticeTimeForm
          isOpen={isTimeFormOpen}
          onClose={handleTimeFormClose}
          practiceLogId={selectedLogForTime.id}
          repCount={selectedLogForTime.repCount}
          setCount={selectedLogForTime.setCount}
          existingTimes={selectedLogForTime.times}
        />
      )}

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
