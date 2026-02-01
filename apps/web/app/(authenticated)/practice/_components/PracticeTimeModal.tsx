'use client'

import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts'
import { formatTime, formatTimeAverage } from '@/utils/formatters'
import type {
  Practice,
  PracticeLog,
  PracticeTime,
  PracticeTag
} from '@apps/shared/types'

// 種目の選択肢
const SWIM_STYLES = [
  { value: 'Fr', label: '自由形' },
  { value: 'Ba', label: '背泳ぎ' },
  { value: 'Br', label: '平泳ぎ' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' }
]

// コード値をラベルに変換する関数
const getStyleLabel = (styleValue: string): string => {
  const style = SWIM_STYLES.find(s => s.value === styleValue)
  if (style) return style.label
  if (SWIM_STYLES.some(s => s.label === styleValue)) return styleValue
  return styleValue
}

// 色の明度に基づいてテキスト色を決定する関数
const getTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#FFFFFF'
}

interface PracticeTimeModalProps {
  isOpen: boolean
  onClose: () => void
  practiceId: string
  place?: string
}

type PracticeLogTagRelation = {
  practice_tag_id: string
  practice_tags?: PracticeTag | null
}

type PracticeLogFromDB = PracticeLog & {
  practice_times?: PracticeTime[]
  practice_log_tags?: PracticeLogTagRelation[]
}

type PracticeFromDB = Practice & {
  practice_logs?: PracticeLogFromDB[]
}

// 型ガード関数
const isPracticeTag = (value: unknown): value is PracticeTag => {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    'id' in obj &&
    'name' in obj &&
    'color' in obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.color === 'string'
  )
}

const isPracticeTime = (value: unknown): value is PracticeTime => {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    'id' in obj &&
    'time' in obj &&
    'rep_number' in obj &&
    'set_number' in obj &&
    typeof obj.id === 'string' &&
    typeof obj.time === 'number' &&
    typeof obj.rep_number === 'number' &&
    typeof obj.set_number === 'number'
  )
}

const isPracticeLogTagRelation = (value: unknown): value is PracticeLogTagRelation => {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    'practice_tag_id' in obj &&
    typeof obj.practice_tag_id === 'string' &&
    (!('practice_tags' in obj) || obj.practice_tags === null || isPracticeTag(obj.practice_tags))
  )
}

const isPracticeLogFromDB = (value: unknown): value is PracticeLogFromDB => {
  if (!(typeof value === 'object' && value !== null)) return false
  
  const obj = value as Record<string, unknown>
  
  // 基本フィールドのチェック
  if (
    !('id' in obj) || typeof obj.id !== 'string' ||
    !('style' in obj) || typeof obj.style !== 'string' ||
    !('rep_count' in obj) || typeof obj.rep_count !== 'number' ||
    !('set_count' in obj) || typeof obj.set_count !== 'number' ||
    !('distance' in obj) || typeof obj.distance !== 'number'
  ) {
    return false
  }
  
  // practice_timesのチェック（存在する場合）
  if ('practice_times' in obj && obj.practice_times !== undefined) {
    if (!Array.isArray(obj.practice_times) || !obj.practice_times.every(isPracticeTime)) {
      return false
    }
  }
  
  // practice_log_tagsのチェック（存在する場合）
  if ('practice_log_tags' in obj && obj.practice_log_tags !== undefined) {
    if (!Array.isArray(obj.practice_log_tags) || !obj.practice_log_tags.every(isPracticeLogTagRelation)) {
      return false
    }
  }
  
  return true
}

const isPracticeFromDB = (value: unknown): value is PracticeFromDB => {
  if (!(typeof value === 'object' && value !== null)) return false
  
  const obj = value as Record<string, unknown>
  
  // 基本フィールドのチェック
  if (
    !('id' in obj) || typeof obj.id !== 'string' ||
    !('user_id' in obj) || typeof obj.user_id !== 'string' ||
    !('date' in obj) || typeof obj.date !== 'string'
  ) {
    return false
  }
  
  // practice_logsのチェック（存在する場合）
  if ('practice_logs' in obj && obj.practice_logs !== undefined) {
    if (!Array.isArray(obj.practice_logs) || !obj.practice_logs.every(isPracticeLogFromDB)) {
      return false
    }
  }
  
  return true
}

