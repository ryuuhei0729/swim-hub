'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthProvider'
import { formatTimeBest } from '@/utils/formatters'
import { LapTimeDisplay } from '@/components/forms/LapTimeDisplay'

interface RecordUser {
  name: string
}

interface SplitTimeEntry {
  id: string
  distance: number
  split_time: number
}

interface StyleInfo {
  id: number
  name_jp: string
  name: string
  style: string
  distance: number
}

interface RecordEntry {
  id: string
  user_id: string
  style_id: number
  time: number
  reaction_time: number | null
  is_relaying: boolean
  note: string | null
  pool_type: number
  users: RecordUser | RecordUser[] | null
  styles: StyleInfo | StyleInfo[] | null
  split_times: SplitTimeEntry[]
}

interface CompetitionDetail {
  id: string
  title: string | null
  date: string
  place: string | null
  pool_type: number
  note: string | null
}

interface TeamCompetitionRecordsModalProps {
  isOpen: boolean
  onClose: () => void
  competitionId: string
  competitionTitle: string
}

function getUserName(users: RecordUser | RecordUser[] | null | undefined): string {
  if (!users) return '不明'
  if (Array.isArray(users)) return users[0]?.name || '不明'
  return users.name || '不明'
}

function getStyle(styles: StyleInfo | StyleInfo[] | null | undefined): StyleInfo | null {
  if (!styles) return null
  if (Array.isArray(styles)) return styles[0] || null
  return styles
}

function ExpandableSplitTimes({
  splitTimes,
  raceDistance,
}: {
  splitTimes: SplitTimeEntry[]
  raceDistance: number
}) {
  const [isOpen, setIsOpen] = useState(false)

  const formattedSplits = useMemo(
    () =>
      splitTimes
        .filter((st) => st.distance > 0 && st.split_time > 0)
        .sort((a, b) => a.distance - b.distance)
        .map((st) => ({ distance: st.distance, splitTime: st.split_time })),
    [splitTimes]
  )

  if (formattedSplits.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
      >
        {isOpen ? (
          <ChevronUpIcon className="h-3 w-3" />
        ) : (
          <ChevronDownIcon className="h-3 w-3" />
        )}
        スプリットタイム ({formattedSplits.length})
      </button>
      {isOpen && (
        <LapTimeDisplay splitTimes={formattedSplits} raceDistance={raceDistance} />
      )}
    </div>
  )
}

