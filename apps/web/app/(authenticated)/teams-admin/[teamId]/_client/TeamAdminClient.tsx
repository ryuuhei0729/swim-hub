'use client'

import React, { useEffect, useState } from 'react'
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
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'
import { TeamMembersAPI } from '@apps/shared/api/teams/members'

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
  const [isCopied, setIsCopied] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  
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
      <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 wrap-break-word">
              {displayTeam.name}
            </h1>
            {displayTeam.description && (
              <p className="text-sm sm:text-base text-gray-600 mb-4 wrap-break-word">{displayTeam.description}</p>
            )}
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                管理者
              </span>
            </div>
          </div>
          {displayTeam.invite_code && (
            <div className="w-full md:w-auto md:shrink-0 md:ml-6">
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4 w-full md:w-[400px]">
                <div className="flex flex-col space-y-2">
                  <label className="block text-xs font-medium text-gray-700">
                    招待コード
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 sm:space-x-0">
                    <input
                      type="text"
                      value={displayTeam.invite_code}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-mono font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(displayTeam.invite_code)
                        setIsCopied(true)
                        setTimeout(() => setIsCopied(false), 2000)
                      }}
                      className="inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 whitespace-nowrap"
                    >
                      {isCopied ? (
                        <>
                          <CheckIcon className="h-4 w-4 sm:mr-2 text-green-600" />
                          <span className="hidden sm:inline">コピー済み</span>
                        </>
                      ) : (
                        <>
                          <ClipboardDocumentIcon className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">コピー</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    このコードを友達に共有すると、友達がこのチームに参加できます
                  </p>
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


