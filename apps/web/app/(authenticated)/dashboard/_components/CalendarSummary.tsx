'use client'

import React from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { CalendarItem, MonthlySummary } from '@/types'

interface CalendarSummaryProps {
  currentDate: Date
  monthlySummary: MonthlySummary
  entries: CalendarItem[]
  isLoading: boolean
}

export default function CalendarSummary({
  currentDate,
  monthlySummary,
  entries,
  isLoading
}: CalendarSummaryProps) {
  return (
    <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-blue-50 to-green-50">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <span className="mr-2">📊</span>
          {format(currentDate, 'M月', { locale: ja })}のサマリー
        </h3>
      </div>
      {isLoading ? (
        // サマリーローディング状態
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 animate-pulse">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
              <div className="ml-3 flex-1">
                <div className="w-8 h-6 bg-gray-300 rounded mb-1"></div>
                <div className="w-12 h-4 bg-gray-300 rounded"></div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 animate-pulse">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
              <div className="ml-3 flex-1">
                <div className="w-8 h-6 bg-gray-300 rounded mb-1"></div>
                <div className="w-12 h-4 bg-gray-300 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 shadow-sm border border-green-100">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-sm">💪</span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <div className="text-xl font-bold text-green-600">
                  {monthlySummary?.practiceCount || 
                    entries.filter(e => e.type === 'practice' && 
                    format(new Date(e.date), 'yyyy-MM') === format(currentDate, 'yyyy-MM')).length}
                </div>
                <div className="text-sm text-gray-600">練習回数</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-blue-100">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm">🏊‍♂️</span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <div className="text-xl font-bold text-blue-600">
                  {monthlySummary?.recordCount || 
                    entries.filter(e => e.type === 'record' && 
                    format(new Date(e.date), 'yyyy-MM') === format(currentDate, 'yyyy-MM')).length}
                </div>
                <div className="text-sm text-gray-600">大会回数</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 追加の統計情報 */}
      {(monthlySummary?.totalDistance || monthlySummary?.averageTime) && (
        <div className="mt-4 pt-4 border-t border-white/50">
          <div className="grid grid-cols-2 gap-4">
            {monthlySummary.totalDistance && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                      <span className="text-xs">📏</span>
                    </div>
                  </div>
                  <div className="ml-2 flex-1">
                    <div className="text-lg font-semibold text-purple-600">
                      {(monthlySummary.totalDistance / 1000).toFixed(1)}km
                    </div>
                    <div className="text-xs text-gray-600">総距離</div>
                  </div>
                </div>
              </div>
            )}
            {monthlySummary.averageTime && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
                      <span className="text-xs">⏱️</span>
                    </div>
                  </div>
                  <div className="ml-2 flex-1">
                    <div className="text-lg font-semibold text-orange-600">
                      {(monthlySummary.averageTime / 100).toFixed(2)}s
                    </div>
                    <div className="text-xs text-gray-600">平均タイム</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
