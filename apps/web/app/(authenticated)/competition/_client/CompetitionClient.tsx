'use client'

import React from 'react'
import { TrophyIcon, PencilIcon, TrashIcon, EyeIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import RecordLogForm, { type RecordLogFormData } from '@/components/forms/RecordLogForm'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { formatTime } from '@/utils/formatters'
import { useAuth } from '@/contexts'
import {
  useRecordsQuery,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useReplaceSplitTimesMutation,
} from '@apps/shared/hooks/queries/records'
import type { Record, Competition, Style, SplitTime, RecordWithDetails } from '@apps/shared/types/database'
import { 
  useCompetitionFilterStore, 
  useCompetitionRecordStore 
} from '@/stores'

interface CompetitionClientProps {
  // サーバー側で取得したデータ
  initialRecords: RecordWithDetails[]
  styles: Style[]
}

/**
 * 大会記録ページのインタラクティブ部分を担当するClient Component
 */
export default function CompetitionClient({
  initialRecords,
  styles
}: CompetitionClientProps) {
  const { supabase } = useAuth()
  
  // Zustandストア
  const {
    filterStyle,
    includeRelay,
    filterPoolType,
    setFilterStyle,
    setIncludeRelay,
    setFilterPoolType,
  } = useCompetitionFilterStore()
  
  const {
    isFormOpen,
    isLoading,
    editingData,
    selectedRecord,
    showDetailModal,
    openForm,
    closeForm,
    openDetailModal,
    closeDetailModal,
    setStyles,
    setLoading,
  } = useCompetitionRecordStore()

  // サーバー側から取得したデータをストアに設定
  React.useEffect(() => {
    setStyles(styles)
  }, [styles, setStyles])

  // 大会記録を取得（リアルタイム更新用）
  const {
    records = [],
    isLoading: loading,
    error,
    refetch: _refetch
  } = useRecordsQuery(supabase, {
    initialRecords,
  })

  // ミューテーションフック
  const updateRecordMutation = useUpdateRecordMutation(supabase)
  const deleteRecordMutation = useDeleteRecordMutation(supabase)
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase)

  // サーバー側で取得した初期データとリアルタイム更新されたデータを統合
  // React Queryのキャッシュを使用
  const displayRecords = records
  
  // フィルタリングロジック
  const filteredRecords = displayRecords.filter((record: Record) => {
    // 種目フィルタ
    if (filterStyle) {
      const recordStyleId = record.style_id
      const filterStyleId = parseInt(filterStyle)
      
      if (recordStyleId !== filterStyleId) {
        return false
      }
    }
    
    // リレーフィルタ
    if (!includeRelay && record.is_relaying) {
      return false
    }
    
    // プール種別フィルタ
    if (filterPoolType === 'long' && record.competition?.pool_type !== 1) {
      return false
    }
    if (filterPoolType === 'short' && record.competition?.pool_type !== 0) {
      return false
    }
    
    return true
  })

  // 日付の降順でソート
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const dateA = new Date(a.competition?.date || a.created_at)
    const dateB = new Date(b.competition?.date || b.created_at)
    return dateB.getTime() - dateA.getTime()
  })

  const handleEditRecord = async (record: Record) => {
    openForm(record)
  }

  const handleViewRecord = (record: Record) => {
    openDetailModal(record)
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (confirm('この大会記録を削除しますか？')) {
      setLoading(true)
      try {
        await deleteRecordMutation.mutateAsync(recordId)
      } catch (error) {
        console.error('削除エラー:', error)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleRecordSubmit = async (dataList: RecordLogFormData[]) => {
    setLoading(true)
    try {
      // /competitionページは編集のみなので、常にeditingDataからcompetitionIdを取得
      let competitionId: string | null = null
      if (editingData && typeof editingData === 'object' && editingData !== null) {
        if ('competition_id' in editingData && typeof editingData.competition_id === 'string') {
          competitionId = editingData.competition_id
        } else if ('competitionId' in editingData && typeof editingData.competitionId === 'string') {
          competitionId = editingData.competitionId
        }
      }

      if (!competitionId) {
        throw new Error('Competition ID が見つかりません')
      }

      // 配列の最初の要素を処理（編集モードでは通常1つの記録のみ）
      const formData = dataList[0]
      if (!formData) {
        throw new Error('記録データが見つかりません')
      }

      const recordInput = {
        style_id: parseInt(formData.styleId),
        time: formData.time,
        video_url: formData.videoUrl || null,
        note: formData.note || null,
        is_relaying: formData.isRelaying || false,
        competition_id: competitionId || null
      }

      if (editingData && editingData.id) {
        // 更新処理
        await updateRecordMutation.mutateAsync({
          id: editingData.id,
          updates: recordInput
        })
        
        // スプリットタイム更新（空配列でも常に呼び出して既存のスプリットタイムを削除可能にする）
        const splitTimesData = (formData.splitTimes || []).map((st) => ({
          distance: st.distance,
          split_time: st.splitTime
        }))
        
        await replaceSplitTimesMutation.mutateAsync({
          recordId: editingData.id,
          splitTimes: splitTimesData
        })
      }
      
      closeForm()
    } catch (error) {
      console.error('大会記録の保存に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || isLoading || updateRecordMutation.isPending || deleteRecordMutation.isPending || replaceSplitTimesMutation.isPending) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">大会記録</h1>
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

  const errorMessage = error?.message || updateRecordMutation.error?.message || deleteRecordMutation.error?.message || replaceSplitTimesMutation.error?.message

  if (errorMessage && !loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">大会記録</h1>
          <div className="text-red-600">
            エラーが発生しました: {errorMessage}
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
              大会記録
            </h1>
            <p className="text-gray-600">
              大会での記録を管理・分析します。
            </p>
          </div>
        </div>
      </div>

      {/* 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <TrophyIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">総大会記録数</p>
              <p className="text-2xl font-bold text-gray-900">
                {displayRecords.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrophyIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">表示中の記録数</p>
              <p className="text-2xl font-bold text-gray-900">
                {sortedRecords.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* フィルタリングセクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 種目フィルタ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              種目
            </label>
            <select
              value={filterStyle}
              onChange={(e) => setFilterStyle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべての種目</option>
              {styles.map((style: Style) => (
                <option key={style.id} value={style.id}>
                  {style.name_jp}
                </option>
              ))}
            </select>
          </div>

          {/* プール種別フィルタ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              プール種別
            </label>
            <select
              value={filterPoolType}
              onChange={(e) => setFilterPoolType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべて</option>
              <option value="short">短水路(25m)</option>
              <option value="long">長水路(50m)</option>
            </select>
          </div>

          {/* リレーフィルタ */}
          <div className="flex flex-col justify-center">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="includeRelay"
                checked={includeRelay}
                onChange={(e) => setIncludeRelay(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="includeRelay" className="ml-2 text-sm text-gray-700">
                引き継ぎ記録
              </label>
            </div>
          </div>

          {/* クリアボタン */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              クリア
            </label>
            <Button
              variant="outline"
              onClick={() => {
                setFilterStyle('')
                setIncludeRelay(true)
                setFilterPoolType('')
              }}
              className="w-full text-sm"
            >
              フィルタをリセット
            </Button>
          </div>
        </div>
      </div>

      {/* 大会記録一覧（表形式） */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            大会記録一覧
          </h2>
        </div>
        
        {displayRecords.length === 0 ? (
          <div className="p-12 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">大会記録がありません</h3>
            <p className="mt-1 text-sm text-gray-500">
              最初の大会記録を作成しましょう。
            </p>
          </div>
        ) : sortedRecords.length === 0 ? (
          <div className="p-12 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">該当する記録がありません</h3>
            <p className="mt-1 text-sm text-gray-500">
              選択した条件に一致する大会記録が見つかりませんでした。
            </p>
            <div className="mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setFilterStyle('')
                  setIncludeRelay(true)
                  setFilterPoolType('')
                }}
                className="text-sm"
              >
                フィルタをリセット
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    日付
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    大会名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    場所
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    種目
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    記録
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    プール
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
                {sortedRecords.map((record: Record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(record.competition as Competition)?.date ? format(new Date((record.competition as Competition).date), 'MM/dd', { locale: ja }) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(record.competition as Competition)?.title || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(record.competition as Competition)?.place || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(record.style as Style)?.name_jp || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.time ? (
                        <>
                          {formatTime(record.time)}
                          {record.is_relaying && <span className="font-bold text-red-600 ml-1">R</span>}
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(record.competition as Competition)?.pool_type === 1 ? '長水路' : (record.competition as Competition)?.pool_type === 0 ? '短水路' : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {record.note || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewRecord(record)}
                          className="flex items-center space-x-1"
                        >
                          <EyeIcon className="h-4 w-4" />
                          <span>詳細</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditRecord(record)}
                          className="flex items-center space-x-1"
                        >
                          <PencilIcon className="h-4 w-4" />
                          <span>編集</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteRecord(record.id)}
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
        )}
      </div>

      {/* フォームモーダル */}
      <RecordLogForm
        isOpen={isFormOpen}
        onClose={() => {
          closeForm()
        }}
        onSubmit={handleRecordSubmit}
        competitionId={
          editingData && typeof editingData === 'object' && 'competition_id' in editingData
            ? (editingData.competition_id as string | null) || ''
            : editingData && typeof editingData === 'object' && 'competitionId' in editingData
            ? (editingData.competitionId as string | null | undefined) || ''
            : ''
        }
        editData={editingData && typeof editingData === 'object' && 'style_id' in editingData
          ? {
              id: editingData.id,
              styleId: editingData.style_id,
              time: editingData.time,
              isRelaying: editingData.is_relaying,
              splitTimes: editingData.split_times?.map(st => ({
                distance: st.distance,
                splitTime: st.split_time
              })),
              note: editingData.note ?? undefined,
              videoUrl: editingData.video_url ?? undefined
            }
          : null}
        isLoading={isLoading}
        styles={styles.map(style => ({
          id: style.id.toString(),
          nameJp: style.name_jp,
          distance: style.distance
        }))}
      />

      {/* 詳細モーダル */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* オーバーレイ */}
            <div 
              className="fixed inset-0 bg-black/40 transition-opacity" 
              onClick={() => {
                closeDetailModal()
              }}
            ></div>

            {/* モーダルコンテンツ */}
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              {/* ヘッダー */}
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    大会記録詳細
                  </h3>
                  <button
                    onClick={() => {
                      closeDetailModal()
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* 大会記録セクション */}
                <div className="mb-6">
                  <h4 className="text-md font-semibold text-blue-700 mb-3 flex items-center">
                    <span className="mr-2">🏊‍♂️</span>
                    大会記録
                  </h4>
                  <div className="space-y-3">
                    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900 mb-2">
                          {selectedRecord.style?.name_jp || '記録'}: {selectedRecord.time ? (
                            <>
                              {formatTime(selectedRecord.time)}
                              {selectedRecord.is_relaying && <span className="font-bold text-red-600 ml-1">R</span>}
                            </>
                          ) : '-'}
                        </h5>
                        {selectedRecord.competition?.title && (
                          <p className="text-sm text-gray-600 mb-1">
                            🏆 {selectedRecord.competition.title}
                          </p>
                        )}
                        {selectedRecord.competition?.place && (
                          <p className="text-sm text-gray-600 mb-1">
                            📍 {selectedRecord.competition.place}
                          </p>
                        )}
                        {selectedRecord.competition?.pool_type != null && (
                          <p className="text-sm text-gray-600 mb-1">
                            🏊‍♀️ {selectedRecord.competition.pool_type === 1 ? '長水路(50m)' : '短水路(25m)'}
                          </p>
                        )}
                        {selectedRecord.time && (
                          <p className="text-lg font-semibold text-blue-700 mb-1">
                            ⏱️ {formatTime(selectedRecord.time)}{selectedRecord.is_relaying && <span className="font-bold text-red-600 ml-1">R</span>}
                          </p>
                        )}
                        {selectedRecord.note && (
                          <p className="text-sm text-gray-600 mt-2">
                            💭 {selectedRecord.note}
                          </p>
                        )}
                        
                        {/* スプリットタイム */}
                        {selectedRecord.split_times && selectedRecord.split_times.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-blue-800 mb-1">スプリット</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {selectedRecord.split_times
                                .slice()
                                .sort((a: SplitTime, b: SplitTime) => (a.distance || 0) - (b.distance || 0))
                                .map((st: SplitTime) => (
                                  <div key={st.id} className="text-xs text-blue-900 bg-blue-100 rounded px-2 py-1">
                                    <span className="mr-2">{st.distance}m</span>
                                    <span className="font-semibold">{formatTime(st.split_time)}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* フッター */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => {
                    closeDetailModal()
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

