'use client'

import { useState, use } from 'react'
import { useQuery } from '@apollo/client/react'
import { useRouter } from 'next/navigation'
import { GET_TEAM, GET_MY_TEAMS } from '@/graphql'
import { TeamMembers } from '@/components/team/TeamMembers'
import { TeamSettings } from '@/components/team/TeamSettings'
import { TeamAnnouncements } from '@/components/team/TeamAnnouncements'

interface TeamDetailPageProps {
  params: Promise<{
    teamId: string
  }>
}

export default function TeamDetailPage({ params }: TeamDetailPageProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'announcements' | 'members' | 'settings'>('announcements')
  
  // Next.js 15の新しい仕様でparamsをunwrap
  const { teamId } = use(params)

  // チーム詳細情報を取得
  const { data: teamData, loading: teamLoading, error: teamError } = useQuery(GET_TEAM, {
    variables: { id: teamId },
    fetchPolicy: 'cache-and-network'
  })

  // ユーザーのチーム一覧を取得（権限確認用）
  const { data: myTeamsData } = useQuery(GET_MY_TEAMS, {
    fetchPolicy: 'cache-and-network'
  })

  const team = (teamData as any)?.team
  const myTeams = (myTeamsData as any)?.myTeams || []
  
  // 現在のユーザーのチーム内での権限を確認
  const userMembership = myTeams.find((membership: any) => membership.teamId === teamId)
  const isAdmin = userMembership?.role === 'ADMIN'
  const isMember = !!userMembership?.isActive

  if (teamLoading) {
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

  if (teamError || !team) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              チームが見つかりません
            </h1>
            <p className="text-gray-600 mb-4">
              このチームは存在しないか、アクセス権限がありません。
            </p>
            <button
              onClick={() => router.push('/teams')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              チーム一覧に戻る
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isMember) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              アクセス権限がありません
            </h1>
            <p className="text-gray-600 mb-4">
              このチームのメンバーではありません。
            </p>
            <button
              onClick={() => router.push('/teams')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              チーム一覧に戻る
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'announcements', name: 'お知らせ', icon: '📢' },
    { id: 'members', name: 'メンバー', icon: '👥' },
    ...(isAdmin ? [{ id: 'settings', name: '設定', icon: '⚙️' }] : [])
  ] as const

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {team.name}
            </h1>
            {team.description && (
              <p className="text-gray-600 mb-2">{team.description}</p>
            )}
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded ${
                isAdmin
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {isAdmin ? '管理者' : 'メンバー'}
              </span>
              <span className="text-xs text-gray-500">
                作成日: {new Date(team.createdAt).toLocaleDateString('ja-JP')}
              </span>
            </div>
          </div>
          <button
            onClick={() => router.push('/teams')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← チーム一覧に戻る
          </button>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'announcements' | 'members' | 'settings')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* タブコンテンツ */}
        <div className="p-6">
          {activeTab === 'announcements' && (
            <TeamAnnouncements 
              teamId={teamId}
              isAdmin={isAdmin}
            />
          )}
          
          {activeTab === 'members' && (
            <TeamMembers 
              teamId={teamId}
              isAdmin={isAdmin}
            />
          )}
          
          {activeTab === 'settings' && isAdmin && (
            <TeamSettings
              teamId={teamId}
              teamName={team.name}
              teamDescription={team.description}
              isAdmin={isAdmin}
              onTeamUpdated={() => {
                // チーム情報が更新された場合の処理
                window.location.reload()
              }}
              onTeamDeleted={() => {
                // チームが削除された場合の処理
                router.push('/teams')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
