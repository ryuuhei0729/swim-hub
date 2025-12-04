'use client'

import React, { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { 
  TeamAnnouncements,
  TeamMemberManagement,
  TeamPractices,
  TeamCompetitions,
  TeamSettings,
  TeamBulkRegister
} from '@/components/team'
import TeamAdminTabs from '@/components/team/TeamAdminTabs'
import type { TeamAdminTabType } from '@/components/team/TeamAdminTabs'
import MyMonthlyAttendance from '@/components/team/MyMonthlyAttendance'
import MemberDetailModal from '@/components/team/MemberDetailModal'
import type { MemberDetail } from '@/components/team/MemberDetailModal'
import { TeamMembership, TeamWithMembers } from '@swim-hub/shared/types/database'
import { useTeamAdminStore } from '@/stores/form/teamAdminStore'

interface TeamAdminClientProps {
  teamId: string
  initialTeam: TeamWithMembers | null
  initialMembership: TeamMembership | null
  initialTab?: string
}

/**
 * チーム管理ページのインタラクティブ部分を担当するClient Component
 */
export default function TeamAdminClient({
  teamId,
  initialTeam,
  initialMembership,
  initialTab
}: TeamAdminClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  
  const {
    team,
    membership,
    loading,
    activeTab,
    selectedMember,
    isMemberModalOpen,
    setTeam,
    setMembership,
    setLoading,
    setActiveTab,
    openMemberModal,
    closeMemberModal
  } = useTeamAdminStore()

  // サーバー側から取得したデータをストアに設定
  useEffect(() => {
    setTeam(initialTeam)
    setMembership(initialMembership)
    setLoading(false)
  }, [initialTeam, initialMembership, setTeam, setMembership, setLoading])

  // URLパラメータからタブを取得
  useEffect(() => {
    const tabParam = searchParams.get('tab') || initialTab
    if (tabParam && ['announcements', 'members', 'practices', 'competitions', 'attendance', 'bulk-register', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam as TeamAdminTabType)
    }
  }, [searchParams, initialTab, setActiveTab])

  // 表示用のデータ（ストアから取得、なければ初期データを使用）
  const displayTeam = team || initialTeam
  const displayMembership = membership || initialMembership

  if (loading && !displayTeam) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!displayTeam) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            チームが見つかりません
          </h1>
          <p className="text-gray-600">
            指定されたチームは存在しないか、アクセス権限がありません。
          </p>
        </div>
      </div>
    )
  }

  // 管理者権限チェック（このページは管理者専用）
  if (displayMembership?.role !== 'admin') {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            アクセス権限がありません
          </h1>
          <p className="text-gray-600">
            このページにアクセスするには管理者権限が必要です。
          </p>
        </div>
      </div>
    )
  }

  const handleMemberClick = (member: MemberDetail) => {
    openMemberModal(member)
  }

  const handleCloseMemberModal = () => {
    closeMemberModal()
  }

  // アクティブなタブのコンテンツをレンダリング（管理者モード）
  const renderTabContent = () => {
    switch (activeTab) {
      case 'announcements':
        return (
          <TeamAnnouncements 
            teamId={teamId}
            isAdmin={true}
            viewOnly={false}
          />
        )
      case 'members':
        return (
          <TeamMemberManagement 
            teamId={teamId}
            currentUserId={user?.id || ''}
            isCurrentUserAdmin={true}
            onMembershipChange={() => {
              // メンバー情報を再読み込み
              router.refresh()
            }}
            onMemberClick={handleMemberClick}
          />
        )
      case 'practices':
        return <TeamPractices teamId={teamId} isAdmin={true} />
      case 'competitions':
        return <TeamCompetitions teamId={teamId} isAdmin={true} />
      case 'attendance':
        return <MyMonthlyAttendance teamId={teamId} />
      case 'bulk-register':
        return <TeamBulkRegister teamId={teamId} isAdmin={true} />
      case 'settings':
        return (
          <TeamSettings 
            teamId={teamId}
            teamName={displayTeam.name}
            teamDescription={displayTeam.description || undefined}
            isAdmin={true}
          />
        )
      default:
        return null
    }
  }

  return (
    <div>
      {/* チームヘッダー */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {displayTeam.name}
            </h1>
            {displayTeam.description && (
              <p className="text-gray-600 mb-4">{displayTeam.description}</p>
            )}
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                管理者
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="mt-4">
        <TeamAdminTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* タブコンテンツ */}
      <div className="bg-white rounded-lg shadow mt-4">
        {renderTabContent()}
      </div>

      {/* メンバー詳細モーダル */}
      <MemberDetailModal
        isOpen={isMemberModalOpen}
        onClose={handleCloseMemberModal}
        member={selectedMember}
        currentUserId={user?.id || ''}
        isCurrentUserAdmin={true}
        onMembershipChange={() => {
          // メンバー情報を再読み込み
          router.refresh()
        }}
      />
    </div>
  )
}


