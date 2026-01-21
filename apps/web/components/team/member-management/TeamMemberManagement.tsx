'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { useMemberBestTimes } from '../shared/hooks/useMemberBestTimes'
import { useMembers, usePendingMembers, useMembershipActions, useMemberSort } from './hooks'
import { PendingMembersSection, MemberStatsHeader, MembersTimeTable } from './components'
import type { TeamMember } from './hooks/useMembers'

export interface TeamMemberManagementProps {
  teamId: string
  currentUserId: string
  isCurrentUserAdmin: boolean
  onMembershipChange?: () => void
  onMemberClick: (member: TeamMember) => void
}

/**
 * チームメンバー管理コンポーネント
 *
 * メンバー一覧、ベストタイム表示、承認待ちメンバーの管理を行う
 * リファクタリング済み: カスタムフックとサブコンポーネントに分離
 */
export default function TeamMemberManagement({
  teamId,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange,
  onMemberClick
}: TeamMemberManagementProps) {
  const { supabase } = useAuth()

  // メンバーデータ管理
  const { members, loading, error, loadMembers } = useMembers(teamId, supabase)

  // 承認待ちメンバー管理
  const {
    pendingMembers,
    loading: loadingPending,
    loadPendingMembers
  } = usePendingMembers(teamId, isCurrentUserAdmin, supabase)

  // 承認/却下アクション
  const { handleApprove, handleReject } = useMembershipActions(teamId, onMembershipChange)

  // ベストタイム管理
  const {
    memberBestTimes,
    loading: loadingBestTimes,
    loadAllBestTimes,
    getBestTimeForMember: getBestTimeBase
  } = useMemberBestTimes(supabase)

  // UI状態
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false)

  // ソート機能
  const getBestTimeForMemberWithRelaying = useCallback((memberId: string, style: string, distance: number) => {
    return getBestTimeBase(memberId, style, distance, includeRelaying)
  }, [getBestTimeBase, includeRelaying])

  const {
    sortStyle,
    sortDistance,
    sortOrder,
    sortedMembers,
    handleSort
  } = useMemberSort(members, getBestTimeForMemberWithRelaying)

  // 初期データ読み込み
  useEffect(() => {
    loadMembers()
    if (isCurrentUserAdmin) {
      loadPendingMembers()
    }
  }, [teamId, isCurrentUserAdmin, loadMembers, loadPendingMembers])

  // メンバーが読み込まれたらベストタイムを取得
  useEffect(() => {
    if (members.length > 0) {
      loadAllBestTimes(members)
    }
  }, [members, loadAllBestTimes])

  // 承認処理（再読み込み含む）
  const handleApproveWithRefresh = useCallback(async (membershipId: string) => {
    const success = await handleApprove(membershipId)
    if (success) {
      await loadMembers()
      await loadPendingMembers()
    }
    return success
  }, [handleApprove, loadMembers, loadPendingMembers])

  // 却下処理（再読み込み含む）
  const handleRejectWithRefresh = useCallback(async (membershipId: string) => {
    const success = await handleReject(membershipId)
    if (success) {
      await loadPendingMembers()
    }
    return success
  }, [handleReject, loadPendingMembers])

  // ローディング表示
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="team-member-management">
      {/* ヘッダー：統計とリレートグル */}
      <MemberStatsHeader
        totalMembers={members.length}
        adminCount={members.filter(m => m.role === 'admin').length}
        userCount={members.filter(m => m.role === 'user').length}
        includeRelaying={includeRelaying}
        onToggleRelaying={setIncludeRelaying}
      />

      {/* 承認待ちセクション（管理者のみ） */}
      {isCurrentUserAdmin && (
        <PendingMembersSection
          pendingMembers={pendingMembers}
          isLoading={loadingPending}
          onApprove={handleApproveWithRefresh}
          onReject={handleRejectWithRefresh}
        />
      )}

      {/* エラー表示 */}
      {error && (
        <div className="mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">エラー</h3>
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ベストタイム表 */}
      <MembersTimeTable
        members={sortedMembers}
        currentUserId={currentUserId}
        memberBestTimes={memberBestTimes}
        includeRelaying={includeRelaying}
        sortStyle={sortStyle}
        sortDistance={sortDistance}
        sortOrder={sortOrder}
        isLoading={loadingBestTimes}
        onSort={handleSort}
        onMemberClick={onMemberClick}
        getBestTimeForMember={getBestTimeForMemberWithRelaying}
      />
    </div>
  )
}
