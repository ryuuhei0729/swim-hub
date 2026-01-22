'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { BaseModal } from '@/components/ui'
import { TrophyIcon } from '@heroicons/react/24/outline'
import { useMemberDetail } from '@/hooks/useMemberDetail'
import { useBestTimes } from '@/hooks/useBestTimes'
import { ProfileSection } from '@/components/member-detail/ProfileSection'
import { AdminControls } from '@/components/member-detail/AdminControls'
import { BestTimesTable } from '@/components/member-detail/BestTimesTable'
import { RoleChangeModal } from '@/components/member-detail/RoleChangeModal'
import type { MemberDetail } from '@/types/member-detail'

// 型を再エクスポート（後方互換性のため）
export type { MemberDetail, BestTime } from '@/types/member-detail'

export interface MemberDetailModalProps {
  isOpen: boolean
  onClose: () => void
  member: MemberDetail | null
  currentUserId: string
  isCurrentUserAdmin: boolean
  onMembershipChange?: () => void
}

export default function MemberDetailModal({
  isOpen,
  onClose,
  member,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange
}: MemberDetailModalProps) {
  const [isRoleChangeConfirmOpen, setIsRoleChangeConfirmOpen] = useState(false)
  const [pendingRole, setPendingRole] = useState<'admin' | 'user' | null>(null)

  const { supabase } = useAuth()
  const { error, isRemoving, handleRoleChange, handleRemoveMember } = useMemberDetail(
    supabase,
    currentUserId,
    onMembershipChange
  )
  const { bestTimes, loading, error: bestTimesError, loadBestTimes } = useBestTimes(supabase)

  useEffect(() => {
    if (isOpen && member) {
      loadBestTimes(member.user_id)
    }
  }, [isOpen, member, loadBestTimes])

  const handleRoleChangeClick = (newRole: 'admin' | 'user') => {
    if (member?.role === newRole) return
    setPendingRole(newRole)
    setIsRoleChangeConfirmOpen(true)
  }

  const confirmRoleChange = async () => {
    if (pendingRole && member) {
      try {
        await handleRoleChange(member, pendingRole)
        member.role = pendingRole
      } catch {
        // エラーはhookで処理される
      }
    }
    setIsRoleChangeConfirmOpen(false)
    setPendingRole(null)
  }

  const cancelRoleChange = () => {
    setIsRoleChangeConfirmOpen(false)
    setPendingRole(null)
  }

  const handleRemove = async () => {
    if (!member) return
    const success = await handleRemoveMember(member)
    if (success) {
      onClose()
    }
  }

  const displayError = error || bestTimesError

  if (!member) return null

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
        <div className="w-full max-w-4xl mx-auto p-6" data-testid="team-member-detail-modal">
          {/* エラー表示 */}
          {displayError && (
            <div className="mb-8 rounded-md bg-red-50 p-4" data-testid="team-member-detail-error">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    エラーが発生しました
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{displayError}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* プロフィール情報 */}
          <ProfileSection member={member} currentUserId={currentUserId} />

          {/* 区切り線 */}
          <div className="border-t border-gray-200 mb-8"></div>

          {/* 管理者機能 */}
          {isCurrentUserAdmin && member.user_id !== currentUserId && (
            <AdminControls
              member={member}
              isRemoving={isRemoving}
              onRoleChangeClick={handleRoleChangeClick}
              onRemoveMember={handleRemove}
            />
          )}

          {/* ベストタイム */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <TrophyIcon className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-medium text-gray-900">Best Time</h3>
            </div>

            {loading ? (
              <div className="animate-pulse">
                <div className="bg-gray-200 rounded-lg h-64"></div>
              </div>
            ) : bestTimes.length > 0 ? (
              <BestTimesTable bestTimes={bestTimes} />
            ) : (
              <div className="text-center py-8">
                <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">記録がありません</p>
                <p className="text-sm text-gray-500 mt-1">
                  このメンバーはまだ記録を登録していません
                </p>
              </div>
            )}

            {/* 閉じるボタン */}
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                data-testid="team-member-detail-close-button"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      </BaseModal>

      {/* 権限変更確認モーダル */}
      <RoleChangeModal
        isOpen={isRoleChangeConfirmOpen}
        member={member}
        pendingRole={pendingRole}
        onConfirm={confirmRoleChange}
        onCancel={cancelRoleChange}
      />
    </>
  )
}
