'use client'

import React, { useState, useEffect } from 'react'
import { XMarkIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { formatTime } from '@/utils/formatters'
import { createClient } from '@/lib/supabase'
import { CalendarItemType, DayDetailModalProps, CalendarItem } from '@/types'
import type { Record, Practice, PracticeLog, PracticeTime, PoolType } from '@apps/shared/types/database'

export default function DayDetailModal({
  isOpen,
  onClose,
  date,
  entries,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onAddRecord,
  onEditRecord,
  onDeleteRecord
}: DayDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{id: string, type: CalendarItemType} | null>(null)

  if (!isOpen) return null

  const practiceItems = entries.filter(e => e.type === 'practice' || e.type === 'team_practice')
  const recordItems = entries.filter(e => e.type === 'record')
  const competitionItems = entries.filter(e => e.type === 'competition' || e.type === 'team_competition')

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


  const _getPoolTypeText = (poolType: number) => {
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
                    練習予定を追加
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
                  {practiceItems.some(e => e.type === 'team_practice') && (
                    <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                      チーム練習含む
                    </span>
                  )}
                </h4>
                <div className="space-y-3">
                  {practiceItems.map((item) => (
                    <PracticeDetails 
                      key={item.id} 
                      practiceId={item.id} 
                      location={item.location}
                      isTeamPractice={item.type === 'team_practice'}
                      onEdit={() => onEditItem?.(item)}
                      onDelete={() => setShowDeleteConfirm({id: item.id, type: item.type})}
                      onAddPracticeLog={onAddPracticeLog}
                      onEditPracticeLog={onEditPracticeLog}
                      onDeletePracticeLog={onDeletePracticeLog}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 大会セクション */}
            {(competitionItems.length > 0 || recordItems.length > 0) && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-blue-700 mb-3 flex items-center">
                  <span className="mr-2">🏆</span>
                  大会
                  {competitionItems.some(e => e.type === 'team_competition') && (
                    <span className="ml-2 text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
                      チーム大会含む
                    </span>
                  )}
                </h4>
                <div className="space-y-3">
                  {/* Recordがない大会を表示 */}
                  {competitionItems.map((item) => (
                    <CompetitionDetails
                      key={item.id}
                      competitionId={item.id}
                      competitionName={item.title}
                      location={item.location}
                      poolType={item.metadata?.competition?.pool_type}
                      note={item.note}
                      isTeamCompetition={item.type === 'team_competition'}
                      onEdit={() => {
                        onEditItem?.(item)
                        onClose()
                      }}
                      onDelete={() => setShowDeleteConfirm({id: item.id, type: item.type})}
                      onAddRecord={onAddRecord}
                      onEditRecord={onEditRecord}
                      onDeleteRecord={onDeleteRecord}
                      onClose={onClose}
                    />
                  ))}
                  
                  {/* Recordがある大会をグルーピングして表示 */}
                  {(() => {
                    // metadataにcompetition_idが含まれている拡張型を定義
                    type RecordItemWithCompetition = CalendarItem & {
                      metadata: CalendarItem['metadata'] & { competition_id?: string }
                    }
                    
                    const competitionMap = new Map<string, RecordItemWithCompetition[]>()
                    recordItems.forEach(record => {
                      const recordWithCompId = record as RecordItemWithCompetition
                      const compId = recordWithCompId.metadata?.competition_id
                      
                      if (!compId) return
                      if (!competitionMap.has(compId)) {
                        competitionMap.set(compId, [])
                      }
                      competitionMap.get(compId)!.push(recordWithCompId)
                    })
                    
                    return Array.from(competitionMap.entries()).map(([compId, records]) => {
                      const firstRecord: RecordItemWithCompetition = records[0]
                      return (
                        <CompetitionDetails
                          key={compId}
                          competitionId={compId}
                          competitionName={firstRecord.title}
                          location={firstRecord.location}
                          poolType={firstRecord.metadata?.record?.style?.distance || 0}
                          note={firstRecord.note || undefined}
                          records={records}
                          onEdit={() => {
                            // Competition編集: 最初のRecordからCompetition情報を取得
                            const competitionData = {
                              id: compId,
                              type: 'competition' as const,
                              date: firstRecord.date || '',
                              title: firstRecord.title || '',
                              location: firstRecord.location || '',
                              note: firstRecord.note || undefined,
                              metadata: {
                                competition: {
                                  title: firstRecord.title || '',
                                  place: firstRecord.location || '',
                                  pool_type: 0 // pool_typeはrecordのmetadataに含まれていないため、デフォルト値
                                }
                              }
                            }
                            onEditItem?.(competitionData)
                            onClose()
                          }}
                          onDelete={() => setShowDeleteConfirm({id: compId, type: 'competition'})}
                          onAddRecord={onAddRecord}
                          onEditRecord={onEditRecord}
                          onDeleteRecord={onDeleteRecord}
                          onClose={onClose}
                        />
                      )
                    })
                  })()}
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
function PracticeDetails({ 
  practiceId, 
  location, 
  onEdit, 
  onDelete,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  isTeamPractice = false
}: { 
  practiceId: string
  location?: string
  onEdit?: () => void
  onDelete?: () => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (log: PracticeLog) => void
  onDeletePracticeLog?: (logId: string) => void
  isTeamPractice?: boolean
}) {
  const [practice, setPractice] = useState<Practice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadPractice = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('practices')
          .select(`
            *,
            practice_logs (
              *,
              practice_times (*),
              practice_log_tags (
                practice_tag:practice_tags (*)
              )
            )
          `)
          .eq('id', practiceId)
          .single()

        if (error) throw error
        if (!data) throw new Error('Practice data not found')
        
        // データ整形（camelCase構造に変換）
        const practiceData = data as any
        const formattedPractice = {
          ...practiceData,
          practiceLogs: (practiceData.practice_logs as any[])?.map((log: any) => ({
            id: log.id,
            practiceId: log.practice_id,
            style: log.style,
            repCount: log.rep_count,
            setCount: log.set_count,
            distance: log.distance,
            circle: log.circle,
            note: log.note,
            tags: log.practice_log_tags?.map((plt: any) => plt.practice_tag) || [],
            times: log.practice_times?.map((time: any) => ({
              id: time.id,
              time: time.time,
              repNumber: time.rep_number,
              setNumber: time.set_number
            })) || []
          })) || []
        }
        
        setPractice(formattedPractice)
      } catch (err) {
        console.error('練習詳細の取得エラー:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadPractice()
  }, [practiceId, supabase])

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

  if (!practice) {
    return null
  }

  const practiceLogs = practice.practiceLogs || practice.practice_logs || []

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
  const _calculateSetAverageTime = (times: any[], setNumber: number) => {
    const setTimes = times.filter(t => t.setNumber === setNumber)
    return calculateAverageTime(setTimes)
  }

  return (
    <div className="mt-3">
      {/* Practice全体の枠 */}
      <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl p-3">
        {/* Practice全体のヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-lg font-semibold px-3 py-1 rounded-lg ${
                isTeamPractice 
                  ? 'text-emerald-800 bg-emerald-200' 
                  : 'text-green-800 bg-green-200'
              }`}>
                🏊‍♂️ {isTeamPractice ? 'チーム練習記録' : '練習記録'}
              </span>
            </div>
            {location && (
              <p className="text-sm text-gray-700 mb-2 flex items-center gap-1">
                <span className="text-gray-500">📍</span>
                {location}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-green-600 rounded-lg hover:bg-green-100 transition-colors"
              title="練習記録を編集"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="練習記録を削除"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Practice_logsのコンテナ */}
        <div className="space-y-3">
          {/* PracticeLogsがない場合 */}
          {practiceLogs.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <div className="text-gray-500 mb-4">
                <span className="text-2xl">📝</span>
                <p className="text-sm mt-2">練習メニューがまだ登録されていません</p>
              </div>
              <button
                onClick={() => onAddPracticeLog?.(practiceId)}
                className="inline-flex items-center px-4 py-2 border border-green-300 rounded-lg shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
              >
                <span className="mr-2">➕</span>
                練習記録を追加
              </button>
            </div>
          )}

          {/* PracticeLogsがある場合の表示 */}
          {practiceLogs.map((log: any, index: number) => {
        const allTimes = log.times || []
        
            return (
              <div key={log.id} className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border-0 rounded-lg p-4">
                {/* 練習メニューのヘッダー */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-green-800 bg-green-100 px-3 py-1 rounded-lg">📋 練習メニュー {index + 1}</span>
                    </div>
                    {log.tags && Array.isArray(log.tags) && log.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {log.tags.map((tag: any) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
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
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => {
                        // フォームに必要な形式に変換
                        const formData = {
                          id: log.id,
                          user_id: log.user_id || '',
                          practice_id: log.practiceId || log.practice_id,
                          style: log.style,
                          rep_count: log.repCount || log.rep_count,
                          set_count: log.setCount || log.set_count,
                          distance: log.distance,
                          circle: log.circle,
                          note: log.note,
                          tags: log.tags,
                          times: log.times || [],
                          created_at: log.created_at || '',
                          updated_at: log.updated_at || ''
                        }
                        onEditPracticeLog?.(formData)
                      }}
                      className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      title="練習メニューを編集"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDeletePracticeLog?.(log.id)}
                      className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="練習メニューを削除"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
            
                {/* 練習内容: 距離 × 本数 × セット数 サークル 泳法 */}
                <div className="bg-white rounded-lg p-3 mb-3 border border-green-200">
                  <div className="text-xs font-medium text-gray-500 mb-1">練習内容</div>
                    <div className="text-sm text-gray-800">
                      <span className="text-lg font-semibold text-green-700">{log.distance}</span>m ×
                      <span className="text-lg font-semibold text-green-700">{log.repCount}</span>
                      {log.setCount > 1 && (
                        <>
                          {' × '}
                          <span className="text-lg font-semibold text-green-700">{log.setCount}</span>
                        </>
                      )}
                      {'　'}
                      <span className="text-lg font-semibold text-green-700">
                        {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'}
                      </span>
                      <span className="text-lg font-semibold text-green-700">　{log.style}</span>
                    </div>
                </div>

            {/* メモ */}
            {log.note && (
              <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-3 mb-3 border border-slate-200">
                <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                <div className="text-sm text-gray-700">
                  {log.note}
                </div>
              </div>
            )}

            {/* タイム表示 */}
            {allTimes.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-green-500 rounded-full"></div>
                  <p className="text-sm font-medium text-green-700">タイム</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-green-200">
                        <th className="text-left py-2 px-2 font-medium text-green-800"></th>
                        {Array.from({ length: log.setCount }, (_, setIndex) => (
                          <th key={setIndex + 1} className="text-center py-2 px-2 font-medium text-green-800">
                            {setIndex + 1}セット目
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: log.repCount }, (_, repIndex) => {
                        const repNumber = repIndex + 1
                        return (
                          <tr key={repNumber} className="border-b border-green-100">
                            <td className="py-2 px-2 font-medium text-gray-700">{repNumber}本目</td>
                            {Array.from({ length: log.setCount }, (_, setIndex) => {
                              const setNumber = setIndex + 1
                              const time = allTimes.find((t: any) => t.setNumber === setNumber && t.repNumber === repNumber)
                              const setTimes = allTimes.filter((t: any) => t.setNumber === setNumber && t.time > 0)
                              const setFastest = setTimes.length > 0 ? Math.min(...setTimes.map((t: any) => t.time)) : 0
                              const isFastest = time && time.time > 0 && time.time === setFastest
                              
                              return (
                                <td key={setNumber} className="py-2 px-2 text-center">
                                  <span className={isFastest ? "text-blue-600 font-bold" : "text-gray-800"}>
                                    {time && time.time > 0 ? formatTime(time.time) : '-'}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {/* 平均行 */}
                      <tr className="border-b border-green-100 bg-green-50">
                        <td className="py-2 px-2 font-medium text-green-800">セット平均</td>
                        {Array.from({ length: log.setCount }, (_, setIndex) => {
                          const setNumber = setIndex + 1
                          const setTimes = allTimes.filter((t: any) => t.setNumber === setNumber && t.time > 0)
                          const average = setTimes.length > 0 
                            ? setTimes.reduce((sum: any, t: any) => sum + t.time, 0) / setTimes.length 
                            : 0
                          return (
                            <td key={setNumber} className="py-2 px-2 text-center">
                              <span className="text-green-800 font-medium">
                                {average > 0 ? formatTime(average) : '-'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                      {/* 全体平均行 */}
                      <tr className="border-t-2 border-green-300 bg-blue-50">
                        <td className="py-2 px-2 font-medium text-blue-800">全体平均</td>
                        <td className="py-2 px-2 text-center" colSpan={log.setCount}>
                          <span className="text-blue-800 font-bold">
                            {(() => {
                              const allValidTimes = allTimes.filter((t: any) => t.time > 0)
                              const overallAverage = allValidTimes.length > 0 
                                ? allValidTimes.reduce((sum: any, t: any) => sum + t.time, 0) / allValidTimes.length 
                                : 0
                              return overallAverage > 0 ? formatTime(overallAverage) : '-'
                            })()}
                          </span>
                        </td>
                      </tr>
                      {/* 全体最速行 */}
                      <tr className="bg-blue-50">
                        <td className="py-2 px-2 font-medium text-blue-800">全体最速</td>
                        <td className="py-2 px-2 text-center" colSpan={log.setCount}>
                          <span className="text-blue-800 font-bold">
                            {(() => {
                              const allValidTimes = allTimes.filter((t: any) => t.time > 0)
                              const overallFastest = allValidTimes.length > 0 
                                ? Math.min(...allValidTimes.map((t: any) => t.time))
                                : 0
                              return overallFastest > 0 ? formatTime(overallFastest) : '-'
                            })()}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// 大会記録のスプリットタイム一覧
function RecordSplitTimes({ recordId }: { recordId: string }) {
  const [splits, setSplits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadSplits = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('split_times')
          .select('*')
          .eq('record_id', recordId)
          .order('distance', { ascending: true })

        if (error) throw error
        
        setSplits(data || [])
      } catch (err) {
        console.error('スプリットタイムの取得エラー:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadSplits()
  }, [recordId, supabase])

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

  if (!splits.length) {
    return null
  }

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-blue-800 mb-1">スプリット</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {splits.map((st: any) => (
          <div key={st.id} className="text-xs text-blue-900 bg-blue-100 rounded px-2 py-1">
            <span className="mr-2">{st.distance}m</span>
            <span className="font-semibold">{formatTime(st.split_time)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// CompetitionDetails: 大会情報とそれに紐づくRecordを表示
function CompetitionDetails({
  competitionId,
  competitionName,
  location,
  poolType,
  note,
  records = [],
  onEdit,
  onDelete,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onClose,
  isTeamCompetition = false
}: {
  competitionId: string
  competitionName?: string
  location?: string
  poolType?: number
  note?: string
  records?: any[]
  onEdit?: () => void
  onDelete?: () => void
  onAddRecord?: (competitionId: string) => void
  onEditRecord?: (record: any) => void
  onDeleteRecord?: (recordId: string) => void
  onClose?: () => void
  isTeamCompetition?: boolean
}) {
  const _getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? '長水路(50m)' : '短水路(25m)'
  }

  return (
    <div className="mt-3">
      {/* Competition全体の枠 */}
      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-3">
        {/* Competition全体のヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-lg font-semibold px-3 py-1 rounded-lg ${
                isTeamCompetition 
                  ? 'text-violet-800 bg-violet-200' 
                  : 'text-blue-800 bg-blue-200'
              }`}>
                🏆 {competitionName}
                {isTeamCompetition && <span className="ml-2 text-sm">(チーム大会)</span>}
              </span>
            </div>
            {location && (
              <p className="text-sm text-gray-700 mb-2 flex items-center gap-1">
                <span className="text-gray-500">📍</span>
                {location}
              </p>
            )}
            {poolType != null && (
              <p className="text-sm text-gray-700 mb-2 flex items-center gap-1">
                <span className="text-gray-500">🏊‍♀️</span>
                {_getPoolTypeText(poolType)}
              </p>
            )}
            {note && (
              <p className="text-sm text-gray-600 mt-2">
                💭 {note}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              title="大会情報を編集"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="大会を削除"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Recordsのコンテナ */}
        <div className="space-y-3">
          {/* Recordsがない場合 */}
          {records.length === 0 && (
            <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <div className="text-gray-500 mb-4">
                <span className="text-2xl">🏊‍♂️</span>
                <p className="text-sm mt-2">大会記録がまだ登録されていません</p>
              </div>
              <button
                onClick={() => {
                  onAddRecord?.(competitionId)
                  onClose?.()
                }}
                className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-lg shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <span className="mr-2">➕</span>
                大会記録を追加
              </button>
            </div>
          )}

          {/* Recordsがある場合の表示 */}
          {records.map((record: any, index: number) => {
            return (
              <div key={record.id} className="bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 border-0 rounded-lg p-4">
                {/* 記録のヘッダー */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-blue-800 bg-blue-100 px-3 py-1 rounded-lg">🏊‍♂️ 記録 {index + 1}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={async () => {
                        // Record編集時は、DBから最新データを取得してsplit_timesも含める
                        const supabase = createClient()
                        const { data: fullRecord } = await supabase
                          .from('records')
                          .select(`
                            id,
                            style_id,
                            time,
                            video_url,
                            note,
                            is_relaying,
                            competition_id,
                            split_times (*)
                          `)
                          .eq('id', record.id)
                          .single()
                        
                        if (fullRecord) {
                          // 編集用のデータを構築
                          const editData = {
                            id: (fullRecord as any).id,
                            style_id: (fullRecord as any).style_id,
                            time: (fullRecord as any).time,
                            is_relaying: (fullRecord as any).is_relaying,
                            note: (fullRecord as any).note,
                            video_url: (fullRecord as any).video_url,
                            split_times: (fullRecord as any).split_times || [],
                            competition_id: (fullRecord as any).competition_id
                          }
                          onEditRecord?.(editData)
                        }
                        onClose?.()
                      }}
                      className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      title="記録を編集"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDeleteRecord?.(record.id)}
                      className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="記録を削除"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 記録内容 */}
                <div className="bg-white rounded-lg p-3 mb-3 border border-blue-200">
                  <div className="text-xs font-medium text-gray-500 mb-1">種目</div>
                  <div className="text-sm text-gray-800 mb-3">
                    <span className="text-base font-semibold text-blue-700">{record.metadata?.style?.name_jp || record.title}</span>
                    {(record.metadata?.is_relaying) && <span className="font-bold text-red-600 ml-2">R</span>}
                  </div>
                  
                  {(record.metadata?.time) && (
                    <>
                      <div className="text-xs font-medium text-gray-500 mb-1">タイム</div>
                      <div className="text-2xl font-bold text-blue-700 mb-3">
                        ⏱️ {formatTime(record.metadata.time)}
                      </div>
                    </>
                  )}

                  {(record.note) && (
                    <>
                      <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                      <div className="text-sm text-gray-700">
                        {record.note}
                      </div>
                    </>
                  )}
                </div>

                {/* スプリットタイム */}
                <RecordSplitTimes recordId={record.id} />
              </div>
            )
          })}

          {/* 「大会記録を追加」ボタン（Recordsがある場合でも表示） */}
          {records.length > 0 && (
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  onAddRecord?.(competitionId)
                  onClose?.()
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
              >
                <span className="mr-1">➕</span>
                大会記録を追加
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
