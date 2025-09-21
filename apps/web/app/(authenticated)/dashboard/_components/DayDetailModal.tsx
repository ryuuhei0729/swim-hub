'use client'

import React, { useState } from 'react'
import { XMarkIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { formatTime } from '@/utils/formatters'
import { useQuery } from '@apollo/client/react'
import { GET_RECORD, GET_PRACTICE } from '@/graphql/queries'

interface CalendarItem {
  id: string
  item_type: 'practice' | 'record'
  item_date: string
  title: string
  location?: string
  time_result?: number
  pool_type?: number
  tags?: string[]
  note?: string
  competition_name?: string
  style?: {
    id: string
    name_jp: string
    distance: number
  }
}

interface DayDetailModalProps {
  isOpen: boolean
  onClose: () => void
  date: Date
  entries: CalendarItem[]
  onEditItem?: (item: CalendarItem) => void
  onDeleteItem?: (itemId: string, itemType: 'practice' | 'record') => void
  onAddItem?: (date: Date, type: 'practice' | 'record') => void
}

export default function DayDetailModal({
  isOpen,
  onClose,
  date,
  entries,
  onEditItem,
  onDeleteItem,
  onAddItem
}: DayDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{id: string, type: 'practice' | 'record'} | null>(null)

  if (!isOpen) return null

  const practiceItems = entries.filter(e => e.item_type === 'practice')
  const recordItems = entries.filter(e => e.item_type === 'record')

  const handleDeleteConfirm = async () => {
    if (showDeleteConfirm) {
      await onDeleteItem?.(showDeleteConfirm.id, showDeleteConfirm.type)
      setShowDeleteConfirm(null)
      
      // 削除後、残りのエントリーがない場合はモーダルを閉じる
      const remainingEntries = entries.filter(e => e.id !== showDeleteConfirm.id)
      if (remainingEntries.length === 0) {
        onClose()
      }
    }
  }


  const getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? '長水路(50m)' : '短水路(25m)'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        ></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {format(date, 'M月d日（E）', { locale: ja })}の記録
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* エントリーがない場合 */}
            {entries.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">この日の記録はありません</p>
                <div className="space-y-2">
                  <button
                    onClick={() => onAddItem?.(date, 'practice')}
                    className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <span className="mr-2">💪</span>
                    練習記録を追加
                  </button>
                  <button
                    onClick={() => onAddItem?.(date, 'record')}
                    className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span className="mr-2">🏊‍♂️</span>
                    大会記録を追加
                  </button>
                </div>
              </div>
            )}

            {/* 練習記録セクション */}
            {practiceItems.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-green-700 mb-3 flex items-center">
                  <span className="mr-2">💪</span>
                  練習記録
                </h4>
                <div className="space-y-3">
                  {practiceItems.map((item) => (
                    <div key={item.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 mb-2">{item.title}</h5>
                          {item.location && (
                            <p className="text-sm text-gray-600 mb-1">
                              📍 {item.location}
                            </p>
                          )}
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {item.tags.map((tag, index) => (
                                <span
                                  key={index}
                                  className="inline-block px-2 py-1 text-xs bg-green-200 text-green-800 rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.note && (
                            <p className="text-sm text-gray-600 mt-2">
                              💭 {item.note}
                            </p>
                          )}
                          {/* 練習記録の詳細情報 */}
                          <PracticeDetails practiceId={item.id} />
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => {
                              console.log('DayDetailModal: Practice edit button clicked for item:', item)
                              console.log('DayDetailModal: onEditItem function:', onEditItem)
                              onEditItem?.(item)
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                            title="編集"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({id: item.id, type: item.item_type})}
                            className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
                            title="削除"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 大会記録セクション */}
            {recordItems.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-blue-700 mb-3 flex items-center">
                  <span className="mr-2">🏊‍♂️</span>
                  大会記録
                </h4>
                <div className="space-y-3">
                  {recordItems.map((item) => (
                    <div key={item.id} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 mb-2">{item.title}</h5>
                          {item.competition_name && (
                            <p className="text-sm text-gray-600 mb-1">
                              🏆 {item.competition_name}
                            </p>
                          )}
                          {item.location && (
                            <p className="text-sm text-gray-600 mb-1">
                              📍 {item.location}
                            </p>
                          )}
                          {item.style && (
                            <p className="text-sm text-gray-600 mb-1">
                              🏊 {item.style.name_jp}
                            </p>
                          )}
                          {item.time_result && (
                            <p className="text-lg font-semibold text-blue-700 mb-1">
                              ⏱️ {formatTime(item.time_result / 100)}
                            </p>
                          )}
                          {item.pool_type != null && (
                            <p className="text-sm text-gray-600 mb-1">
                              🏊‍♀️ {getPoolTypeText(item.pool_type)}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-sm text-gray-600 mt-2">
                              💭 {item.note}
                            </p>
                          )}
                          {/* スプリットタイム */}
                          <RecordSplitTimes recordId={item.id} />
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => onEditItem?.(item)}
                            className="p-2 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                            title="編集"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({id: item.id, type: item.item_type})}
                            className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
                            title="削除"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 記録追加ボタン（既に記録がある場合） */}
            {entries.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">記録を追加</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onAddItem?.(date, 'practice')}
                    className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <span className="mr-2">💪</span>
                    練習記録
                  </button>
                  <button
                    onClick={() => onAddItem?.(date, 'record')}
                    className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span className="mr-2">🏊‍♂️</span>
                    大会記録
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <TrashIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      記録を削除
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        この記録を削除してもよろしいですか？この操作は取り消せません。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleDeleteConfirm}
                >
                  削除
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowDeleteConfirm(null)}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 練習記録の詳細表示
function PracticeDetails({ practiceId }: { practiceId: string }) {
  const { data, loading, error } = useQuery(GET_PRACTICE, {
    variables: { id: practiceId },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    errorPolicy: 'ignore',
  })

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">練習詳細を読み込み中...</div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">練習詳細の取得に失敗しました</div>
    )
  }

  const practice = (data as any)?.practice
  if (!practice) {
    return null
  }

  const practiceLogs = practice.practiceLogs || []

  // デバッグ: タグ情報を確認
  console.log('PracticeDetails - practice:', practice)
  console.log('PracticeDetails - practiceLogs:', practiceLogs)
  practiceLogs.forEach((log: any, index: number) => {
    console.log(`PracticeDetails - log ${index}:`, log)
    console.log(`PracticeDetails - log ${index} tags:`, log.tags)
  })

  // 色の明度に基づいてテキスト色を決定する関数
  const getTextColor = (backgroundColor: string) => {
    // 16進数カラーをRGBに変換
    const hex = backgroundColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // 明度を計算（0-255）
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    
    // 明度が128より高い場合は黒、低い場合は白
    return brightness > 128 ? '#000000' : '#FFFFFF'
  }

  // 平均タイムを計算する関数
  const calculateAverageTime = (times: any[]) => {
    const validTimes = times.filter(t => t.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length
  }

  // セットごとの平均タイムを計算する関数
  const calculateSetAverageTime = (times: any[], setNumber: number) => {
    const setTimes = times.filter(t => t.setNumber === setNumber)
    return calculateAverageTime(setTimes)
  }

  return (
    <div className="mt-3 space-y-4">
      {practiceLogs.map((log: any, index: number) => {
        const allTimes = log.times || []
        const overallAverage = calculateAverageTime(allTimes)
        
        return (
          <div key={log.id} className="bg-white border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h6 className="font-medium text-green-800">
                メニュー{index + 1}: {log.style}
              </h6>
              {overallAverage > 0 && (
                <span className="text-sm font-semibold text-green-700">
                  全体平均: {formatTime(overallAverage)}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
              <div>距離: {log.distance}m</div>
              <div>セット数: {log.setCount}</div>
              <div>本数: {log.repCount}</div>
              <div>サークル: {log.circle}秒</div>
            </div>

            {log.note && (
              <div className="text-sm text-gray-600 mb-2">
                💭 {log.note}
              </div>
            )}

            {/* タグ表示 */}
            {log.tags && Array.isArray(log.tags) && log.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {log.tags.map((tag: any) => (
                  <span
                    key={tag.id}
                    className="inline-block px-2 py-1 text-xs rounded-full"
                    style={{ 
                      backgroundColor: tag.color,
                      color: getTextColor(tag.color)
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* セットごとのタイム表示 */}
            {allTimes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-green-700 mb-1">セット別タイム</p>
                <div className="space-y-1">
                  {Array.from({ length: log.setCount }, (_, setIndex) => {
                    const setNumber = setIndex + 1
                    const setAverage = calculateSetAverageTime(allTimes, setNumber)
                    const setTimes = allTimes.filter(t => t.setNumber === setNumber)
                    
                    return (
                      <div key={setNumber} className="flex items-center justify-between text-xs bg-green-50 rounded px-2 py-1">
                        <span className="text-green-800">セット{setNumber}</span>
                        <div className="flex items-center space-x-2">
                          {setAverage > 0 && (
                            <span className="font-medium text-green-700">
                              平均: {formatTime(setAverage)}
                            </span>
                          )}
                          <span className="text-gray-500">
                            ({setTimes.filter(t => t.time > 0).length}/{log.repCount}本)
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 大会記録のスプリットタイム一覧
function RecordSplitTimes({ recordId }: { recordId: string }) {
  const { data, loading, error } = useQuery(GET_RECORD, {
    variables: { id: recordId },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    errorPolicy: 'ignore',
  })

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">スプリットを読み込み中...</div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">スプリットの取得に失敗しました</div>
    )
  }

  const splits = (data as any)?.record?.splitTimes || []
  if (!splits.length) {
    return null
  }

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-blue-800 mb-1">スプリット</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {splits
          .slice()
          .sort((a: any, b: any) => (a.distance || 0) - (b.distance || 0))
          .map((st: any) => (
          <div key={st.id} className="text-xs text-blue-900 bg-blue-100 rounded px-2 py-1">
            <span className="mr-2">{st.distance}m</span>
            <span className="font-semibold">{formatTime(st.splitTime)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
