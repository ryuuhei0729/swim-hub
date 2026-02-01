'use client'

import React, { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { CalendarIcon } from '@heroicons/react/24/outline'
import { formatTimeBest, formatDate } from '../../utils/formatters'
import { Tabs } from '../ui/Tabs'

export interface BestTime {
  id: string
  time: number
  created_at: string
  pool_type: number // 0: 短水路, 1: 長水路
  is_relaying: boolean
  note?: string // 備考（一括登録時に使用）
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string
    time: number
    created_at: string
    note?: string
    competition?: {
      title: string
      date: string
    }
  }
}

type TabType = 'all' | 'short' | 'long'

interface BestTimesTableProps {
  bestTimes: BestTime[]
}

// 静的距離リスト（50m, 100m, 200m, 400m, 800m）
const DISTANCES = [50, 100, 200, 400, 800]

// 静的種目リスト
const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

export default function BestTimesTable({ bestTimes }: BestTimesTableProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false)

  const styleHeaderBgClass: Record<string, string> = {
    '自由形': 'bg-yellow-100',
    '平泳ぎ': 'bg-green-100',
    '背泳ぎ': 'bg-red-100',
    'バタフライ': 'bg-blue-100', // 紺色系はTailwindではblue系で代替
    '個人メドレー': 'bg-pink-100'
  }

  const styleCellBgClass: Record<string, string> = {
    '自由形': 'bg-yellow-50',
    '平泳ぎ': 'bg-green-50',
    '背泳ぎ': 'bg-red-50',
    'バタフライ': 'bg-blue-50',
    '個人メドレー': 'bg-pink-50'
  }

  const isInvalidCombination = (style: string, distance: number): boolean => {
    // ありえない種目/距離の組み合わせ
    if (style === '個人メドレー' && (distance === 50 || distance === 800)) return true
    if ((style === '平泳ぎ' || style === '背泳ぎ' || style === 'バタフライ') && (distance === 400 || distance === 800)) return true
    return false
  }

  // タブごとにフィルタリングされたベストタイムを取得
  const filteredBestTimes = useMemo(() => {
    if (activeTab === 'short') {
      // 短水路タブ: pool_type === 0 のみ
      return bestTimes.filter(bt => bt.pool_type === 0)
    } else if (activeTab === 'long') {
      // 長水路タブ: pool_type === 1 のみ
      return bestTimes.filter(bt => bt.pool_type === 1)
    } else {
      // ALLタブ: そのまま返す（getBestTimeで比較処理）
      return bestTimes
    }
  }, [bestTimes, activeTab])

  const getBestTime = (style: string, distance: number): BestTime | null => {
    // データベースの種目名形式（例：50m自由形）で検索
    const dbStyleName = `${distance}m${style}`
    
    if (activeTab === 'all') {
      // ALLタブ: 短水路と長水路の速い方を選択
      const candidates: BestTime[] = []
      
      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(bt => 
        bt.style.name_jp === dbStyleName && 
        bt.pool_type === 0
      )
      
      shortCourseTimes.forEach(bt => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt)
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
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
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
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
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt)
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
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
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })
      
      if (candidates.length === 0) return null
      
      // 最速のタイムを選択
      return candidates.reduce((best, current) => 
        current.time < best.time ? current : best
      )
    } else {
      // 短水路/長水路タブ: フィルタリング済みのデータから取得
      const candidates: BestTime[] = []
      
      const matchingTimes = filteredBestTimes.filter(bt => bt.style.name_jp === dbStyleName)
      
      matchingTimes.forEach(bt => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt)
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
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
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })
      
      if (candidates.length === 0) return null
      
      // 最速のタイムを選択
      return candidates.reduce((best, current) => 
        current.time < best.time ? current : best
      )
    }
  }

  // タイム表示用のヘルパー関数
  const getTimeDisplay = (bestTime: BestTime) => {
    const timeStr = formatTimeBest(bestTime.time)
    const suffixes: string[] = []
    
    // ALLタブの場合、長水路ならLを追加
    if (activeTab === 'all' && bestTime.pool_type === 1) {
      suffixes.push('L')
    }
    
    // 引き継ぎありのタイムの場合、Rを追加
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
      <div className="text-center py-8">
        <div className="text-gray-400 mb-4">
          <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <p className="text-gray-600">記録がありません</p>
        <p className="text-sm text-gray-500 mt-1">
          まだ記録を登録していません
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* タブとチェックボックス */}
      <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
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
            className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-xs sm:text-sm text-gray-700">引き継ぎタイムも含めて表示</span>
        </label>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-300">
        <table className="min-w-full table-fixed border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="px-1.5 sm:px-3 py-1 sm:py-2 text-left text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700 border-r border-gray-300 min-w-[40px] sm:min-w-[64px] w-[48px] sm:w-[72px] h-[32px] sm:h-[44px] tracking-wide">
              距離
            </th>
            {STYLES.map((style) => (
              <th
                key={style}
                className={`px-1.5 sm:px-3 py-1 sm:py-2 text-center text-[10px] sm:text-xs md:text-sm font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 min-w-[64px] sm:min-w-[110px] h-[32px] sm:h-[44px] ${styleHeaderBgClass[style]}`}
              >
                {style}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {DISTANCES.map((distance, rowIdx) => (
            <tr key={distance}>
              <td className={`px-1.5 sm:px-3 py-1.5 sm:py-3 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 min-w-[40px] sm:min-w-[64px] w-[48px] sm:w-[72px] h-[48px] sm:h-[64px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''}`}>
                {distance}m
              </td>
              {STYLES.map((style) => {
                const bestTime = getBestTime(style, distance)
                return (
                  <td
                    key={style}
                    className={`px-1.5 sm:px-3 py-1.5 sm:py-3 text-center text-[10px] sm:text-xs md:text-sm text-gray-900 border-r border-gray-300 last:border-r-0 min-w-[64px] sm:min-w-[110px] h-[48px] sm:h-[64px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''} ${isInvalidCombination(style, distance) ? 'bg-gray-200' : styleCellBgClass[style]}`}
                  >
                    {bestTime ? (
                      <div className={`group relative inline-block pt-1 sm:pt-2 ${(() => {
                        // 一括登録（competition なし）は New 表示対象外
                        if (!bestTime.competition) return ''
                        const createdAt = parseISO(bestTime.created_at)
                        const isNew = differenceInDays(new Date(), createdAt) <= 30
                        return isNew ? 'pr-4 sm:pr-6' : ''
                      })()}`}>
                        {(() => {
                          // 一括登録（competition なし）は New 表示対象外
                          if (!bestTime.competition) return null
                          const createdAt = parseISO(bestTime.created_at)
                          const isNew = differenceInDays(new Date(), createdAt) <= 30
                          return isNew ? (
                            <span className="absolute -top-0.5 sm:-top-1 -right-2 sm:-right-3 text-[8px] sm:text-[10px] md:text-xs bg-red-500 text-white px-1 sm:px-1.5 py-0.5 rounded-full shadow">New</span>
                          ) : null
                        })()}
                        {/* 通常表示：ベストタイム */}
                        <span className={`font-semibold text-xs sm:text-base md:text-lg ${(() => {
                          // 一括登録（competition なし）は New 表示対象外
                          if (!bestTime.competition) return 'text-gray-900'
                          const createdAt = parseISO(bestTime.created_at)
                          return differenceInDays(new Date(), createdAt) <= 30 ? 'text-red-600' : 'text-gray-900'
                        })()}`}>
                          {(() => {
                            const display = getTimeDisplay(bestTime)
                            return (
                              <>
                                {display.main}
                                {display.suffix && (
                                  <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1">{display.suffix}</span>
                                )}
                              </>
                            )
                          })()}
                        </span>
                        
                        {/* ホバー時の詳細情報 */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] md:text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                          <div className="flex items-center space-x-1 mb-1">
                            <CalendarIcon className="h-3 w-3" />
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
                          {/* 矢印 */}
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
      <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-red-600 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-1 sm:gap-0 sm:space-x-4">
        <span>※ L: 長水路,   R: 引き継ぎあり</span>
      </div>
    </div>
  )
}
