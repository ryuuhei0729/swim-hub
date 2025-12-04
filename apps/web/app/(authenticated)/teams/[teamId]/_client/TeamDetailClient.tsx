'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { 
  TeamAnnouncements,
  TeamTabs,
  TeamMemberManagement,
  TeamPractices,
  TeamCompetitions
} from '@/components/team'
import MyMonthlyAttendance from '@/components/team/MyMonthlyAttendance'
import MemberDetailModal from '@/components/team/MemberDetailModal'
import type { MemberDetail } from '@/components/team/MemberDetailModal'
import type { TeamTabType } from '@/components/team/TeamTabs'
import { TeamMembership, TeamWithMembers } from '@swim-hub/shared/types/database'
import { useTeamDetailStore } from '@/stores'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

interface TeamDetailClientProps {
  teamId: string
  initialTeam: TeamWithMembers | null
  initialMembership: TeamMembership | null
  initialTab?: string
}

/**
 * チーム詳細ページのインタラクティブ部分を担当するClient Component
 */
export default function TeamDetailClient({
  teamId,
  initialTeam,
  initialMembership,
  initialTab
}: TeamDetailClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const [isCopied, setIsCopied] = useState(false)
  
  const {
    team,
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
  } = useTeamDetailStore()

  // サーバー側から取得したデータをストアに設定
  useEffect(() => {
    setTeam(initialTeam)
    setMembership(initialMembership)
    setLoading(false)
  }, [initialTeam, initialMembership, setTeam, setMembership, setLoading])

  // URLパラメータからタブを取得
  useEffect(() => {
    const tabParam = searchParams.get('tab') || initialTab
    if (tabParam && ['announcements', 'members', 'practices', 'competitions', 'attendance'].includes(tabParam)) {
      setActiveTab(tabParam as TeamTabType)
    }
  }, [searchParams, initialTab, setActiveTab])

  // 表示用のデータ（ストアから取得、なければ初期データを使用）
  const displayTeam = team || initialTeam

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

  const handleMemberClick = (member: MemberDetail) => {
    openMemberModal(member)
  }

  const handleCloseMemberModal = () => {
    closeMemberModal()
  }

  // アクティブなタブのコンテンツをレンダリング（閲覧専用）
  const renderTabContent = () => {
    switch (activeTab) {
      case 'announcements':
        return (
          <TeamAnnouncements 
            teamId={teamId}
            isAdmin={false}
            viewOnly={true}
          />
        )
      case 'members':
        return (
          <TeamMemberManagement 
            teamId={teamId}
            currentUserId={user?.id || ''}
            isCurrentUserAdmin={false}
            onMembershipChange={() => {
              // メンバー情報を再読み込み
              router.refresh()
            }}
            onMemberClick={handleMemberClick}
          />
        )
      case 'practices':
        return <TeamPractices teamId={teamId} isAdmin={false} />
      case 'competitions':
        return <TeamCompetitions teamId={teamId} isAdmin={false} />
      case 'attendance':
        return <MyMonthlyAttendance teamId={teamId} />
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 break-words">
              {displayTeam.name}
            </h1>
            {displayTeam.description && (
              <p className="text-sm sm:text-base text-gray-600 mb-4 break-words">{displayTeam.description}</p>
            )}
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                メンバー
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
        <TeamTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={false}
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
        isCurrentUserAdmin={false}
        onMembershipChange={() => {
          // メンバー情報を再読み込み
          router.refresh()
        }}
      />
    </div>
  )
}

