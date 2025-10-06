'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import { GET_TEAM_MEMBERS, UPDATE_TEAM_MEMBERSHIP, REMOVE_TEAM_MEMBER } from '@/graphql'
import type { TeamMembership } from '@/types'

interface TeamMembersProps {
  teamId: string
  isAdmin: boolean
}

export const TeamMembers: React.FC<TeamMembersProps> = ({
  teamId,
  isAdmin
}) => {
  const { data, loading, error, refetch } = useQuery(GET_TEAM_MEMBERS, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network'
  })

  const [updateMembership, { loading: updateLoading }] = useMutation(UPDATE_TEAM_MEMBERSHIP, {
    onCompleted: () => {
      refetch()
      alert('メンバーの情報を更新しました')
    },
    onError: (error) => {
      console.error('メンバー更新エラー:', error)
      alert('メンバーの更新に失敗しました')
    }
  })

  const [removeMember, { loading: removeLoading }] = useMutation(REMOVE_TEAM_MEMBER, {
    onCompleted: () => {
      refetch()
      alert('メンバーを削除しました')
    },
    onError: (error) => {
      console.error('メンバー削除エラー:', error)
      alert('メンバーの削除に失敗しました')
    }
  })

  const [editingMember, setEditingMember] = useState<TeamMembership | null>(null)

  const members = (data as any)?.teamMembers || []

  const handleRoleChange = async (membershipId: string, newRole: 'ADMIN' | 'USER') => {
    try {
      await updateMembership({
        variables: {
          id: membershipId,
          input: { role: newRole }
        }
      })
    } catch (error) {
      console.error('役割変更エラー:', error)
    }
  }

  const handleStatusChange = async (membershipId: string, isActive: boolean) => {
    try {
      await updateMembership({
        variables: {
          id: membershipId,
          input: { isActive }
        }
      })
    } catch (error) {
      console.error('ステータス変更エラー:', error)
    }
  }

  const handleRemoveMember = async (membershipId: string) => {
    if (!confirm('このメンバーをチームから削除しますか？')) return
    
    try {
      await removeMember({
        variables: { membershipId }
      })
    } catch (error) {
      console.error('メンバー削除エラー:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">チームメンバー</h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">チームメンバー</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">メンバー情報の読み込みに失敗しました</p>
          <button 
            onClick={() => refetch()}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">
          チームメンバー ({members.length}名)
        </h2>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>メンバーがいません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member: any) => (
            <div
              key={member.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {/* アバター */}
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    {member.user.profileImagePath ? (
                      <img
                        src={member.user.profileImagePath}
                        alt={member.user.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-600 font-medium">
                        {member.user.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>

                  {/* ユーザー情報 */}
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {member.user.name || '名前未設定'}
                    </h3>
                    {member.user.bio && (
                      <p className="text-sm text-gray-500">
                        {member.user.bio}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded ${
                        member.role === 'ADMIN'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {member.role === 'ADMIN' ? '管理者' : 'メンバー'}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        member.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.isActive ? 'アクティブ' : '非アクティブ'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* アクションボタン（管理者のみ） */}
                {isAdmin && (
                  <div className="flex items-center space-x-2">
                    {/* 役割変更 */}
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as 'ADMIN' | 'USER')}
                      disabled={updateLoading}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="USER">メンバー</option>
                      <option value="ADMIN">管理者</option>
                    </select>

                    {/* ステータス変更 */}
                    <button
                      onClick={() => handleStatusChange(member.id, !member.isActive)}
                      disabled={updateLoading}
                      className={`text-xs px-3 py-1 rounded ${
                        member.isActive
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      } disabled:opacity-50`}
                    >
                      {member.isActive ? '非アクティブ化' : 'アクティブ化'}
                    </button>

                    {/* 削除ボタン */}
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={removeLoading || member.role === 'ADMIN'}
                      className="text-xs px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={member.role === 'ADMIN' ? '管理者は削除できません' : 'メンバーを削除'}
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>

              {/* 参加日情報 */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  参加日: {formatDate(member.joinedAt)}
                  {member.leftAt && (
                    <span className="ml-2">
                      | 退会日: {formatDate(member.leftAt)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
