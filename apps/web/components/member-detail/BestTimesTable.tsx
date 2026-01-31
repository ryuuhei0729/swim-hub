import React, { useState, useMemo } from 'react'
import { Tabs } from '@/components/ui'
import { TrophyIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { differenceInDays, parseISO } from 'date-fns'
import { formatTimeBest, formatDate } from '@/utils/formatters'
import type { BestTime, TabType } from '@/types/member-detail'

const DISTANCES = [50, 100, 200, 400, 800]
const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

const styleHeaderBgClass: Record<string, string> = {
  '自由形': 'bg-yellow-100',
  '平泳ぎ': 'bg-green-100',
  '背泳ぎ': 'bg-red-100',
  'バタフライ': 'bg-blue-100',
  '個人メドレー': 'bg-pink-100'
}

const styleCellBgClass: Record<string, string> = {
  '自由形': 'bg-yellow-50',
  '平泳ぎ': 'bg-green-50',
  '背泳ぎ': 'bg-red-50',
  'バタフライ': 'bg-blue-50',
  '個人メドレー': 'bg-pink-50'
}

function isInvalidCombination(style: string, distance: number): boolean {
  if (style === '個人メドレー' && (distance === 50 || distance === 800)) return true
  if ((style === '平泳ぎ' || style === '背泳ぎ' || style === 'バタフライ') && (distance === 400 || distance === 800)) return true
  return false
}

interface BestTimesTableProps {
  bestTimes: BestTime[]
}

export function BestTimesTable({ bestTimes }: BestTimesTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false)

  const filteredBestTimes = useMemo(() => {
    if (activeTab === 'short') {
      return bestTimes.filter(bt => bt.pool_type === 0)
    } else if (activeTab === 'long') {
      return bestTimes.filter(bt => bt.pool_type === 1)
    } else {
      return bestTimes
    }
  }, [bestTimes, activeTab])

  const getBestTime = (style: string, distance: number): BestTime | null => {
    const dbStyleName = `${distance}m${style}`

    if (activeTab === 'all') {
      const candidates: BestTime[] = []

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(bt =>
        bt.style.name_jp === dbStyleName &&
        bt.pool_type === 0
      )

      shortCourseTimes.forEach(bt => {
        if (!bt.is_relaying) {
          candidates.push(bt)
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition
            })
          }
        } else {
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })

      // 長水路のタイムを取得
      const longCourseTimes = bestTimes.filter(bt =>
        bt.style.name_jp === dbStyleName &&
        bt.pool_type === 1
      )

      longCourseTimes.forEach(bt => {
        if (!bt.is_relaying) {
          candidates.push(bt)
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition
            })
          }
        } else {
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })

      if (candidates.length === 0) return null
      return candidates.reduce((best, current) =>
        current.time < best.time ? current : best
      )
    } else {
      const candidates: BestTime[] = []
      const matchingTimes = filteredBestTimes.filter(bt => bt.style.name_jp === dbStyleName)

      matchingTimes.forEach(bt => {
        if (!bt.is_relaying) {
          candidates.push(bt)
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition
            })
          }
        } else {
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })

      if (candidates.length === 0) return null
      return candidates.reduce((best, current) =>
        current.time < best.time ? current : best
      )
    }
  }

  const getTimeDisplay = (bestTime: BestTime) => {
    const timeStr = formatTimeBest(bestTime.time)
    const suffixes: string[] = []

    if (activeTab === 'all' && bestTime.pool_type === 1) {
      suffixes.push('L')
    }

    if (bestTime.is_relaying) {
      suffixes.push('R')
    }

    return {
      main: timeStr,
      suffix: suffixes.join('')
    }
  }

  const tabs = [
    { id: 'all', label: 'ALL' },
    { id: 'short', label: '短水路' },
    { id: 'long', label: '長水路' }
  ]

  if (bestTimes.length === 0) {
    return (
      <div className="text-center py-6">
        <TrophyIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600">記録がありません</p>
        <p className="text-xs text-gray-500 mt-1">
          このメンバーはまだ記録を登録していません
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* タブとチェックボックス */}
      <div className="mb-3 flex items-center justify-between">
        <Tabs
          tabs={tabs}
          activeTabId={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as TabType)}
        />
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeRelaying}
            onChange={(e) => setIncludeRelaying(e.target.checked)}
            className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-xs text-gray-700">引き継ぎタイムも含めて表示</span>
        </label>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-300">
        <table className="min-w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[48px] w-[56px] h-[36px] tracking-wide">
                距離
              </th>
              {STYLES.map((style) => (
                <th
                  key={style}
                  className={`px-2 py-1.5 text-center text-xs font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 min-w-[90px] h-[36px] ${styleHeaderBgClass[style]}`}
                >
                  {style}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {DISTANCES.map((distance, rowIdx) => (
              <tr key={distance}>
                <td className={`px-2 py-2 text-xs font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 min-w-[48px] w-[56px] h-[48px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''}`}>
                  {distance}m
                </td>
                {STYLES.map((style) => {
                  const bestTime = getBestTime(style, distance)
                  const createdAt = bestTime ? parseISO(bestTime.created_at) : null
                  // 一括登録（competition なし）は New 表示対象外
                  const isNew = bestTime?.competition && createdAt ? differenceInDays(new Date(), createdAt) <= 30 : false
                  return (
                    <td
                      key={style}
                      className={`px-2 py-2 text-center text-xs text-gray-900 border-r border-gray-300 last:border-r-0 min-w-[90px] h-[48px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''} ${isInvalidCombination(style, distance) ? 'bg-gray-200' : styleCellBgClass[style]}`}
                    >
                      {bestTime ? (
                        <div className={`group relative inline-block pt-1 ${isNew ? 'pr-5' : ''}`}>
                          {isNew && (
                            <span className="absolute -top-0.5 -right-2.5 text-[9px] bg-red-500 text-white px-1 py-0.5 rounded-full shadow">New</span>
                          )}
                          <span className={`font-semibold text-sm ${isNew ? 'text-red-600' : 'text-gray-900'}`}>
                            {(() => {
                              const display = getTimeDisplay(bestTime)
                              return (
                                <>
                                  {display.main}
                                  {display.suffix && (
                                    <span className="text-[10px] ml-0.5">{display.suffix}</span>
                                  )}
                                </>
                              )
                            })()}
                          </span>

                          {/* ホバー時の詳細情報 */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-gray-900 text-white text-[10px] rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                            <div className="flex items-center space-x-1 mb-1">
                              <CalendarIcon className="h-2.5 w-2.5" />
                              <span>{formatDate(bestTime.created_at)}</span>
                            </div>
                            {bestTime.competition ? (
                              <div className="text-blue-300">
                                {bestTime.competition.title}
                              </div>
                            ) : (
                              <div className="text-gray-400">
                                {bestTime.note || '一括登録'}
                              </div>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-block text-gray-300">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 注釈 */}
      <div className="mt-2 text-xs text-gray-400 flex items-center justify-end space-x-3">
        <span>※ L: 長水路</span>
        <span>R: 引き継ぎあり</span>
      </div>
    </div>
  )
}
