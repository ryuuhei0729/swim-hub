'use client'

import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export interface TeamCreateFormData {
  name: string
  description: string
}

export interface TeamCreateFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: TeamCreateFormData) => Promise<void>
  isLoading?: boolean
}

export default function TeamCreateForm({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false
}: TeamCreateFormProps) {
  const [formData, setFormData] = useState<TeamCreateFormData>({
    name: '',
    description: ''
  })
  const [errors, setErrors] = useState<Partial<TeamCreateFormData>>({})

  // フォームバリデーション
  const validateForm = (): boolean => {
    const newErrors: Partial<TeamCreateFormData> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'チーム名は必須です'
    } else if (formData.name.length > 50) {
      newErrors.name = 'チーム名は50文字以内で入力してください'
    }

    if (formData.description.length > 200) {
      newErrors.description = '説明は200文字以内で入力してください'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // フォーム送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      await onSubmit(formData)
      // 成功時はフォームをリセット
      setFormData({ name: '', description: '' })
      setErrors({})
    } catch (error) {
      console.error('チーム作成エラー:', error)
    }
  }

  // フォームリセット
  const handleClose = () => {
    setFormData({ name: '', description: '' })
    setErrors({})
    onClose()
  }

  // 入力値変更
  const handleInputChange = (field: keyof TeamCreateFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // エラーをクリア
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="team-create-modal">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* オーバーレイ */}
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={handleClose}
        />

        {/* モーダル */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full" data-testid="team-create-dialog">
          <form onSubmit={handleSubmit}>
            {/* ヘッダー */}
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  新しいチームを作成
                </h3>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600"
                  data-testid="team-create-close-button"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* チーム名 */}
              <div className="mb-4">
                <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
                  チーム名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="teamName"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="例: 水泳クラブA"
                  maxLength={50}
                  disabled={isLoading}
                  data-testid="team-name-input"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  {formData.name.length}/50文字
                </p>
              </div>

              {/* 説明 */}
              <div className="mb-4">
                <label htmlFor="teamDescription" className="block text-sm font-medium text-gray-700 mb-2">
                  説明
                </label>
                <textarea
                  id="teamDescription"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.description ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="チームの説明を入力してください（任意）"
                  maxLength={200}
                  disabled={isLoading}
                  data-testid="team-description-input"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  {formData.description.length}/200文字
                </p>
              </div>
            </div>

            {/* フッター */}
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="team-create-submit-button"
              >
                {isLoading ? '作成中...' : 'チームを作成'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="team-create-cancel-button"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
