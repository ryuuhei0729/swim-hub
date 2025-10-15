'use client'

import React, { useState } from 'react'
import { XMarkIcon, TrashIcon, PaletteIcon } from '@heroicons/react/24/outline'
import { Button, Input } from '@/components/ui'

import { PracticeTag } from '@shared/types/database'

type Tag = PracticeTag

interface TagManagementModalProps {
  isOpen: boolean
  onClose: () => void
  tag: Tag
  onUpdateTag: (id: string, name: string, color: string) => Promise<void>
  onDeleteTag: (id: string) => Promise<void>
}

// プリセットカラー
const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6B7280', // Gray
  '#14B8A6', // Teal
  '#A855F7', // Violet
]

export default function TagManagementModal({
  isOpen,
  onClose,
  tag,
  onUpdateTag,
  onDeleteTag
}: TagManagementModalProps) {
  const [tagName, setTagName] = useState(tag.name)
  const [selectedColor, setSelectedColor] = useState(tag.color)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (!isOpen) return null

  const handleUpdate = async () => {
    if (!tagName.trim()) {
      alert('タグ名を入力してください')
      return
    }

    try {
      setIsUpdating(true)
      await onUpdateTag(tag.id, tagName.trim(), selectedColor)
      onClose()
    } catch (error) {
      console.error('タグ更新エラー:', error)
      alert('タグの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await onDeleteTag(tag.id)
      onClose()
    } catch (error) {
      console.error('タグ削除エラー:', error)
      alert('タグの削除に失敗しました')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                タグの管理
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="bg-white px-6 py-4 space-y-4">
            {/* タグ名入力 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                タグ名
              </label>
              <Input
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="タグ名を入力"
                className="w-full"
              />
            </div>

            {/* 色選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                色
              </label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      selectedColor === color
                        ? 'border-gray-800 scale-110'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              
              {/* カスタムカラー */}
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">
                  カスタムカラー
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-xs text-gray-600">{selectedColor}</span>
                </div>
              </div>
            </div>

            {/* プレビュー */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                プレビュー
              </label>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white"
                  style={{ backgroundColor: selectedColor }}
                >
                  {tagName || 'タグ名'}
                </span>
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse sm:gap-3">
            {/* 更新ボタン */}
            <Button
              onClick={handleUpdate}
              disabled={isUpdating || !tagName.trim()}
              className="w-full sm:w-auto"
            >
              {isUpdating ? '更新中...' : '更新'}
            </Button>

            {/* 削除ボタン */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="w-full sm:w-auto mt-2 sm:mt-0"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              削除
            </Button>

            {/* キャンセルボタン */}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto mt-2 sm:mt-0"
            >
              キャンセル
            </Button>
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-70 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <TrashIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      タグを削除
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        「{tag.name}」を削除してもよろしいですか？この操作は元に戻せません。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <Button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full sm:w-auto sm:ml-3 bg-red-600 hover:bg-red-700"
                >
                  {isDeleting ? '削除中...' : '削除'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="mt-3 w-full sm:mt-0 sm:w-auto"
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
