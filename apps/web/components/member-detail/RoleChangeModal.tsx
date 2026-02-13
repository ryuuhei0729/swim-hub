import React from 'react'
import BaseModal from '@/components/ui/BaseModal'
import type { MemberDetail } from '@/types/member-detail'

interface RoleChangeModalProps {
  isOpen: boolean
  member: MemberDetail | null
  pendingRole: 'admin' | 'user' | null
  onConfirm: () => void
  onCancel: () => void
}

export function RoleChangeModal({
  isOpen,
  member,
  pendingRole,
  onConfirm,
  onCancel
}: RoleChangeModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title="権限変更の確認"
      size="sm"
    >
      <div className="p-4">
        <p className="text-gray-700 mb-6">
          {member?.users?.name}さんの権限を
          「{pendingRole === 'admin' ? '管理者' : 'ユーザー'}」に変更しますか？
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
          >
            変更する
          </button>
        </div>
      </div>
    </BaseModal>
  )
}
