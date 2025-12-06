'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { TeamCoreAPI } from '@apps/shared/api/teams/core'
import { 
  ExclamationTriangleIcon,
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
  
  const { supabase } = useAuth()
  const coreAPI = useMemo(() => new TeamCoreAPI(supabase), [supabase])

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

  // メンバー向けの表示（チーム名・説明の編集以外）
  if (!isAdmin) {
    return (
      <>
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

          {/* チーム情報（読み取り専用） */}
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                チーム名
              </label>
              <p className="text-lg font-medium text-gray-900">{name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                説明
              </label>
              <p className="text-gray-900">{description || '説明がありません'}</p>
            </div>
          </div>

        </div>
      </>
    )
  }

  return (
    <>
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
      </div>
    </>
  )
}