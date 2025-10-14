'use client'

import React from 'react'

interface TeamPracticeManagerProps {
  teamId: string
}

// TODO: GraphQL移行完了後に実装する
export default function TeamPracticeManager({ teamId }: TeamPracticeManagerProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        練習管理
      </h2>
      <div className="text-center py-8">
        <p className="text-gray-600">
          この機能は現在実装中です。
        </p>
        <p className="text-sm text-gray-500 mt-2">
          GraphQL移行完了後に利用可能になります。
        </p>
      </div>
    </div>
  )
}
