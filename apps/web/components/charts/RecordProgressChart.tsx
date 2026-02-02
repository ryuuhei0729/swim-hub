'use client'

import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Record, Competition } from '@apps/shared/types'
import { formatTimeBest } from '@/utils/formatters'

// カスタムツールチップ（コンポーネント外に定義）
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string; payload?: { dateLabel?: string } }> }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-300 rounded-md shadow-lg">
        <p className="font-medium text-gray-900 mb-2">
          {payload[0]?.payload?.dateLabel}
        </p>
        {payload.map((entry, index: number) => {
          if (!entry.value) return null
          return (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${formatTimeBest(entry.value)}`}
            </p>
          )
        })}
      </div>
    )
  }
  return null
}

interface ChartDataPoint {
  date: string // 大会日付（ISO形式）
  dateLabel: string // 表示用日付（MM/dd形式）
  shortNoRelay?: number // 短水路・引き継ぎなしのタイム（秒）
  shortRelay?: number // 短水路・引き継ぎありのタイム（秒）
  longNoRelay?: number // 長水路・引き継ぎなしのタイム（秒）
  longRelay?: number // 長水路・引き継ぎありのタイム（秒）
}

interface RecordProgressChartProps {
  records: Record[]
  selectedStyleId: number | null
}

/**
 * 大会記録の成長度合いを表示する折れ線グラフ
 * 種目を選択すると、4本の折れ線（短水路/長水路 × 引き継ぎなし/あり）を表示
 */
export default function RecordProgressChart({
  records,
  selectedStyleId
}: RecordProgressChartProps) {
  // グラフデータを生成
  const { chartData, yAxisDomain } = useMemo(() => {
    if (!selectedStyleId) {
      return { chartData: [], yAxisDomain: undefined }
    }

    // 選択した種目の記録を抽出
    const styleRecords = records.filter(
      (record) => record.style_id === selectedStyleId
    )

    if (styleRecords.length === 0) {
      return { chartData: [], yAxisDomain: undefined }
    }

    // 日付ごとにグループ化
    const dateMap = new Map<string, {
      shortNoRelay?: number
      shortRelay?: number
      longNoRelay?: number
      longRelay?: number
    }>()

    styleRecords.forEach((record) => {
      const competition = record.competition as Competition
      if (!competition?.date) {
        return
      }

      const dateKey = competition.date
      const poolType = record.pool_type
      const isRelay = record.is_relaying

      // 日付ごとのデータを初期化
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {})
      }

      const dateData = dateMap.get(dateKey)!

      // 4つのカテゴリに分類
      if (poolType === 0) {
        // 短水路
        if (isRelay) {
          // 引き継ぎあり
          if (!dateData.shortRelay || record.time < dateData.shortRelay) {
            dateData.shortRelay = record.time
          }
        } else {
          // 引き継ぎなし
          if (!dateData.shortNoRelay || record.time < dateData.shortNoRelay) {
            dateData.shortNoRelay = record.time
          }
        }
      } else if (poolType === 1) {
        // 長水路
        if (isRelay) {
          // 引き継ぎあり
          if (!dateData.longRelay || record.time < dateData.longRelay) {
            dateData.longRelay = record.time
          }
        } else {
          // 引き継ぎなし
          if (!dateData.longNoRelay || record.time < dateData.longNoRelay) {
            dateData.longNoRelay = record.time
          }
        }
      }
    })

    // 日付順にソートして配列に変換
    const sortedDates = Array.from(dateMap.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )

    const data = sortedDates.map((dateKey) => {
      const dateData = dateMap.get(dateKey)!
      return {
        date: dateKey,
        dateLabel: format(new Date(dateKey), 'MM/dd', { locale: ja }),
        shortNoRelay: dateData.shortNoRelay,
        shortRelay: dateData.shortRelay,
        longNoRelay: dateData.longNoRelay,
        longRelay: dateData.longRelay
      } as ChartDataPoint
    })

    // データの最小値と最大値を計算
    const allValues: number[] = []
    data.forEach((point) => {
      if (point.shortNoRelay !== undefined) allValues.push(point.shortNoRelay)
      if (point.shortRelay !== undefined) allValues.push(point.shortRelay)
      if (point.longNoRelay !== undefined) allValues.push(point.longNoRelay)
      if (point.longRelay !== undefined) allValues.push(point.longRelay)
    })

    let domain: [number, number] | undefined = undefined
    if (allValues.length > 0) {
      const minValue = Math.min(...allValues)
      const maxValue = Math.max(...allValues)
      const range = maxValue - minValue

      // データの範囲に余白を追加（最小値の5%下、最大値の5%上）
      // ただし、最小値が0より大きい場合は、最小値から少し下げる
      const padding = Math.max(range * 0.05, 0.5) // 範囲の5%または0.5秒の大きい方
      const minDomain = Math.max(0, minValue - padding)
      const maxDomain = maxValue + padding

      domain = [minDomain, maxDomain]
    }

    return { chartData: data, yAxisDomain: domain }
  }, [records, selectedStyleId])

  // カスタムY軸フォーマッター（秒を分:秒形式に変換）
  const formatYAxis = (value: number) => {
    return formatTimeBest(value)
  }

  if (!selectedStyleId) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">種目を選択してください</p>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">該当する記録がありません</p>
      </div>
    )
  }

  return (
    <div className="w-full h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="dateLabel"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tickFormatter={formatYAxis}
            domain={yAxisDomain || [0, 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="shortNoRelay"
            name="短水路・引き継ぎなし"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="shortRelay"
            name="短水路・引き継ぎあり"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="longNoRelay"
            name="長水路・引き継ぎなし"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="longRelay"
            name="長水路・引き継ぎあり"
            stroke="#fb7185"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

