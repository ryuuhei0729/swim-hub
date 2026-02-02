'use client'

import React, { useMemo, useState } from 'react'
import { Tabs, Tab } from '@/components/ui'
import {
  calculateAllLapTimes,
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type SplitTime
} from '@/utils/lapTimeCalculator'
import { formatTimeBest } from '@/utils/formatters'

interface LapTimeDisplayProps {
  splitTimes: Array<{ distance: number | ''; splitTime: number }>
  raceDistance?: number // 種目の距離（m）
}

export function LapTimeDisplay({ splitTimes, raceDistance }: LapTimeDisplayProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'race'>('race')

  // split-timeを有効なものだけフィルタリングしてSplitTime型に変換
  const validSplitTimes: SplitTime[] = useMemo(() => {
    return splitTimes
      .filter(st => typeof st.distance === 'number' && st.distance > 0 && st.splitTime > 0)
      .map(st => ({
        distance: st.distance as number,
        splitTime: st.splitTime
      }))
  }, [splitTimes])

  // All Lapの計算
  const allLapTimes = useMemo(() => {
    return calculateAllLapTimes(validSplitTimes)
  }, [validSplitTimes])

  // 種目別Lapの計算
  const raceLapTimesTable = useMemo(() => {
    if (!raceDistance || validSplitTimes.length === 0) return []
    return calculateRaceLapTimesTable(validSplitTimes, raceDistance)
  }, [validSplitTimes, raceDistance])

  const lapIntervals = useMemo(() => {
    if (!raceDistance) return []
    return getLapIntervalsForRace(raceDistance)
  }, [raceDistance])

  const tabs: Tab[] = [
    { id: 'race', label: '距離別 Lap' },
    { id: 'all', label: 'All Lap' }
  ]

  if (validSplitTimes.length === 0) {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500 text-center">
          スプリットタイムを入力してください
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200">
      <Tabs tabs={tabs} activeTabId={activeTab} onTabChange={(tabId) => setActiveTab(tabId as 'all' | 'race')} className="px-4" />
      
      <div className="p-4">
        {activeTab === 'all' && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-2">全てのラップタイム</h4>
            {allLapTimes.length === 0 ? (
              <p className="text-sm text-gray-500">ラップタイムを計算できません</p>
            ) : (
              <div className="space-y-1">
                {allLapTimes.map((lap, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1 px-2 bg-white rounded border border-gray-200"
                  >
                    <span className="text-sm text-gray-600">
                      {lap.fromDistance}m - {lap.toDistance}m
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatTimeBest(lap.lapTime)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'race' && (
          <div>
            {!raceDistance ? (
              <p className="text-sm text-gray-500">種目を選択してください</p>
            ) : raceLapTimesTable.length === 0 ? (
              <p className="text-sm text-gray-500">ラップタイムを計算できません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        距離
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Split Time
                      </th>
                      {lapIntervals.map((interval) => (
                        <th
                          key={interval}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                        >
                          {interval}m Lap
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {raceLapTimesTable.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.distance}m
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {row.splitTime !== null ? formatTimeBest(row.splitTime) : '-'}
                        </td>
                        {lapIntervals.map((interval) => (
                          <td
                            key={interval}
                            className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                          >
                            {row.lapTimes[interval] !== null && row.lapTimes[interval] !== undefined
                              ? formatTimeBest(row.lapTimes[interval]!)
                              : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

