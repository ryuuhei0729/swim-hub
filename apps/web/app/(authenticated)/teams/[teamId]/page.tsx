'use client'

import React, { useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { 
  TeamAnnouncements,
  TeamEntrySection,
  TeamTabs,
  TeamMembers,
  TeamMemberManagement,
  TeamPractices,
  TeamCompetitions,
  TeamSettings,
  TeamAttendanceList
} from '@/components/team'
import MemberDetailModal from '@/components/team/MemberDetailModal'
import type { TeamTabType } from '@/components/team/TeamTabs'
import { TeamEvent, AttendanceStatusType, Team, TeamMembership } from '@swim-hub/shared/types/database'
import { useAttendanceTabStore, useTeamDetailStore } from '@/stores'

// 出欠タブコンポーネント
function AttendanceTab({ teamId, isAdmin }: { teamId: string, isAdmin: boolean }) {
  const { supabase } = useAuth()
  const {
    selectedEventId,
    selectedEventType,
    events,
    loading,
    setSelectedEvent,
    setEvents,
    setLoading
  } = useAttendanceTabStore()

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      
      // 管理者は全てのステータス、ユーザーはopenのみ
      const practicesQuery = supabase
        .from('practices')
        .select('*')
        .eq('team_id', teamId)
      
      const competitionsQuery = supabase
        .from('competitions')
        .select('*')
        .eq('team_id', teamId)

      // ユーザーの場合はopenのみフィルタ
      if (!isAdmin) {
        practicesQuery.eq('attendance_status', 'open')
        competitionsQuery.eq('attendance_status', 'open')
      }

      const [practicesResult, competitionsResult] = await Promise.all([
        practicesQuery,
        competitionsQuery
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      // 練習と大会を統合し、日付順にソート
      const practices: TeamEvent[] = (practicesResult.data || []).map((p) => Object.assign(p, { type: 'practice' as const }))
      const competitions: TeamEvent[] = (competitionsResult.data || []).map((c) => Object.assign(c, { type: 'competition' as const }))
      const allEvents: TeamEvent[] = [...practices, ...competitions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      setEvents(allEvents)
    } catch (error) {
      console.error('イベント取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [teamId, isAdmin, supabase])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const handleAttendanceStatusChange = async (
    eventId: string, 
    eventType: 'practice' | 'competition',
    newStatus: AttendanceStatusType
  ) => {
    try {
      const res = await fetch('/api/attendance/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: eventType === 'practice' ? 'practices' : 'competitions', id: eventId, status: newStatus })
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error)
      }
      await loadEvents()
    } catch (error) {
      console.error('ステータス更新エラー:', error)
      alert('ステータスの更新に失敗しました')
    }
  }
  
  return (
    <div className="p-6 space-y-4">
      {selectedEventId && selectedEventType ? (
        <div>
          <button
            onClick={() => {
              setSelectedEvent(null, null)
            }}
            className="mb-4 text-blue-600 hover:text-blue-800 flex items-center"
          >
            ← 一覧に戻る
          </button>
          <TeamAttendanceList 
            practiceId={selectedEventType === 'practice' ? selectedEventId : undefined}
            competitionId={selectedEventType === 'competition' ? selectedEventId : undefined}
            isAdmin={isAdmin} 
          />
        </div>
      ) : (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-gray-500">読み込み中...</p>
            </div>
          ) : events.length > 0 ? (
            <div className="grid gap-4">
              {events.map((event) => {
                const getStatusBadge = (status: AttendanceStatusType | null | undefined) => {
                  switch (status) {
                    case 'before':
                      return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">提出前</span>
                    case 'open':
                      return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">提出受付中</span>
                    case 'closed':
                      return <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800">提出締切</span>
                    default:
                      return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">未設定</span>
                  }
                }

                return (
                  <div
                    key={`${event.type}-${event.id}`}
                    className={`border rounded-lg p-4 transition-colors ${
                      event.type === 'competition'
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          setSelectedEvent(event.id, event.type)
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            event.type === 'competition'
                              ? 'bg-purple-200 text-purple-800'
                              : 'bg-green-200 text-green-800'
                          }`}>
                            {event.type === 'competition' ? '大会' : '練習'}
                          </span>
                          {getStatusBadge(event.attendance_status)}
                          <h3 className="font-medium text-gray-900">
                            {event.type === 'competition' ? event.title : '練習'}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-700 font-medium">
                          {new Date(event.date).toLocaleDateString('ja-JP', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric',
                            weekday: 'short'
                          })}
                        </p>
                        {event.place && (
                          <p className="text-sm text-gray-600 mt-1">{event.place}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <select
                            value={event.attendance_status || 'before'}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleAttendanceStatusChange(
                                event.id, 
                                event.type, 
                                e.target.value as AttendanceStatusType
                              )
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:bg-gray-50"
                          >
                            <option value="before">提出前</option>
                            <option value="open">提出受付中</option>
                            <option value="closed">提出締切</option>
                          </select>
                        )}
                        <button
                          onClick={() => {
                            setSelectedEvent(event.id, event.type)
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
                        >
                          出欠を確認 →
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-600">出欠受付中のイベントがありません</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TeamDetailPage() {
  const params = useParams()
  const teamId = params.teamId as string
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, supabase } = useAuth()
  
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
  } = useTeamDetailStore()

  // URLパラメータからタブを取得
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['announcements', 'members', 'practices', 'competitions', 'attendance', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam as TeamTabType)
    }
  }, [searchParams, setActiveTab])

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
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTeam()
  }, [user, teamId, setLoading, setTeam, setMembership])

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

  const handleMemberClick = (member: import('@/components/team/MemberDetailModal').MemberDetail) => {
    openMemberModal(member)
  }

  const handleCloseMemberModal = () => {
    closeMemberModal()
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
              router.refresh()
            }}
            onMemberClick={handleMemberClick}
          />
        )
      case 'practices':
        return <TeamPractices teamId={teamId} isAdmin={isAdmin} />
      case 'competitions':
        return <TeamCompetitions teamId={teamId} isAdmin={isAdmin} />
      case 'attendance':
        return <AttendanceTab teamId={teamId} isAdmin={isAdmin} />
      case 'settings':
        return (
          <TeamSettings 
            teamId={teamId}
            teamName={team.name}
            teamDescription={team.description || undefined}
            isAdmin={isAdmin}
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

      {/* エントリーフォームセクション */}
      <div className="mb-0">
        <TeamEntrySection teamId={teamId} isAdmin={isAdmin} />
      </div>

      {/* タブナビゲーション */}
      <div className="mt-4">
        <TeamTabs 
          activeTab={activeTab as TeamTabType}
          onTabChange={setActiveTab}
          isAdmin={isAdmin}
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
        isCurrentUserAdmin={isAdmin}
        onMembershipChange={() => {
          // メンバー情報を再読み込み
          router.refresh()
        }}
      />
    </div>
  )
}
