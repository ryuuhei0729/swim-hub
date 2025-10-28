'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts'
import { PlusIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import TeamCreateModal from '@/components/team/TeamCreateModal'
import TeamJoinModal from '@/components/team/TeamJoinModal'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)

  const handleTeamCreated = (teamId: string) => {
    router.push(`/teams/${teamId}`)
  }

  const handleTeamJoined = (teamId: string) => {
    router.push(`/teams/${teamId}`)
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          設定
        </h1>
        <p className="text-gray-600">
          システムの設定を管理します
        </p>
      </div>

      {/* チーム管理セクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          チーム管理
        </h2>
        <p className="text-gray-600 mb-6">
          チームに参加または新規作成します
        </p>
        
        <div className="flex space-x-3">
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <UserPlusIcon className="h-5 w-5 mr-2" />
            チームに参加
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            新規作成
          </button>
        </div>
      </div>

      {/* モーダル */}
      <TeamJoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={handleTeamJoined}
      />
      <TeamCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTeamCreated}
      />
    </div>
  )
}
