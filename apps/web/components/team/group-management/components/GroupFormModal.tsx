'use client'

import React, { useState, useEffect } from 'react'
import BaseModal from '@/components/ui/BaseModal'
import type { TeamGroupWithCount } from '../hooks/useTeamGroups'

interface GroupFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (category: string | null, name: string) => Promise<boolean>
  existingCategories: string[]
  editingGroup?: TeamGroupWithCount | null
  saving: boolean
  error: string | null
}

export const GroupFormModal: React.FC<GroupFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingCategories,
  editingGroup,
  saving,
  error,
}) => {
  const [categoryMode, setCategoryMode] = useState<'existing' | 'new'>('existing')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [name, setName] = useState('')

  // 編集時の初期値設定
  useEffect(() => {
    if (editingGroup) {
      setName(editingGroup.name)
      if (editingGroup.category && existingCategories.includes(editingGroup.category)) {
        setCategoryMode('existing')
        setSelectedCategory(editingGroup.category)
      } else if (editingGroup.category) {
        setCategoryMode('new')
        setNewCategory(editingGroup.category)
      } else {
        setCategoryMode('existing')
        setSelectedCategory('')
      }
    } else {
      setName('')
      setCategoryMode(existingCategories.length > 0 ? 'existing' : 'new')
      setSelectedCategory(existingCategories[0] || '')
      setNewCategory('')
    }
  }, [editingGroup, existingCategories, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const category = categoryMode === 'new' ? (newCategory.trim() || null) : (selectedCategory || null)
    const success = await onSubmit(category, name.trim())
    if (success) {
      onClose()
    }
  }

  const isValid = name.trim().length > 0

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingGroup ? 'グループを編集' : 'グループを追加'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* カテゴリ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            カテゴリ
          </label>
          {existingCategories.length > 0 && (
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setCategoryMode('existing')}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  categoryMode === 'existing'
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                既存から選択
              </button>
              <button
                type="button"
                onClick={() => setCategoryMode('new')}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  categoryMode === 'new'
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                新規カテゴリ
              </button>
            </div>
          )}
          {categoryMode === 'existing' && existingCategories.length > 0 ? (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">カテゴリなし</option>
              {existingCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="例: 学年、距離、S1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          )}
          <p className="mt-1 text-xs text-gray-500">
            同じ分類のグループをまとめるための名前です
          </p>
        </div>

        {/* グループ名 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            グループ名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={editingGroup ? '例: スプリント' : '例: スプリント, ディスタンス, ミドル'}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {!editingGroup && (
            <p className="mt-1 text-xs text-gray-500">
              カンマ区切りで複数のグループを一度に作成できます
            </p>
          )}
        </div>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ボタン */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!isValid || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : editingGroup ? '更新' : '作成'}
          </button>
        </div>
      </form>
    </BaseModal>
  )
}
