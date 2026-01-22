'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { UsersIcon, PlusIcon, UserPlusIcon, ClockIcon } from '@heroicons/react/24/outline'
import { TeamMembershipWithUser } from '@apps/shared/types'
import { useAuth } from '@/contexts'
import { useTeamsQuery } from '@apps/shared/hooks/queries/teams'
import { teamKeys } from '@apps/shared/hooks/queries/keys'
import { useQueryClient } from '@tanstack/react-query'
import TeamCreateModal from '@/components/team/TeamCreateModal'
import TeamJoinModal from '@/components/team/TeamJoinModal'

interface PendingTeamWithInviteCode {
  membership: TeamMembershipWithUser
  inviteCode: string | null
}

interface TeamsClientProps {
  // サーバー側で取得したデータ
  initialTeams: TeamMembershipWithUser[]
}

/**
 * チームページのインタラクティブ部分を担当するClient Component
 */
export default function TeamsClient({
  initialTeams
}: TeamsClientProps) {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)

  // チーム一覧を取得（リアルタイム更新用）
  const {
    teams = [],
    isLoading: teamsLoading
  } = useTeamsQuery(supabase, {
    initialTeams,
  })

  // 表示用のデータ（React Queryのキャッシュを使用）
  // 承認済みと承認待ちを分ける
  const { approvedTeams, pendingTeams } = useMemo(() => {
    const approved: TeamMembershipWithUser[] = []
    const pending: TeamMembershipWithUser[] = []
    
    teams.forEach((membership) => {
      if (membership.status === 'approved' && membership.is_active) {
        approved.push(membership)
      } else if (membership.status === 'pending') {
        pending.push(membership)
      }
    })
    
    return {
      approvedTeams: approved,
      pendingTeams: pending
    }
  }, [teams])
  
  const displayTeams = approvedTeams

  // 承認待ちチームの招待コードを取得
  const [pendingTeamsWithInviteCode, setPendingTeamsWithInviteCode] = useState<PendingTeamWithInviteCode[]>([])
  const [loadingInviteCodes, setLoadingInviteCodes] = useState(false)

  useEffect(() => {
    const loadInviteCodes = async () => {
      if (pendingTeams.length === 0) {
        setPendingTeamsWithInviteCode([])
        return
      }

      setLoadingInviteCodes(true)
      try {
        const results = await Promise.all(
          pendingTeams.map(async (membership) => {
            try {
              const { data, error } = await supabase
                .rpc('get_invite_code_by_team_id', { p_team_id: membership.team_id })
              
              if (error) {
                return { membership, inviteCode: null }
              }
              
              return { membership, inviteCode: data || null }
            } catch {
              return { membership, inviteCode: null }
            }
          })
        )
        setPendingTeamsWithInviteCode(results)
      } catch {
        // エラー時は空配列を設定
        setPendingTeamsWithInviteCode([])
      } finally {
        setLoadingInviteCodes(false)
      }
    }

    loadInviteCodes()
  }, [pendingTeams, supabase])

  if (teamsLoading && displayTeams.length === 0) {
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            マイチーム
          </h1>
          <p className="text-gray-600">
            参加しているチームの一覧
          </p>
        </div>
      </div>

      {/* 承認待ちチームセクション */}
      {pendingTeams.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            承認待ち ({pendingTeams.length}件)
          </h2>
          <div className="space-y-4">
            {loadingInviteCodes ? (
              <div className="text-sm text-gray-500">読み込み中...</div>
            ) : (
              pendingTeamsWithInviteCode.map(({ membership, inviteCode }) => (
                <div
                  key={membership.team_id}
                  className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
                >
                  <div className="flex items-center space-x-3">
                    <ClockIcon className="h-5 w-5 text-yellow-600" />
                    <div className="flex-1">
                      <p className="text-sm text-yellow-800">
                        {inviteCode ? (
                          <>
                            <span className="font-medium">招待コード: {inviteCode}</span>
                            <span className="ml-2">ただいま承認待ちです</span>
                          </>
                        ) : (
                          <span>ただいま承認待ちです</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 参加中のチーム一覧 */}
      {displayTeams.length === 0 && pendingTeams.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            参加中のチームがありません
          </h3>
          <p className="mt-2 text-sm text-gray-500 mb-8">
            チームを作成するか、招待コードでチームに参加してください
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              チームを作成
            </button>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <UserPlusIcon className="h-5 w-5 mr-2" />
              チームに参加
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayTeams.map((membership) => (
            <Link
              key={membership.team_id}
              href={`/teams/${membership.team_id}`}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <UsersIcon className="h-10 w-10 text-blue-600" />
                  {membership.role === 'admin' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      管理者
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {'teams' in membership ? membership.teams?.name : ''}
                </h3>
                {'teams' in membership && membership.teams?.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {membership.teams.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* チーム作成モーダル */}
      <TeamCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(_teamId) => {
          // チーム一覧のキャッシュを無効化して再取得
          queryClient.invalidateQueries({ queryKey: teamKeys.list() })
          setIsCreateModalOpen(false)
        }}
      />

      {/* チーム参加モーダル */}
      <TeamJoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={(_teamId) => {
          // チーム一覧のキャッシュを無効化して再取得
          queryClient.invalidateQueries({ queryKey: teamKeys.list() })
          setIsJoinModalOpen(false)
        }}
      />
    </div>
  )
}

