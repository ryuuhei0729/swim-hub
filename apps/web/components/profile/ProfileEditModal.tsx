'use client'

import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button, Input } from '@/components/ui'
import AvatarUpload from './AvatarUpload'

interface UserProfile {
  id: string
  name: string
  birthday?: string | null
  bio?: string | null
  profile_image_path?: string | null
}

interface ProfileEditModalProps {
  isOpen: boolean
  onClose: () => void
  profile: UserProfile
  onUpdate: (updatedProfile: Partial<UserProfile>) => Promise<void>
  onAvatarChange: (newAvatarUrl: string | null) => void
}

export default function ProfileEditModal({ 
  isOpen, 
  onClose, 
  profile, 
  onUpdate,
  onAvatarChange
}: ProfileEditModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    birthday: '',
    bio: ''
  })
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  

  // プロフィールが変更されたときにフォームデータを更新
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        birthday: profile.birthday ? profile.birthday.split('T')[0] : '', // YYYY-MM-DD形式
        bio: profile.bio || ''
      })
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      setError('名前は必須です')
      return
    }

    try {
      setIsUpdating(true)
      setError(null)

      // 誕生日をISO形式に変換
      const birthday = formData.birthday ? new Date(formData.birthday).toISOString() : null

      await onUpdate({
        name: formData.name.trim(),
        birthday,
        bio: formData.bio.trim() || null
      })
      // 成功時は即時にモーダルを閉じる
      onClose()
    } catch (err) {
      console.error('プロフィール更新エラー:', err)
      setError('プロフィールの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }))
    setError(null)
  }

  const handleClose = () => {
    if (!isUpdating) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* オーバーレイ */}
      <div 
        className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity"
        onClick={handleClose}
      />
      
      {/* モーダル */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              プロフィール編集
            </h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
              onClick={handleClose}
              disabled={isUpdating}
            >
              <span className="sr-only">閉じる</span>
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* ボディ */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* フィードバックメッセージ */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {/* 上段: 左=アバター / 右=名前+生年月日 */}
            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-8">
              {/* アバター */}
              <div className="flex items-start">
                <AvatarUpload
                  currentAvatarUrl={profile.profile_image_path}
                  userName={formData.name || profile.name}
                  onAvatarChange={onAvatarChange}
                  disabled={isUpdating}
                />
              </div>

              {/* 名前 + 生年月日 */}
              <div className="space-y-4">
                {/* 名前 */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    名前 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange('name')}
                    placeholder="名前を入力"
                    required
                    className="w-full"
                    disabled={isUpdating}
                  />
                </div>
                {/* 生年月日 */}
                <div>
                  <label htmlFor="birthday" className="block text-sm font-medium text-gray-700 mb-2">
                    生年月日
                  </label>
                  <Input
                    id="birthday"
                    type="date"
                    value={formData.birthday}
                    onChange={handleChange('birthday')}
                    className="w-full"
                    disabled={isUpdating}
                  />
                </div>
              </div>

              {/* 自己紹介（下段・全幅） */}
              <div className="md:col-span-2">
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-2">
                  自己紹介
                </label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={handleChange('bio')}
                  placeholder="自己紹介を入力してください"
                  rows={5}
                  maxLength={500}
                  disabled={isUpdating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
                <p className="mt-1 text-sm text-gray-500">
                  {formData.bio.length}/500文字
                </p>
              </div>
            </div>

            {/* ボタン */}
            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={isUpdating}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isUpdating || !formData.name.trim()}
              >
                {isUpdating ? '更新中...' : '更新'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