type FormattedPracticeTime = {
  id: string
  time: number
  repNumber: number
  setNumber: number
}

type FormattedPracticeLog = {
  id: string
  style: string
  swim_category?: 'Swim' | 'Pull' | 'Kick'
  repCount: number
  setCount: number
  distance: number
  circle: number | null
  note: string | null
  tags: PracticeTag[]
  times: FormattedPracticeTime[]
}

type FormattedPractice = {
  id: string
  date: string
  title: string | null
  place: string | null
  note: string | null
  practiceLogs: FormattedPracticeLog[]
}

export default function PracticeTimeModal({
  isOpen,
  onClose,
  practiceId,
  place
}: PracticeTimeModalProps) {
  const [practice, setPractice] = useState<FormattedPractice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { supabase } = useAuth()

  useEffect(() => {
    if (!isOpen) return

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
                practice_tag_id,
                practice_tags (
                  id,
                  name,
                  color
                )
              )
            )
          `)
          .eq('id', practiceId)
          .single()

        if (error) throw error
        if (!data) throw new Error('Practice data not found')
        
        // データ検証
        if (!isPracticeFromDB(data)) {
          throw new Error('Invalid practice data structure')
        }
        
        // データ整形
        const practiceData = data
        const formattedPractice: FormattedPractice = {
          id: practiceData.id,
          date: practiceData.date,
          title: practiceData.title,
          place: practiceData.place,
          note: practiceData.note,
          practiceLogs: (practiceData.practice_logs || []).map((log: PracticeLogFromDB): FormattedPracticeLog => ({
            id: log.id,
            style: log.style,
            swim_category: log.swim_category,
            repCount: log.rep_count,
            setCount: log.set_count,
            distance: log.distance,
            circle: log.circle,
            note: log.note,
            tags: (log.practice_log_tags || [])
              .map((tagRelation) => tagRelation.practice_tags)
              .filter((tag): tag is PracticeTag => tag !== null && tag !== undefined),
            times: (log.practice_times || []).map((time: PracticeTime): FormattedPracticeTime => ({
              id: time.id,
              time: time.time,
              repNumber: time.rep_number,
              setNumber: time.set_number
            }))
          }))
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
  }, [isOpen, practiceId, supabase])

  if (!isOpen) return null

  if (loading) {
    return (
      <div className="fixed inset-0 z-70 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          {/* オーバーレイ */}
          <div className="fixed inset-0 bg-black/40 transition-opacity" />
          
          {/* モーダルコンテンツ */}
          <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="text-center">
                <div className="text-sm text-gray-500">練習詳細を読み込み中...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-70 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          {/* オーバーレイ */}
          <div className="fixed inset-0 bg-black/40 transition-opacity" />
          
          {/* モーダルコンテンツ */}
          <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="text-center">
                <div className="text-sm text-red-600">練習詳細の取得に失敗しました</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!practice) {
    return null
  }

  const practiceLogs = practice.practiceLogs || []

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={onClose}
        />
        
        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                練習記録
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* タイトル・場所・メモ */}
            {(practice.title || place || practice.note) && (
              <div className="flex items-center gap-4 mb-2 flex-wrap">
                {practice.title && (
                  <p className="text-sm text-gray-700 flex items-center gap-1">
                    <span className="text-gray-500">🏷️</span>
                    {practice.title}
                  </p>
                )}
                {place && (
                  <p className="text-sm text-gray-700 flex items-center gap-1">
                    <span className="text-gray-500">📍</span>
                    {place}
                  </p>
                )}
                {practice.note && (
                  <p className="text-sm text-gray-700 flex items-center gap-1">
                    <span>📝</span>
                    {practice.note}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 space-y-4">
              {practiceLogs.map((log: FormattedPracticeLog, _index: number) => {
                const allTimes = log.times || []

                return (
                  <div key={log.id} className="bg-emerald-50 border-0 rounded-lg p-4">
                    {/* ヘッダー: 場所、タグ */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        {place && (
                          <p className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                            <span className="text-gray-400">📍</span>
                            {place}
                          </p>
                        )}
                        {log.tags && Array.isArray(log.tags) && log.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {log.tags.map((tag: PracticeTag) => (
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
                    </div>

                    {/* 練習内容: 距離 × 本数 × セット数 サークル 泳法 */}
                    <div className="bg-white rounded-lg p-3 mb-3 border border-green-300">
                      <div className="text-xs font-medium text-gray-500 mb-1">練習内容</div>
                        <div className="text-sm text-gray-800">
                          <span className="text-lg font-semibold text-green-700">{log.distance}</span>m ×{' '}
                          <span className="text-lg font-semibold text-green-700">{log.repCount}</span>
                          {log.setCount > 1 && (
                            <>
                              {' × '}
                              <span className="text-lg font-semibold text-green-700">{log.setCount}</span>
                            </>
                          )}
                          {'　　'}
                          <span className="text-lg font-semibold text-green-700">
                            {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'}
                          </span>
                          {'　'}
                          <span className="text-lg font-semibold text-green-700">{getStyleLabel(log.style)}</span>
                          {log.swim_category && log.swim_category !== 'Swim' && (
                            <>
                              {'　'}
                              <span className="text-lg font-semibold text-green-700">
                                {log.swim_category}
                              </span>
                            </>
                          )}
                        </div>
                    </div>

                    {/* メモ */}
                    {log.note && (
                      <div className="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-200">
                        <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                        <div className="text-sm text-slate-700">
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
                        <div className="bg-white rounded-lg p-3 border border-green-300 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-green-300">
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
                                      const time = allTimes.find((t: FormattedPracticeTime) => t.setNumber === setNumber && t.repNumber === repNumber)
                                      const setTimes = allTimes.filter((t: FormattedPracticeTime) => t.setNumber === setNumber && t.time > 0)
                                      const setFastest = setTimes.length > 0 ? Math.min(...setTimes.map((t: FormattedPracticeTime) => t.time)) : 0
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
                              {/* セット平均行 */}
                              <tr className="border-b border-green-100 bg-green-50">
                                <td className="py-2 px-2 font-medium text-green-800">セット平均</td>
                                {Array.from({ length: log.setCount }, (_, setIndex) => {
                                  const setNumber = setIndex + 1
                                  const setTimes = allTimes.filter((t: FormattedPracticeTime) => t.setNumber === setNumber && t.time > 0)
                                  const average = setTimes.length > 0
                                    ? setTimes.reduce((sum: number, t: FormattedPracticeTime) => sum + t.time, 0) / setTimes.length
                                    : 0
                                  return (
                                    <td key={setNumber} className="py-2 px-2 text-center">
                                      <span className="text-green-800 font-medium">
                                        {average > 0 ? formatTimeAverage(average) : '-'}
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
                                      const allValidTimes = allTimes.filter((t: FormattedPracticeTime) => t.time > 0)
                                      const overallAverage = allValidTimes.length > 0
                                        ? allValidTimes.reduce((sum: number, t: FormattedPracticeTime) => sum + t.time, 0) / allValidTimes.length
                                        : 0
                                      return overallAverage > 0 ? formatTimeAverage(overallAverage) : '-'
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
                                      const allValidTimes = allTimes.filter((t: FormattedPracticeTime) => t.time > 0)
                                      const overallFastest = allValidTimes.length > 0
                                        ? Math.min(...allValidTimes.map((t: FormattedPracticeTime) => t.time))
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
      </div>
    </div>
  )
}
