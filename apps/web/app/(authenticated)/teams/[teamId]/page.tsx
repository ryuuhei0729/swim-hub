'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import { 
  TeamAnnouncements,
  TeamStatsCards,
  TeamTabs,
  TeamMembers,
  TeamMemberManagement,
  TeamPractices,
  TeamCompetitions,
  TeamSettings
} from '@/components/team'
import MemberDetailModal from '@/components/team/MemberDetailModal'
import type { TeamTabType } from '@/components/team/TeamTabs'

export default function TeamDetailPage() {
  const params = useParams()
  const teamId = params.teamId as string
  const [team, setTeam] = useState<any>(null)
  const [membership, setMembership] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TeamTabType>('announcements')
  const [teamStats, setTeamStats] = useState({
    memberCount: 0,
    practiceCount: 0,
    recordCount: 0,
    lastActivity: null
  })
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    const loadTeam = async () => {
      if (!user) return
      
      try {
        setLoading(true)
        
        // チーム情報を取得
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .select('*')
          .eq('id', teamId)
          .single()

        if (teamError) throw teamError

        // メンバーシップ情報を取得
        const { data: membershipData, error: membershipError } = await supabase
          .from('team_memberships')
          .select('*')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .single()

        if (membershipError && membershipError.code !== 'PGRST116') {
          throw membershipError
        }

        setTeam(teamData)
        setMembership(membershipData)

        // チーム統計情報を取得
        await loadTeamStats(teamId)
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTeam()
  }, [user, teamId])

  // チーム統計情報を取得
  const loadTeamStats = async (teamId: string) => {
    try {
      // メンバー数取得
      const { count: memberCount } = await supabase
        .from('team_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('is_active', true)

      // チームメンバーのID一覧を取得
      const { data: members } = await supabase
        .from('team_memberships')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('is_active', true)

      const userIds = members?.map((m: any) => m.user_id) || []

      // 練習記録数（チームメンバー全体）
      const { count: practiceCount } = await supabase
        .from('practices')
        .select('*', { count: 'exact', head: true })
        .in('user_id', userIds)

      // 大会記録数（チームメンバー全体）
      const { count: recordCount } = await supabase
        .from('records')
        .select('*', { count: 'exact', head: true })
        .in('user_id', userIds)

      // 最新の活動日を取得（練習記録と大会記録から）
      const [practices, records] = await Promise.all([
        supabase
          .from('practices')
          .select('date')
          .in('user_id', userIds)
          .order('date', { ascending: false })
          .limit(1),
        supabase
          .from('records')
          .select('created_at')
          .in('user_id', userIds)
          .order('created_at', { ascending: false })
          .limit(1)
      ])

      const lastPracticeDate = (practices.data as any)?.[0]?.date
      const lastRecordDate = (records.data as any)?.[0]?.created_at?.split('T')[0]
      
      const lastActivity = lastPracticeDate && lastRecordDate 
        ? new Date(Math.max(new Date(lastPracticeDate).getTime(), new Date(lastRecordDate).getTime())).toISOString().split('T')[0]
        : lastPracticeDate || lastRecordDate

      setTeamStats({
        memberCount: memberCount || 0,
        practiceCount: practiceCount || 0,
        recordCount: recordCount || 0,
        lastActivity
      })
    } catch (error) {
      console.error('チーム統計情報の取得に失敗:', error)
    }
  }

  if (loading) {
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

  if (!team) {
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

  const isAdmin = membership?.role === 'admin'

  const handleMemberClick = (member: any) => {
    setSelectedMember(member)
    setIsMemberModalOpen(true)
  }

  const handleCloseMemberModal = () => {
    setIsMemberModalOpen(false)
    setSelectedMember(null)
  }

  // アクティブなタブのコンテンツをレンダリング
  const renderTabContent = () => {
    switch (activeTab) {
      case 'announcements':
        return (
          <TeamAnnouncements 
            teamId={teamId}
            isAdmin={isAdmin}
            viewOnly={false}
          />
        )
      case 'members':
        return (
          <TeamMemberManagement 
            teamId={teamId}
            currentUserId={user?.id || ''}
            isCurrentUserAdmin={isAdmin}
            onMembershipChange={() => {
              // メンバー情報を再読み込み
              window.location.reload()
            }}
            onMemberClick={handleMemberClick}
          />
        )
      case 'practices':
        return <TeamPractices teamId={teamId} isAdmin={isAdmin} />
      case 'competitions':
        return <TeamCompetitions teamId={teamId} isAdmin={isAdmin} />
      case 'settings':
        return (
          <TeamSettings 
            teamId={teamId}
            teamName={team.name}
            teamDescription={team.description}
            isAdmin={isAdmin}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* チームヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {team.name}
            </h1>
            {team.description && (
              <p className="text-gray-600 mb-4">{team.description}</p>
            )}
            <div className="flex items-center space-x-2">
              {isAdmin && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  管理者
                </span>
              )}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                メンバー
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 統計カード */}
      <TeamStatsCards stats={teamStats} isLoading={loading} />

      {/* タブナビゲーション */}
      <TeamTabs 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isAdmin={isAdmin}
      />

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
        isCurrentUserAdmin={isAdmin}
        onMembershipChange={() => {
          // メンバー情報を再読み込み
          window.location.reload()
        }}
      />
    </div>
  )
}
