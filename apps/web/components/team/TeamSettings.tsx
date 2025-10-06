'use client'

import { useState } from 'react'
import { useMutation } from '@apollo/client/react'
import { UPDATE_TEAM, DELETE_TEAM } from '@/graphql'

interface TeamSettingsProps {
  teamId: string
  teamName: string
  teamDescription?: string
  isAdmin: boolean
  onTeamUpdated?: () => void
  onTeamDeleted?: () => void
}

export const TeamSettings: React.FC<TeamSettingsProps> = ({
  teamId,
  teamName,
  teamDescription,
  isAdmin,
  onTeamUpdated,
  onTeamDeleted
}) => {
  const [showEditForm, setShowEditForm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editName, setEditName] = useState(teamName)
  const [editDescription, setEditDescription] = useState(teamDescription || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [updateTeam, { loading: updateLoading }] = useMutation(UPDATE_TEAM, {
    onCompleted: () => {
      setShowEditForm(false)
      setIsSubmitting(false)
      onTeamUpdated?.()
      alert('チーム情報を更新しました')
    },
    onError: (error) => {
      console.error('チーム更新エラー:', error)
      setIsSubmitting(false)
      alert('チーム情報の更新に失敗しました')
    }
  })

  const [deleteTeam, { loading: deleteLoading }] = useMutation(DELETE_TEAM, {
    onCompleted: () => {
      onTeamDeleted?.()
      alert('チームを削除しました')
    },
    onError: (error) => {
      console.error('チーム削除エラー:', error)
      alert('チームの削除に失敗しました')
    }
  })

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!editName.trim()) {
      alert('チーム名を入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      await updateTeam({
        variables: {
          id: teamId,
          input: {
            name: editName.trim(),
            description: editDescription.trim() || null
          }
        }
      })
    } catch (error) {
      console.error('チーム更新エラー:', error)
      setIsSubmitting(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!confirm('このチームを削除しますか？この操作は取り消せません。')) return
    
    try {
      await deleteTeam({
        variables: { id: teamId }
      })
    } catch (error) {
      console.error('チーム削除エラー:', error)
    }
  }

  const handleCancelEdit = () => {
    setEditName(teamName)
    setEditDescription(teamDescription || '')
    setShowEditForm(false)
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">チーム設定</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-gray-600 text-sm">
            チームの設定を変更するには管理者権限が必要です。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">チーム設定</h2>

      {/* 現在の設定表示 */}
      {!showEditForm && !showDeleteConfirm && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">基本情報</h3>
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-600">チーム名:</span>
                <p className="text-gray-900">{teamName}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">説明:</span>
                <p className="text-gray-900">{teamDescription || '説明なし'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">チームID:</span>
                <p className="text-gray-900 font-mono text-sm">{teamId}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowEditForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              チーム情報を編集
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              チームを削除
            </button>
          </div>
        </div>
      )}

      {/* 編集フォーム */}
      {showEditForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-4">チーム情報を編集</h3>
          <form onSubmit={handleUpdateTeam} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                チーム名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
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
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
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
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !editName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? '更新中...' : '更新'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 削除確認 */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-medium text-red-900 mb-2">チームの削除</h3>
          <p className="text-red-700 text-sm mb-4">
            この操作は取り消せません。チームとその関連データ（お知らせ、メンバーシップなど）がすべて削除されます。
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteLoading}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleDeleteTeam}
              disabled={deleteLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleteLoading ? '削除中...' : '削除する'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
