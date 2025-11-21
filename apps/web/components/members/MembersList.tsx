'use client'

import React from 'react'
import { UsersIcon } from '@heroicons/react/24/outline'

interface MembersListProps {
  teamId?: string
}

// TODO: 実装予定
export default function MembersList({ teamId: _teamId }: MembersListProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          メンバー一覧
        </h2>
        <UsersIcon className="h-6 w-6 text-gray-400" />
      </div>
      <div className="text-center py-8">
        <p className="text-gray-600">
          この機能は現在実装中です。
        </p>
      </div>
    </div>
  )
}
