'use client'

import React, { useState, useMemo } from 'react'
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button, Input } from '@/components/ui'

import { PracticeTag } from '@apps/shared/types/database'

type Tag = PracticeTag

interface TagManagementModalProps {
  isOpen: boolean
  onClose: () => void
  tag: Tag
  onUpdateTag: (id: string, name: string, color: string) => Promise<void>
  onDeleteTag: (id: string) => Promise<void>
}

// パステルカラー（固定10種類）
const PRESET_COLORS = [
  '#93C5FD', // 青
  '#7DD3FC', // 水色
  '#86EFAC', // 緑
  '#A3E635', // 黄緑
  '#FCA5A5', // 赤
  '#F9A8D4', // ピンク
  '#FDBA74', // オレンジ
  '#FDE047', // 黄色
  '#C4B5FD', // 紫
  '#D1D5DB', // グレー
]

// カラー正規化関数
const normalizeColor = (color: string): string => {
  if (!color) return '#D1D5DB' // デフォルト色
  
  // 先頭の#を追加（ない場合）
  let normalized = color.startsWith('#') ? color : `#${color}`
  
  // 小文字に変換
  normalized = normalized.toLowerCase()
  
  // 3桁のHEXを6桁に変換（例: #fff → #ffffff）
  if (normalized.length === 4) {
    normalized = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
  }
  
  // 有効なHEXカラーかチェック
  const hexPattern = /^#[0-9a-f]{6}$/
  if (!hexPattern.test(normalized)) {
    return '#D1D5DB' // 無効な場合はデフォルト色
  }
  
  return normalized
}

// カラー検証関数
const isValidColor = (color: string): boolean => {
  const normalized = normalizeColor(color)
  return normalized !== '#D1D5DB' || color === '#D1D5DB'
}

export default function TagManagementModal({
  isOpen,
  onClose,
  tag,
  onUpdateTag,
  onDeleteTag
}: TagManagementModalProps) {
  const [tagName, setTagName] = useState(tag.name)
  const [selectedColor, setSelectedColor] = useState(() => normalizeColor(tag.color))
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // カラーオプション（プリセット + カスタムカラー）
  const colorOptions = useMemo(() => {
    const normalizedTagColor = normalizeColor(tag.color)
    const options = [...PRESET_COLORS]
    
    // タグのカラーがプリセットにない場合、追加
    if (!PRESET_COLORS.includes(normalizedTagColor) && isValidColor(tag.color)) {
      options.unshift(normalizedTagColor)
    }
    
    return options
  }, [tag.color])

  if (!isOpen) return null

  const handleUpdate = async () => {
    if (!tagName.trim()) {
      console.error('タグ名を入力してください')
      return
    }

    // カラーを正規化して検証
    const normalizedColor = normalizeColor(selectedColor)
    if (!isValidColor(selectedColor)) {
      console.error('無効なカラー形式です。有効なHEXカラーを選択してください。')
      return
    }

    try {
      setIsUpdating(true)
      await onUpdateTag(tag.id, tagName.trim(), normalizedColor)
      onClose()
    } catch (error) {
      console.error('タグ更新エラー:', error)
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
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" data-testid="tag-management-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
        />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-md">
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
                data-testid="tag-name-input"
              />
            </div>

            {/* 色選択 */}
              <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                色
              </label>
              <div className="grid grid-cols-5 gap-2">
                {colorOptions.map(color => {
                  const normalizedColor = normalizeColor(color)
                  const isSelected = normalizeColor(selectedColor) === normalizedColor
                  
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(normalizedColor)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        isSelected
                          ? 'border-gray-800 scale-110'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: normalizedColor }}
                      title={normalizedColor}
                      data-testid={`tag-color-${normalizedColor.replace('#', '')}`}
                    />
                  )
                })}
              </div>
            </div>

            {/* プレビュー */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                プレビュー
              </label>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-black"
                  style={{ backgroundColor: normalizeColor(selectedColor) }}
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
              data-testid="tag-update-button"
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
              data-testid="tag-delete-button"
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
              data-testid="tag-cancel-button"
            >
              キャンセル
            </Button>
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[90] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 transition-opacity" />
            
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-red-300 w-full max-w-lg" data-testid="tag-delete-confirm">
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
