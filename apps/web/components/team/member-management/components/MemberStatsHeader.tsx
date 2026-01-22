'use client'

import React from 'react'

interface MemberStatsHeaderProps {
  totalMembers: number
  adminCount: number
  userCount: number
  includeRelaying: boolean
  onToggleRelaying: (value: boolean) => void
}

/**
 * メンバー統計表示とリレー含む/含まないトグル
 */
export const MemberStatsHeader: React.FC<MemberStatsHeaderProps> = ({
  totalMembers,
  adminCount,
  userCount,
  includeRelaying,
  onToggleRelaying
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-gray-900">
          メンバー管理
        </h2>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={includeRelaying}
            onChange={(e) => onToggleRelaying(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">引き継ぎを含む</span>
        </label>
      </div>
      <div className="flex items-center space-x-4 text-sm text-gray-600">
        <span data-testid="team-member-count-total">
          総メンバー: <span className="font-medium text-gray-900">{totalMembers}人</span>
        </span>
        <span data-testid="team-member-count-admin">
          管理者: <span className="font-medium text-yellow-600">{adminCount}人</span>
        </span>
        <span data-testid="team-member-count-user">
          ユーザー: <span className="font-medium text-gray-700">{userCount}人</span>
        </span>
      </div>
    </div>
  )
}
