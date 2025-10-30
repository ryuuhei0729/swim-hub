'use client'

import React from 'react'
import { CalendarIcon } from '@heroicons/react/24/outline'

export interface BestTime {
  id: string
  time: number
  created_at: string
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
}

interface BestTimesTableProps {
  bestTimes: BestTime[]
}

// 静的距離リスト（50m, 100m, 200m, 400m, 800m）
const DISTANCES = [50, 100, 200, 400, 800]

// 静的種目リスト
const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

export default function BestTimesTable({ bestTimes }: BestTimesTableProps) {
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
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = time - minutes * 60
    if (minutes === 0) {
      return seconds.toFixed(2)
    }
    return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP')
  }

  const getBestTime = (style: string, distance: number) => {
    // データベースの種目名形式（例：50m自由形）で検索
    const dbStyleName = `${distance}m${style}`
    return bestTimes.find(bt => bt.style.name_jp === dbStyleName)
  }

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
    <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-300">
      <table className="min-w-full table-fixed border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left text-xs md:text-sm font-semibold text-gray-700 border-r border-gray-300 min-w-[64px] w-[72px] h-[44px] tracking-wide">
              距離
            </th>
            {STYLES.map((style) => (
              <th
                key={style}
                className={`px-3 py-2 text-center text-xs md:text-sm font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 min-w-[110px] h-[44px] ${styleHeaderBgClass[style]}`}
              >
                {style}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {DISTANCES.map((distance, rowIdx) => (
            <tr key={distance}>
              <td className={`px-3 py-3 text-xs md:text-sm font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 min-w-[64px] w-[72px] h-[64px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''}`}>
                {distance}m
              </td>
              {STYLES.map((style) => {
                const bestTime = getBestTime(style, distance)
                return (
                  <td
                    key={style}
                    className={`px-3 py-3 text-center text-xs md:text-sm text-gray-900 border-r border-gray-300 last:border-r-0 min-w-[110px] h-[64px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''} ${isInvalidCombination(style, distance) ? 'bg-gray-200' : styleCellBgClass[style]}`}
                  >
                    {bestTime ? (
                      <div className="group relative inline-block pr-6 pt-2">
                        {(() => {
                          const createdAt = new Date(bestTime.created_at)
                          const now = new Date()
                          const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
                          const isNew = diffDays <= 30
                          return isNew ? (
                            <span className="absolute -top-1 -right-3 text-[10px] md:text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full shadow">New</span>
                          ) : null
                        })()}
                        {/* 通常表示：ベストタイムのみ（セル背景色で表現） */}
                        <span className={`font-semibold text-base md:text-lg ${(() => {
                          const createdAt = new Date(bestTime.created_at)
                          const now = new Date()
                          const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
                          return diffDays <= 30 ? 'text-red-600' : 'text-gray-900'
                        })()}`}>
                          {formatTime(bestTime.time)}
                        </span>
                        
                        {/* ホバー時の詳細情報 */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] md:text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                          <div className="flex items-center space-x-1 mb-1">
                            <CalendarIcon className="h-3 w-3" />
                            <span>{formatDate(bestTime.created_at)}</span>
                          </div>
                          {bestTime.competition && (
                            <div className="text-blue-300">
                              {bestTime.competition.title}
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
  )
}
