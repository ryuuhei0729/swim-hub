import React from 'react'
import { TrashIcon } from '@heroicons/react/24/outline'
import type { MemberDetail } from '@/types/member-detail'

interface AdminControlsProps {
  member: MemberDetail
  isRemoving: boolean
  onRoleChangeClick: (newRole: 'admin' | 'user') => void
  onRemoveMember: () => void
}

export function AdminControls({
  member,
  isRemoving,
  onRoleChangeClick,
  onRemoveMember
}: AdminControlsProps) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-medium text-gray-900 mb-4">管理者機能</h3>
      <div className="flex items-center space-x-4">
        {/* 権限切り替え */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1" data-testid="team-member-role-toggle">
          <button
            onClick={() => onRoleChangeClick('user')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              member.role === 'user'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            data-testid="team-member-role-user-button"
          >
            ユーザー
          </button>
          <button
            onClick={() => onRoleChangeClick('admin')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              member.role === 'admin'
                ? 'bg-yellow-100 text-yellow-800 shadow-sm'
                : 'text-gray-600 hover:text-yellow-700'
            }`}
            data-testid="team-member-role-admin-button"
          >
            管理者
          </button>
        </div>

        {/* 削除ボタン */}
        <button
          onClick={onRemoveMember}
          disabled={isRemoving}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          data-testid="team-member-remove-button"
        >
          <TrashIcon className="h-4 w-4" />
          <span>{isRemoving ? '削除中...' : 'チームから削除'}</span>
        </button>
      </div>
    </div>
  )
}
