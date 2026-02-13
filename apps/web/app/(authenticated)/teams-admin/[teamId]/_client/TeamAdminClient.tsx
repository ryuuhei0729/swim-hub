'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import TeamAdminTabs from '@/components/team/TeamAdminTabs'
import type { TeamAdminTabType } from '@/components/team/TeamAdminTabs'
import MemberDetailModal from '@/components/team/MemberDetailModal'

// タブコンテンツは一度に1つしか表示されないため遅延読み込み
const TeamAnnouncements = dynamic(() => import('@/components/team/TeamAnnouncements').then(m => ({ default: m.TeamAnnouncements })))
const TeamMemberManagement = dynamic(() => import('@/components/team/TeamMemberManagement'))
const TeamPractices = dynamic(() => import('@/components/team/TeamPractices'))
const TeamCompetitions = dynamic(() => import('@/components/team/TeamCompetitions'))
const TeamSettings = dynamic(() => import('@/components/team/TeamSettings'))
const TeamBulkRegister = dynamic(() => import('@/components/team/TeamBulkRegister'))
const AdminMonthlyAttendance = dynamic(() => import('@/components/team/AdminMonthlyAttendance'))
import type { MemberDetail } from '@/components/team/MemberDetailModal'
import { TeamMembership, TeamWithMembers } from '@swim-hub/shared/types'
import { useTeamAdminStore } from '@/stores/form/teamAdminStore'
import { TeamMembersAPI } from '@apps/shared/api/teams/members'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

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
  const { user, supabase } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)
  const [isCopied, setIsCopied] = useState(false)
  
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

  // 表示用のデータ（ストアから取得、なければ初期データを使用）
  const displayTeam = team || initialTeam
  const displayMembership = membership || initialMembership

  // URLパラメータからタブを取得
  useEffect(() => {
    const tabParam = searchParams.get('tab') || initialTab
    if (tabParam && ['announcements', 'members', 'practices', 'competitions', 'attendance', 'bulk-register', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam as TeamAdminTabType)
    }
  }, [searchParams, initialTab, setActiveTab])

  // 承認待ち数を取得
  useEffect(() => {
    const loadPendingCount = async () => {
      if (displayMembership?.role !== 'admin') return
      
      try {
        const api = new TeamMembersAPI(supabase)
        const count = await api.countPending(teamId)
        setPendingCount(count)
      } catch (err) {
        console.error('承認待ち数の取得に失敗:', err)
      }
    }
    
    if (displayTeam && displayMembership?.role === 'admin') {
      loadPendingCount()
    }
  }, [teamId, displayTeam, displayMembership, supabase])

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
        return <AdminMonthlyAttendance teamId={teamId} />
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
      <div className="bg-white rounded-lg shadow p-3 sm:p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 wrap-break-word">
              {displayTeam.name}
            </h1>
            {displayTeam.description && (
              <p className="text-xs sm:text-sm text-gray-600 wrap-break-word">{displayTeam.description}</p>
            )}
          </div>
          {displayTeam.invite_code && (
            <div className="w-full md:w-auto md:shrink-0">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5 w-full md:w-auto">
                <div className="flex flex-row items-center gap-2">
                  <label className="block text-xs font-medium text-gray-700 whitespace-nowrap">
                    招待コード:
                  </label>
                    <input
                      type="text"
                      value={displayTeam.invite_code}
                      readOnly
                    className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-xs font-mono font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(displayTeam.invite_code)
                        setIsCopied(true)
                        setTimeout(() => setIsCopied(false), 2000)
                      }}
                    className="inline-flex items-center justify-center px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                    title="コピー"
                    >
                      {isCopied ? (
                      <CheckIcon className="h-3 w-3 text-green-600" />
                      ) : (
                      <ClipboardDocumentIcon className="h-3 w-3" />
                      )}
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="mt-4">
        <TeamAdminTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingCount={pendingCount}
        />
      </div>

      {/* タブコンテンツ */}
      <div className="bg-white rounded-lg shadow">
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


