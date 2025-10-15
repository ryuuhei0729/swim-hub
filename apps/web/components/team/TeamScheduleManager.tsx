'use client'

import React from 'react'

interface TeamScheduleManagerProps {
  teamId: string
}

// TODO: Supabase直接アクセスで実装する
export default function TeamScheduleManager({ teamId }: TeamScheduleManagerProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        スケジュール管理
        </h2>
      <div className="text-center py-8">
        <p className="text-gray-600">
          この機能は現在実装中です。
        </p>
        <p className="text-sm text-gray-500 mt-2">
          チームスケジュール管理機能を実装予定です。
        </p>
      </div>
    </div>
  )
}
