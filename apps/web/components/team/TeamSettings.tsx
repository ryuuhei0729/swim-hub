'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { TeamCoreAPI } from '@apps/shared/api/teams/core'
import { TeamMembersAPI } from '@apps/shared/api/teams/members'
import { 
  ExclamationTriangleIcon,
  ArrowRightOnRectangleIcon,
  PencilIcon
} from '@heroicons/react/24/outline'

export interface TeamSettingsProps {
  teamId: string
  teamName: string
  teamDescription?: string
  isAdmin?: boolean
}

export default function TeamSettings({ teamId, teamName, teamDescription, isAdmin = false }: TeamSettingsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(teamName)
  const [description, setDescription] = useState(teamDescription || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showLastMemberWarning, setShowLastMemberWarning] = useState(false)
  
  const { supabase } = useAuth()
  const coreAPI = useMemo(() => new TeamCoreAPI(supabase), [supabase])
  const membersAPI = useMemo(() => new TeamMembersAPI(supabase), [supabase])

  useEffect(() => {
    setName(teamName)
    setDescription(teamDescription || '')
  }, [teamName, teamDescription])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('チーム名は必須です')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      await coreAPI.updateTeam(teamId, {
        name: name.trim(),
        description: description.trim() || null
      })
      
      setIsEditing(false)
    } catch (err) {
      console.error('チーム更新エラー:', err)
      setError('チーム情報の更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setName(teamName)
    setDescription(teamDescription || '')
    setError(null)
    setIsEditing(false)
  }

  const handleLeave = async () => {
    try {
      setLoading(true)
      setError(null)
      
      await membersAPI.leave(teamId)
      window.location.href = '/teams'
    } catch (err) {
      console.error('チーム退出エラー:', err)
      setError('チームからの退出に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          チーム設定
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-600 mb-6">
            チーム設定を変更するには管理者権限が必要です。
          </p>
          
          {/* 退出ボタン */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mt-0.5" />
              <div className="ml-3 flex-1">
                <h4 className="text-sm font-medium text-red-800">チームから退出</h4>
                <p className="mt-1 text-sm text-red-700">
                  このチームから退出します。退出後は再度招待を受ける必要があります。
                </p>
                <button
                  onClick={async () => {
                    try {
                      const { data: adminList, error: adminErr } = await supabase
                        .from('team_memberships')
                        .select('id')
                        .eq('team_id', teamId)
                        .eq('role', 'admin')
                        .eq('is_active', true)
                      if (adminErr) throw adminErr
                      const adminCount = adminList?.length || 0

                      const { data: totalList, error: totalErr } = await supabase
                        .from('team_memberships')
                        .select('id')
                        .eq('team_id', teamId)
                        .eq('is_active', true)
                      if (totalErr) throw totalErr
                      const totalMemberCount = totalList?.length || 0

                      const { data: { user } } = await supabase.auth.getUser()
                      if (!user) throw new Error('認証が必要です')
                      const { data: myMembership } = await supabase
                        .from('team_memberships')
                        .select('role')
                        .eq('team_id', teamId)
                        .eq('user_id', user.id)
                        .eq('is_active', true)
                        .maybeSingle()
                      const isCurrentUserAdmin = myMembership?.role === 'admin'
                      
                      // 管理者が最後の1人で、かつ他にメンバーがいる場合は退出不可
                      if (isCurrentUserAdmin && adminCount === 1 && totalMemberCount > 1) {
                        setError('チームには最低1人の管理者が必要です。他のメンバーを管理者に任命してから退出してください。')
                        return
                      }
                      
                      // 自分が最後のメンバーの場合は警告を表示
                      if (totalMemberCount === 1) {
                        setShowLastMemberWarning(true)
                        return
                      }
                      
                      setShowLeaveModal(true)
                    } catch (err) {
                      console.error('管理者チェックエラー:', err)
                      setError('管理者情報の取得に失敗しました')
                    }
                  }}
                  disabled={loading}
                  className="mt-3 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                  チームから退出
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 退出確認モーダル */}
        {showLeaveModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div 
                className="fixed inset-0 bg-black/40 transition-opacity" 
                onClick={() => setShowLeaveModal(false)}
              />
              
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        チームから退出
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          本当にチーム「{teamName}」から退出しますか？退出後は再度招待を受ける必要があります。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    onClick={handleLeave}
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '退出中...' : '退出'}
                  </button>
                  <button
                    onClick={() => setShowLeaveModal(false)}
                    disabled={loading}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 最後のメンバー退出警告モーダル */}
        {showLastMemberWarning && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div 
                className="fixed inset-0 bg-black/40 transition-opacity" 
                onClick={() => setShowLastMemberWarning(false)}
              />
              
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="h-6 w-6 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        チーム閉鎖の警告
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-600">
                          あなたがこのチームの最後のメンバーです。退出すると、このチームはメンバーが0人になります。
                        </p>
                        <p className="text-sm text-gray-700 font-semibold mt-3">
                          このチームは閉鎖されますが、データは保持されます。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    onClick={() => {
                      setShowLastMemberWarning(false)
                      setShowLeaveModal(true)
                    }}
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    退出を続ける
                  </button>
                  <button
                    onClick={() => setShowLastMemberWarning(false)}
                    disabled={loading}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        チーム設定
      </h2>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* チーム情報編集 */}
      <div className="space-y-6">
        <div>
          <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
            チーム名 <span className="text-red-500">*</span>
          </label>
          {isEditing ? (
            <input
              type="text"
              id="teamName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
          ) : (
            <p className="text-lg font-medium text-gray-900">{name}</p>
          )}
        </div>

        <div>
          <label htmlFor="teamDescription" className="block text-sm font-medium text-gray-700 mb-2">
            説明
          </label>
          {isEditing ? (
            <textarea
              id="teamDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
          ) : (
            <p className="text-gray-900">{description || '説明がありません'}</p>
          )}
        </div>

        {/* 編集ボタン */}
        <div className="flex space-x-3">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '保存中...' : '保存'}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PencilIcon className="h-4 w-4 mr-2" />
              編集
            </button>
          )}
        </div>
      </div>

      {/* チーム退出 */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-medium text-red-600 mb-4">チーム退出</h3>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mt-0.5" />
            <div className="ml-3 flex-1">
              <h4 className="text-sm font-medium text-red-800">チームから退出</h4>
              <p className="mt-1 text-sm text-red-700">
                このチームから退出します。退出後は再度招待を受ける必要があります。管理者の場合、他の管理者に権限が移行されます。
              </p>
              <button
                onClick={async () => {
                  try {
                    const { data: adminList, error: adminErr } = await supabase
                      .from('team_memberships')
                      .select('id')
                      .eq('team_id', teamId)
                      .eq('role', 'admin')
                      .eq('is_active', true)
                    if (adminErr) throw adminErr
                    const adminCount = adminList?.length || 0

                    const { data: totalList, error: totalErr } = await supabase
                      .from('team_memberships')
                      .select('id')
                      .eq('team_id', teamId)
                      .eq('is_active', true)
                    if (totalErr) throw totalErr
                    const totalMemberCount = totalList?.length || 0

                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user) throw new Error('認証が必要です')
                    const { data: myMembership } = await supabase
                      .from('team_memberships')
                      .select('role')
                      .eq('team_id', teamId)
                      .eq('user_id', user.id)
                      .eq('is_active', true)
                      .maybeSingle()
                    const isCurrentUserAdmin = myMembership?.role === 'admin'

                    // 管理者が最後の1人で、かつ他にメンバーがいる場合は退出不可
                    if (isCurrentUserAdmin && adminCount === 1 && totalMemberCount > 1) {
                      setError('チームには最低1人の管理者が必要です。他のメンバーを管理者に任命してから退出してください。')
                      return
                    }

                    // 自分が最後のメンバーの場合は警告を表示
                    if (totalMemberCount === 1) {
                      setShowLastMemberWarning(true)
                      return
                    }

                    setShowLeaveModal(true)
                  } catch (err) {
                    console.error('管理者チェックエラー:', err)
                    setError('管理者情報の取得に失敗しました')
                  }
                }}
                disabled={loading}
                className="mt-3 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                チームから退出
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 退出確認モーダル */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-black/40 transition-opacity" 
              onClick={() => setShowLeaveModal(false)}
            />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      チームから退出
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        本当にチーム「{name}」から退出しますか？退出後は再度招待を受ける必要があります。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleLeave}
                  disabled={loading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '退出中...' : '退出'}
                </button>
                <button
                  onClick={() => setShowLeaveModal(false)}
                  disabled={loading}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 最後のメンバー退出警告モーダル */}
      {showLastMemberWarning && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-black/40 transition-opacity" 
              onClick={() => setShowLastMemberWarning(false)}
            />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-6 w-6 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      チーム閉鎖の警告
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-600">
                        あなたがこのチームの最後のメンバーです。退出すると、このチームはメンバーが0人になります。
                      </p>
                      <p className="text-sm text-gray-700 font-semibold mt-3">
                        このチームは閉鎖されますが、データは保持されます。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => {
                    setShowLastMemberWarning(false)
                    setShowLeaveModal(true)
                  }}
                  disabled={loading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  退出を続ける
                </button>
                <button
                  onClick={() => setShowLastMemberWarning(false)}
                  disabled={loading}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}