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
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = (time % 60).toFixed(2)
    return `${minutes}:${seconds.padStart(5, '0')}`
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
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-sm font-semibold text-gray-900 border-r border-gray-200 min-w-[100px] h-[50px]">
              種目
            </th>
            {DISTANCES.map((distance) => (
              <th key={distance} className="px-3 py-2 text-center text-sm font-semibold text-gray-900 border-r border-gray-200 last:border-r-0 min-w-[120px] h-[50px]">
                {distance}m
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {STYLES.map((style) => (
            <tr key={style} className="hover:bg-gray-50 transition-colors duration-150">
              <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-200 bg-gray-50 min-w-[100px] h-[80px]">
                {style}
              </td>
              {DISTANCES.map((distance) => {
                const bestTime = getBestTime(style, distance)
                return (
                  <td key={distance} className="px-3 py-2 text-center text-sm text-gray-900 border-r border-gray-200 last:border-r-0 min-w-[120px] h-[80px]">
                    {bestTime ? (
                      <div className="flex flex-col items-center space-y-1">
                        <span className="font-bold text-base text-gray-900 bg-yellow-50 px-2 py-1 rounded">
                          {formatTime(bestTime.time)}
                        </span>
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                          <CalendarIcon className="h-3 w-3" />
                          <span>{formatDate(bestTime.created_at)}</span>
                        </div>
                        {bestTime.competition && (
                          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                            {bestTime.competition.title}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-base">-</span>
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