export default function TeamCompetitionRecordsModal({
  isOpen,
  onClose,
  competitionId,
  competitionTitle,
}: TeamCompetitionRecordsModalProps) {
  const { supabase } = useAuth()
  const [competition, setCompetition] = useState<CompetitionDetail | null>(null)
  const [records, setRecords] = useState<RecordEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        const [compResult, recordsResult] = await Promise.all([
          supabase
            .from('competitions')
            .select('id, title, date, place, pool_type, note')
            .eq('id', competitionId)
            .single(),
          supabase
            .from('records')
            .select(`
              id,
              user_id,
              style_id,
              time,
              reaction_time,
              is_relaying,
              note,
              pool_type,
              users!records_user_id_fkey (
                name
              ),
              styles (
                id,
                name_jp,
                name,
                style,
                distance
              ),
              split_times (
                id,
                distance,
                split_time
              )
            `)
            .eq('competition_id', competitionId)
            .order('time', { ascending: true }),
        ])

        if (compResult.error) throw compResult.error
        if (recordsResult.error) throw recordsResult.error

        setCompetition(compResult.data as CompetitionDetail)
        setRecords((recordsResult.data || []) as unknown as RecordEntry[])
      } catch (err) {
        console.error('大会記録の取得エラー:', err)
        setError('大会記録の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isOpen, competitionId, supabase])

  // 種目ごとにグルーピング
  const recordsByStyle = useMemo(() => {
    const grouped: Record<
      number,
      { style: StyleInfo; records: RecordEntry[] }
    > = {}

    for (const record of records) {
      const styleInfo = getStyle(record.styles)
      if (!styleInfo) continue

      if (!grouped[record.style_id]) {
        grouped[record.style_id] = { style: styleInfo, records: [] }
      }
      grouped[record.style_id].records.push(record)
    }

    // 種目名でソート
    return Object.values(grouped).sort((a, b) =>
      a.style.name_jp.localeCompare(b.style.name_jp)
    )
  }, [records])

  if (!isOpen) return null

  const poolTypeLabel = competition?.pool_type === 1 ? '長水路' : '短水路'

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
                {competitionTitle} - 記録一覧
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

            {!loading && !error && (
              <>
                {/* 大会基本情報 */}
                {competition && (
                  <div className="flex items-center gap-4 mb-4 flex-wrap text-sm text-gray-600">
                    {competition.place && (
                      <span className="flex items-center gap-1">
                        📍 {competition.place}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      🏊 {poolTypeLabel}
                    </span>
                    {competition.note && (
                      <span className="flex items-center gap-1">
                        📝 {competition.note}
                      </span>
                    )}
                  </div>
                )}

                {/* 記録なし */}
                {records.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    記録がまだ登録されていません
                  </div>
                )}

                {/* 種目ごとの記録 */}
                <div className="space-y-6">
                  {recordsByStyle.map(({ style, records: styleRecords }) => (
                    <div
                      key={style.id}
                      className="bg-blue-50 rounded-lg p-4"
                    >
                      {/* 種目ヘッダー */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 bg-blue-500 rounded-full" />
                        <h4 className="text-base font-semibold text-blue-800">
                          {style.name_jp}
                        </h4>
                        <span className="text-sm text-blue-600">
                          ({styleRecords.length}件)
                        </span>
                      </div>

                      {/* 記録テーブル */}
                      <div className="bg-white rounded-lg border border-blue-200 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-blue-200 bg-blue-50/50">
                              <th className="text-left py-2 px-3 font-medium text-blue-800">
                                順位
                              </th>
                              <th className="text-left py-2 px-3 font-medium text-blue-800">
                                名前
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-blue-800">
                                タイム
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-blue-800 hidden sm:table-cell">
                                RT
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-blue-800 hidden sm:table-cell">
                                備考
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {styleRecords
                              .filter((r) => !r.is_relaying)
                              .sort((a, b) => a.time - b.time)
                              .map((record, index) => {
                                const styleInfo = getStyle(record.styles)
                                return (
                                  <tr
                                    key={record.id}
                                    className="border-b border-blue-100 last:border-b-0"
                                  >
                                    <td className="py-2 px-3 text-gray-700 font-medium">
                                      {index + 1}
                                    </td>
                                    <td className="py-2 px-3 text-gray-900">
                                      {getUserName(record.users)}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <span
                                        className={
                                          index === 0
                                            ? 'text-blue-600 font-bold'
                                            : 'text-gray-900'
                                        }
                                      >
                                        {formatTimeBest(record.time)}
                                      </span>
                                      {record.split_times &&
                                        record.split_times.length > 0 &&
                                        styleInfo && (
                                          <ExpandableSplitTimes
                                            splitTimes={record.split_times}
                                            raceDistance={styleInfo.distance}
                                          />
                                        )}
                                    </td>
                                    <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                      {record.reaction_time
                                        ? record.reaction_time.toFixed(2)
                                        : '-'}
                                    </td>
                                    <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                      {record.note || '-'}
                                    </td>
                                  </tr>
                                )
                              })}

                            {/* リレー記録 */}
                            {styleRecords.filter((r) => r.is_relaying).length > 0 && (
                              <>
                                <tr className="bg-gray-50">
                                  <td
                                    colSpan={5}
                                    className="py-2 px-3 text-xs font-medium text-gray-500"
                                  >
                                    リレー
                                  </td>
                                </tr>
                                {styleRecords
                                  .filter((r) => r.is_relaying)
                                  .sort((a, b) => a.time - b.time)
                                  .map((record, index) => {
                                    const styleInfo = getStyle(record.styles)
                                    return (
                                      <tr
                                        key={record.id}
                                        className="border-b border-blue-100 last:border-b-0"
                                      >
                                        <td className="py-2 px-3 text-gray-700 font-medium">
                                          {index + 1}
                                        </td>
                                        <td className="py-2 px-3 text-gray-900">
                                          {getUserName(record.users)}
                                        </td>
                                        <td className="py-2 px-3 text-center text-gray-900">
                                          {formatTimeBest(record.time)}
                                          {record.split_times &&
                                            record.split_times.length > 0 &&
                                            styleInfo && (
                                              <ExpandableSplitTimes
                                                splitTimes={record.split_times}
                                                raceDistance={styleInfo.distance}
                                              />
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                          {record.reaction_time
                                            ? record.reaction_time.toFixed(2)
                                            : '-'}
                                        </td>
                                        <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                          {record.note || '-'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
