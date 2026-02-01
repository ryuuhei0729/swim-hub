'use client'

import React from 'react'
import { Avatar } from '@/components/ui'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { formatDate } from '@apps/shared/utils/date'
import type { TeamMember } from '../hooks/useMembers'

interface PendingMembersSectionProps {
  pendingMembers: TeamMember[]
  isLoading: boolean
  onApprove: (membershipId: string) => Promise<boolean>
  onReject: (membershipId: string) => Promise<boolean>
}

/**
 * 承認待ちメンバーのリスト表示コンポーネント
 */
export const PendingMembersSection: React.FC<PendingMembersSectionProps> = ({
  pendingMembers,
  isLoading,
  onApprove,
  onReject
}) => {
  if (pendingMembers.length === 0) {
    return null
  }

  return (
    <div className="mb-6 border-b border-gray-200 pb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        承認待ち ({pendingMembers.length}件)
      </h3>
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(2)].map((_, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {pendingMembers.map((pendingMember) => (
            <div
              key={pendingMember.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Avatar
                  avatarUrl={pendingMember.users?.profile_image_path || null}
                  userName={pendingMember.users?.name || 'Unknown User'}
                  size="md"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {pendingMember.users?.name || 'Unknown User'}
                  </p>
                  <p className="text-xs text-gray-500">
                    申請日: {formatDate(pendingMember.created_at || pendingMember.joined_at, 'numeric')}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onApprove(pendingMember.id)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  <CheckCircleIcon className="h-4 w-4 mr-1" />
                  承認
                </button>
                <button
                  onClick={() => onReject(pendingMember.id)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <XCircleIcon className="h-4 w-4 mr-1" />
                  拒否
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
