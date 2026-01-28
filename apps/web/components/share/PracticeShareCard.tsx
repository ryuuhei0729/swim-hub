'use client'

import { forwardRef } from 'react'
import type { PracticeShareData } from './types'
import {
  formatTime,
  formatCircle,
  getStyleNameJp,
  getCategoryNameJp,
} from './utils'

interface PracticeShareCardProps {
  data: PracticeShareData
  className?: string
}

/**
 * 練習メニューシェアカード
 * 白背景にシンプルなデザイン
 */
export const PracticeShareCard = forwardRef<
  HTMLDivElement,
  PracticeShareCardProps
>(function PracticeShareCard({ data, className = '' }, ref) {
  return (
    <div
      ref={ref}
      className={`relative w-[480px] overflow-hidden bg-white ${className}`}
    >
      {/* コンテンツ */}
      <div className="flex flex-col p-5">
        {/* ヘッダー：日付と練習情報 */}
        <div className="mb-4 pb-4 border-b-2 border-sky-100">
          <p className="text-slate-500 text-sm mb-1">{data.date}</p>
          <h2 className="text-slate-800 text-xl font-bold tracking-wide">
            {data.title}
          </h2>
          {data.place && (
            <p className="text-slate-500 text-sm mt-1">{data.place}</p>
          )}
        </div>

        {/* メニュー一覧 */}
        <div className="space-y-3">
          {data.menuItems.map((item, index) => {
            const allTimes = item.times || []
            
            return (
              <div
                key={index}
                className="bg-green-50 rounded-lg p-4"
              >
                {/* メニューヘッダー */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-800 font-semibold">
                      {item.distance}m × {item.repCount} × {item.setCount}
                    </span>
                    <span className="text-green-700 text-sm">
                      {getStyleNameJp(item.style)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs">
                      {getCategoryNameJp(item.category)}
                    </span>
                    {item.circle && (
                      <span className="text-slate-500 text-sm">
                        @{formatCircle(item.circle)}
                      </span>
                    )}
                  </div>
                </div>

                {/* タイム表示テーブル */}
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
                            {Array.from({ length: item.setCount }, (_, setIndex) => (
                              <th key={setIndex + 1} className="text-center py-2 px-2 font-medium text-green-800">
                                {setIndex + 1}セット目
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: item.repCount }, (_, repIndex) => {
                            const repNumber = repIndex + 1
                            return (
                              <tr key={repNumber} className="border-b border-green-100">
                                <td className="py-2 px-2 font-medium text-gray-700">{repNumber}本目</td>
                                {Array.from({ length: item.setCount }, (_, setIndex) => {
                                  const setNumber = setIndex + 1
                                  const time = allTimes.find(
                                    (t) => t.setNumber === setNumber && t.repNumber === repNumber
                                  )
                                  return (
                                    <td key={setNumber} className="py-2 px-2 text-center">
                                      <span className="text-green-600 font-semibold">
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
                            {Array.from({ length: item.setCount }, (_, setIndex) => {
                              const setNumber = setIndex + 1
                              const setTimes = allTimes.filter(
                                (t) => t.setNumber === setNumber && t.time > 0
                              )
                              const average =
                                setTimes.length > 0
                                  ? setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
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
                            <td className="py-2 px-2 text-center" colSpan={item.setCount}>
                              <span className="text-blue-800 font-bold">
                                {(() => {
                                  const allValidTimes = allTimes.filter((t) => t.time > 0)
                                  const overallAverage =
                                    allValidTimes.length > 0
                                      ? allValidTimes.reduce((sum, t) => sum + t.time, 0) /
                                        allValidTimes.length
                                      : 0
                                  return overallAverage > 0 ? formatTime(overallAverage) : '-'
                                })()}
                              </span>
                            </td>
                          </tr>
                          {/* 全体最速行 */}
                          <tr className="bg-blue-50">
                            <td className="py-2 px-2 font-medium text-blue-800">全体最速</td>
                            <td className="py-2 px-2 text-center" colSpan={item.setCount}>
                              <span className="text-blue-800 font-bold">
                                {(() => {
                                  const allValidTimes = allTimes.filter((t) => t.time > 0)
                                  const overallFastest =
                                    allValidTimes.length > 0
                                      ? Math.min(...allValidTimes.map((t) => t.time))
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

                {/* メモ */}
                {item.note && (
                  <div className="mt-3 rounded-lg p-3 border border-slate-200 bg-white">
                    <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                    <div className="text-sm text-gray-700">{item.note}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* フッター：ブランディング */}
        <div className="pt-4 mt-4 border-t border-slate-100">
          <div className="flex items-center justify-center gap-2">
            <img
              src="/favicon.png"
              alt="SwimHub"
              className="w-5 h-5 object-contain"
            />
            <span className="text-slate-700 text-sm font-semibold tracking-wide">
              SwimHub
            </span>
            <img
              src="/favicon.png"
              alt="SwimHub"
              className="w-5 h-5 object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  )
})
