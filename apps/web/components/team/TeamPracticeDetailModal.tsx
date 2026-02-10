'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthProvider'
import { formatTime, formatTimeAverage } from '@/utils/formatters'
import type { PracticeTag } from '@apps/shared/types'

const SWIM_STYLES: Record<string, string> = {
  Fr: '自由形',
  Ba: '背泳ぎ',
  Br: '平泳ぎ',
  Fly: 'バタフライ',
  IM: '個人メドレー',
}

const getStyleLabel = (styleValue: string): string => {
  return SWIM_STYLES[styleValue] || styleValue
}

const getTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#FFFFFF'
}

interface PracticeTimeEntry {
  id: string
  time: number
  rep_number: number
  set_number: number
  user_id: string
}

interface PracticeLogEntry {
  id: string
  user_id: string
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
  rep_count: number
  set_count: number
  distance: number
  circle: number | null
  note: string | null
  practice_times: PracticeTimeEntry[]
  practice_log_tags: Array<{
    practice_tag_id: string
    practice_tags: PracticeTag | null
  }>
  users: { name: string } | { name: string }[] | null
}

interface PracticeDetail {
  id: string
  date: string
  title: string | null
  place: string | null
  note: string | null
  practice_logs: PracticeLogEntry[]
}

interface TeamPracticeDetailModalProps {
  isOpen: boolean
  onClose: () => void
  practiceId: string
}

// メンバー名を安全に取得
function getUserName(users: { name: string } | { name: string }[] | null | undefined): string {
  if (!users) return '不明'
  if (Array.isArray(users)) return users[0]?.name || '不明'
  return users.name || '不明'
}

// ログをメニュー（style+distance+circle等）でグルーピングするキー
function getMenuKey(log: PracticeLogEntry): string {
  return `${log.style}_${log.distance}_${log.rep_count}_${log.set_count}_${log.circle}_${log.swim_category}`
}

interface MemberInfo {
  userId: string
  name: string
  times: PracticeTimeEntry[]
}

