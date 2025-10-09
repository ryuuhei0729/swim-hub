'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@apollo/client/react'
import { useAuth } from '@/contexts'
import { GET_MY_TEAMS, CREATE_TEAM, JOIN_TEAM } from '@/graphql'

export default function TeamsPage() {
  const { user } = useAuth()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ユーザーのチーム一覧を取得
  const { data: teamsData, loading: teamsLoading, refetch } = useQuery(GET_MY_TEAMS, {
    skip: !user,
    fetchPolicy: 'cache-and-network'
  })

  // チーム作成ミューテーション
  const [createTeam] = useMutation(CREATE_TEAM, {
    onCompleted: (data) => {
      refetch()
      setShowCreateForm(false)
      setTeamName('')
      setTeamDescription('')
      alert('チームを作成しました！')
      
      // 作成されたチームの詳細ページにリダイレクト
      if ((data as any)?.createTeam?.id) {
        window.location.href = `/teams/${(data as any).createTeam.id}`
      }
    },
    onError: (error) => {
      console.error('チーム作成エラー:', error)
      alert('チーム作成に失敗しました')
    },
    refetchQueries: ['GetMyTeams']
  })

  // チーム参加ミューテーション
  const [joinTeam] = useMutation(JOIN_TEAM, {
    onCompleted: () => {
      refetch()
      setShowJoinForm(false)
      setInviteCode('')
      alert('チームに参加しました！')
    },
    onError: (error) => {
      console.error('チーム参加エラー:', error)
      alert('チーム参加に失敗しました')
    }
  })

  const teams = (teamsData as any)?.myTeams || []

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teamName.trim()) {
      alert('チーム名を入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      await createTeam({
        variables: {
          input: {
            name: teamName.trim(),
            description: teamDescription.trim() || null
          }
        }
      })
    } catch (error) {
      console.error('チーム作成エラー:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) {
      alert('招待コードを入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      await joinTeam({
        variables: {
          input: {
            inviteCode: inviteCode.trim()
          }
        }
      })
    } catch (error) {
      console.error('チーム参加エラー:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (teamsLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              チーム管理
            </h1>
            <p className="text-gray-600">
              チームの作成・参加・管理を行います。
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              チーム作成
            </button>
            <button
              onClick={() => setShowJoinForm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              チーム参加
            </button>
          </div>
        </div>
      </div>

      {/* チーム一覧 */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              参加しているチームがありません
            </p>
            <p className="text-sm text-gray-400">
              チームを作成するか、招待コードで参加してください
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            参加中のチーム
          </h2>
          <div className="space-y-4">
            {teams.map((teamMembership: any) => (
              <div
                key={teamMembership.teamId}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {teamMembership.team.name}
                    </h3>
                    {teamMembership.team.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {teamMembership.team.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        teamMembership.role === 'ADMIN'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {teamMembership.role === 'ADMIN' ? '管理者' : 'メンバー'}
                      </span>
                      <span className="text-xs text-gray-500">
                        参加日: {new Date(teamMembership.team.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    {teamMembership.role === 'ADMIN' && (
                      <p className="text-xs text-gray-500 mt-2">
                        招待コード: <span className="font-mono">{teamMembership.team.inviteCode}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="space-y-2">
                      <a
                        href={`/teams/${teamMembership.teamId}`}
                        className="block text-blue-600 hover:text-blue-800 text-sm"
                      >
                        チーム詳細を見る →
                      </a>
                      <a
                        href={`/announcements`}
                        className="block text-green-600 hover:text-green-800 text-sm"
                      >
                        お知らせを見る →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* チーム作成フォーム */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold mb-4">新しいチームを作成</h2>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  チーム名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="チーム名を入力"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="チームの説明（任意）"
                  maxLength={200}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !teamName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? '作成中...' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* チーム参加フォーム */}
      {showJoinForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold mb-4">チームに参加</h2>
            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  招待コード <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                  placeholder="招待コードを入力"
                />
                <p className="text-xs text-gray-500 mt-1">
                  チーム管理者から受け取った招待コードを入力してください
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinForm(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !inviteCode.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {isSubmitting ? '参加中...' : '参加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
