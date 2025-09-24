'use client'

import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useQuery } from '@apollo/client/react'
import { GET_PRACTICE } from '@/graphql/queries'

interface PracticeTimeModalProps {
  isOpen: boolean
  onClose: () => void
  practiceId: string
  location?: string
}

export default function PracticeTimeModal({
  isOpen,
  onClose,
  practiceId,
  location
}: PracticeTimeModalProps) {
  const { data, loading, error } = useQuery(GET_PRACTICE, {
    variables: { id: practiceId },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
    errorPolicy: 'ignore',
  })

  if (!isOpen) return null

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
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
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
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

  const practice = (data as any)?.practice
  if (!practice) {
    return null
  }

  const practiceLogs = practice.practiceLogs || []


  // タイム表示のフォーマット関数
  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
      : `${remainingSeconds.toFixed(2)}`
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        />
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
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

            <div className="mt-3 space-y-4">
              {practiceLogs.map((log: any, index: number) => {
                const allTimes = log.times || []

                return (
                  <div key={log.id} className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border-0 rounded-lg p-4">
                    {/* ヘッダー: 場所、タグ */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        {location && (
                          <p className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                            <span className="text-gray-400">📍</span>
                            {location}
                          </p>
                        )}
                        {log.tags && Array.isArray(log.tags) && log.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {log.tags.map((tag: any) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full text-black"
                                style={{
                                  backgroundColor: tag.color
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
                                      const time = allTimes.find(t => t.setNumber === setNumber && t.repNumber === repNumber)
                                      const setTimes = allTimes.filter(t => t.setNumber === setNumber && t.time > 0)
                                      const setFastest = setTimes.length > 0 ? Math.min(...setTimes.map(t => t.time)) : 0
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
                                <td className="py-2 px-2 font-medium text-green-800">平均</td>
                                {Array.from({ length: log.setCount }, (_, setIndex) => {
                                  const setNumber = setIndex + 1
                                  const setTimes = allTimes.filter(t => t.setNumber === setNumber && t.time > 0)
                                  const average = setTimes.length > 0
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
                                <td className="py-2 px-2 text-center" colSpan={log.setCount}>
                                  <span className="text-blue-800 font-bold">
                                    {(() => {
                                      const allValidTimes = allTimes.filter(t => t.time > 0)
                                      const overallAverage = allValidTimes.length > 0
                                        ? allValidTimes.reduce((sum, t) => sum + t.time, 0) / allValidTimes.length
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
                                      const allValidTimes = allTimes.filter(t => t.time > 0)
                                      const overallFastest = allValidTimes.length > 0
                                        ? Math.min(...allValidTimes.map(t => t.time))
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