function MemberTimeTable({ logs }: { logs: PracticeLogEntry[] }) {
  const { repCount, setCount, members } = useMemo(() => {
    const rep = logs[0].rep_count
    const set = logs[0].set_count
    const m: MemberInfo[] = logs.map((log) => ({
      userId: log.user_id,
      name: getUserName(log.users),
      times: log.practice_times || [],
    }))
    return { repCount: rep, setCount: set, members: m }
  }, [logs])

  const hasTimes = members.some((m) => m.times.some((t) => t.time > 0))
  if (!hasTimes) {
    return (
      <div className="bg-white rounded-lg p-3 border border-green-200 text-sm text-gray-500">
        タイム記録なし
      </div>
    )
  }

  // ヘルパー: メンバーの特定set+repのタイムを取得
  const getTime = (member: MemberInfo, setNum: number, repNum: number): number => {
    const t = member.times.find(
      (t) => t.set_number === setNum && t.rep_number === repNum
    )
    return t && t.time > 0 ? t.time : 0
  }

  // ヘルパー: メンバーのセット平均
  const getSetAverage = (member: MemberInfo, setNum: number): number => {
    const setTimes = member.times.filter(
      (t) => t.set_number === setNum && t.time > 0
    )
    if (setTimes.length === 0) return 0
    return setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
  }

  // ヘルパー: メンバーの全体平均
  const getOverallAverage = (member: MemberInfo): number => {
    const valid = member.times.filter((t) => t.time > 0)
    if (valid.length === 0) return 0
    return valid.reduce((sum, t) => sum + t.time, 0) / valid.length
  }

  // ヘルパー: メンバーの全体最速
  const getOverallFastest = (member: MemberInfo): number => {
    const valid = member.times.filter((t) => t.time > 0)
    if (valid.length === 0) return 0
    return Math.min(...valid.map((t) => t.time))
  }

  // 行内で最速のタイムを特定（0以外で最小値）
  const getRowFastest = (times: number[]): number => {
    const valid = times.filter((t) => t > 0)
    if (valid.length <= 1) return 0 // 1人以下なら比較不要
    return Math.min(...valid)
  }

  return (
    <div className="bg-white rounded-lg border border-green-300 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-green-300 bg-green-50/50">
            <th className="text-left py-2 px-2 font-medium text-green-800 sticky left-0 bg-green-50/50 min-w-[60px]" />
            {members.map((member) => (
              <th
                key={member.userId}
                className="text-center py-2 px-2 font-medium text-green-800 min-w-[90px]"
              >
                {member.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: setCount }, (_, si) => {
            const setNumber = si + 1
            return (
              <React.Fragment key={`set-${setNumber}`}>
                {/* セット区切りヘッダー（2セット目以降） */}
                {setCount > 1 && (
                  <tr className="bg-emerald-100/60">
                    <td
                      colSpan={members.length + 1}
                      className="py-1.5 px-2 text-xs font-semibold text-emerald-700"
                    >
                      {setNumber}セット目
                    </td>
                  </tr>
                )}

                {/* 各本のタイム行 */}
                {Array.from({ length: repCount }, (_, ri) => {
                  const repNumber = ri + 1
                  const rowTimes = members.map((m) => getTime(m, setNumber, repNumber))
                  const rowFastest = getRowFastest(rowTimes)

                  return (
                    <tr
                      key={`${setNumber}-${repNumber}`}
                      className="border-b border-green-100"
                    >
                      <td className="py-2 px-2 font-medium text-gray-700 sticky left-0 bg-white">
                        {repNumber}本目
                      </td>
                      {members.map((member, mi) => {
                        const time = rowTimes[mi]
                        const isFastest = time > 0 && time === rowFastest
                        return (
                          <td
                            key={member.userId}
                            className="py-2 px-2 text-center"
                          >
                            <span
                              className={
                                isFastest
                                  ? 'text-blue-600 font-bold'
                                  : 'text-gray-800'
                              }
                            >
                              {time > 0 ? formatTime(time) : '-'}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}

                {/* セット平均行 */}
                <tr className="border-b border-green-200 bg-green-50">
                  <td className="py-2 px-2 font-medium text-green-800 sticky left-0 bg-green-50">
                    {setCount > 1 ? `${setNumber}set平均` : 'セット平均'}
                  </td>
                  {(() => {
                    const avgs = members.map((m) => getSetAverage(m, setNumber))
                    const fastest = getRowFastest(avgs)
                    return members.map((member, mi) => {
                      const avg = avgs[mi]
                      const isFastest = avg > 0 && avg === fastest
                      return (
                        <td
                          key={member.userId}
                          className="py-2 px-2 text-center"
                        >
                          <span
                            className={
                              isFastest
                                ? 'text-blue-600 font-bold'
                                : 'text-green-800 font-medium'
                            }
                          >
                            {avg > 0 ? formatTimeAverage(avg) : '-'}
                          </span>
                        </td>
                      )
                    })
                  })()}
                </tr>
              </React.Fragment>
            )
          })}

          {/* 全体最速行 */}
          <tr className="border-t-2 border-green-300 bg-blue-50">
            <td className="py-2 px-2 font-medium text-blue-800 sticky left-0 bg-blue-50">
              全体最速
            </td>
            {(() => {
              const fastests = members.map((m) => getOverallFastest(m))
              const rowFastest = getRowFastest(fastests)
              return members.map((member, mi) => {
                const fastest = fastests[mi]
                const isBest = fastest > 0 && fastest === rowFastest
                return (
                  <td
                    key={member.userId}
                    className="py-2 px-2 text-center"
                  >
                    <span
                      className={
                        isBest
                          ? 'text-blue-600 font-bold'
                          : 'text-blue-800 font-bold'
                      }
                    >
                      {fastest > 0 ? formatTime(fastest) : '-'}
                    </span>
                  </td>
                )
              })
            })()}
          </tr>

          {/* 全体平均行 */}
          <tr className="bg-blue-50">
            <td className="py-2 px-2 font-medium text-blue-800 sticky left-0 bg-blue-50">
              全体平均
            </td>
            {(() => {
              const avgs = members.map((m) => getOverallAverage(m))
              const rowFastest = getRowFastest(avgs)
              return members.map((member, mi) => {
                const avg = avgs[mi]
                const isBest = avg > 0 && avg === rowFastest
                return (
                  <td
                    key={member.userId}
                    className="py-2 px-2 text-center"
                  >
                    <span
                      className={
                        isBest
                          ? 'text-blue-600 font-bold'
                          : 'text-blue-800 font-bold'
                      }
                    >
                      {avg > 0 ? formatTimeAverage(avg) : '-'}
                    </span>
                  </td>
                )
              })
            })()}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function TeamPracticeDetailModal({
  isOpen,
  onClose,
  practiceId,
}: TeamPracticeDetailModalProps) {
  const { supabase } = useAuth()
  const [practice, setPractice] = useState<PracticeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const loadPractice = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from('practices')
          .select(`
            id,
            date,
            title,
            place,
            note,
            practice_logs (
              id,
              user_id,
              style,
              swim_category,
              rep_count,
              set_count,
              distance,
              circle,
              note,
              practice_times (
                id,
                time,
                rep_number,
                set_number,
                user_id
              ),
              practice_log_tags (
                practice_tag_id,
                practice_tags (
                  id,
                  name,
                  color
                )
              ),
              users!practice_logs_user_id_fkey (
                name
              )
            )
          `)
          .eq('id', practiceId)
          .single()

        if (fetchError) throw fetchError
        if (!data) throw new Error('練習データが見つかりません')

        setPractice(data as unknown as PracticeDetail)
      } catch (err) {
        console.error('チーム練習詳細の取得エラー:', err)
        setError('練習詳細の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    loadPractice()
  }, [isOpen, practiceId, supabase])

  // 同じメニューのログをグルーピング
  const groupedLogs = useMemo(() => {
    if (!practice) return {}
    return practice.practice_logs.reduce<Record<string, PracticeLogEntry[]>>((acc, log) => {
      const key = getMenuKey(log)
      if (!acc[key]) acc[key] = []
      acc[key].push(log)
      return acc
    }, {})
  }, [practice])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
        />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                チーム練習記録
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {loading && (
              <div className="text-center py-8">
                <div className="text-sm text-gray-500">読み込み中...</div>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <div className="text-sm text-red-600">{error}</div>
              </div>
            )}

            {practice && !loading && !error && (
              <>
                {/* 練習基本情報 */}
                {(practice.title || practice.place || practice.note) && (
                  <div className="flex items-center gap-4 mb-4 flex-wrap">
                    {practice.title && (
                      <p className="text-sm text-gray-700 flex items-center gap-1">
                        <span className="text-gray-500">🏷️</span>
                        {practice.title}
                      </p>
                    )}
                    {practice.place && (
                      <p className="text-sm text-gray-700 flex items-center gap-1">
                        <span className="text-gray-500">📍</span>
                        {practice.place}
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

                {/* ログなし */}
                {practice.practice_logs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    練習ログがまだ登録されていません
                  </div>
                )}

                {/* メニューごとのセクション */}
                <div className="space-y-6">
                  {Object.entries(groupedLogs).map(([key, logs]) => {
                    const representativeLog = logs[0]
                    const tags = representativeLog.practice_log_tags
                      ?.map((t) => t.practice_tags)
                      .filter((t): t is PracticeTag => t !== null) || []

                    return (
                      <div key={key} className="bg-emerald-50 border-0 rounded-lg p-4">
                        {/* タグ */}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {tags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                                style={{
                                  backgroundColor: tag.color,
                                  color: getTextColor(tag.color),
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* メニュー情報 */}
                        <div className="bg-white rounded-lg p-3 mb-3 border border-green-300">
                          <div className="text-xs font-medium text-gray-500 mb-1">練習内容</div>
                          <div className="text-sm text-gray-800">
                            <span className="text-lg font-semibold text-green-700">
                              {representativeLog.distance}
                            </span>
                            m ×{' '}
                            <span className="text-lg font-semibold text-green-700">
                              {representativeLog.rep_count}
                            </span>
                            {representativeLog.set_count > 1 && (
                              <>
                                {' × '}
                                <span className="text-lg font-semibold text-green-700">
                                  {representativeLog.set_count}
                                </span>
                              </>
                            )}
                            {'　　'}
                            <span className="text-lg font-semibold text-green-700">
                              {representativeLog.circle
                                ? `${Math.floor(representativeLog.circle / 60)}'${Math.floor(representativeLog.circle % 60).toString().padStart(2, '0')}"`
                                : '-'}
                            </span>
                            {'　'}
                            <span className="text-lg font-semibold text-green-700">
                              {getStyleLabel(representativeLog.style)}
                            </span>
                            {representativeLog.swim_category && representativeLog.swim_category !== 'Swim' && (
                              <>
                                {'　'}
                                <span className="text-lg font-semibold text-green-700">
                                  {representativeLog.swim_category}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* メモ */}
                        {representativeLog.note && (
                          <div className="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-200">
                            <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                            <div className="text-sm text-slate-700">
                              {representativeLog.note}
                            </div>
                          </div>
                        )}

                        {/* メンバー横並びタイムテーブル */}
                        <MemberTimeTable logs={logs} />
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
