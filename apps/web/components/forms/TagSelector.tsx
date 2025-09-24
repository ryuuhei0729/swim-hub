'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import { GET_MY_PRACTICE_TAGS } from '@/graphql/queries'
import { CREATE_PRACTICE_TAG } from '@/graphql/mutations'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { PracticeTag } from '@/types'

interface TagSelectorProps {
  selectedTags: PracticeTag[]
  onTagsChange: (tags: PracticeTag[]) => void
  disabled?: boolean
}

export default function TagSelector({
  selectedTags,
  onTagsChange,
  disabled = false
}: TagSelectorProps) {
  const [showCreateTag, setShowCreateTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#93C5FD')

  // 既存のタグを取得
  const { data: tagsData, loading: tagsLoading, refetch: refetchTags } = useQuery(GET_MY_PRACTICE_TAGS, {
    fetchPolicy: 'cache-and-network'
  })

  // 新しいタグを作成
  const [createTag, { loading: createLoading }] = useMutation(CREATE_PRACTICE_TAG, {
    onCompleted: () => {
      setNewTagName('')
      setShowCreateTag(false)
      refetchTags()
    },
    onError: (error) => {
      console.error('タグの作成に失敗しました:', error)
      alert('タグの作成に失敗しました。')
    }
  })

  const availableTags = (tagsData as any)?.myPracticeTags || []

  // 色の明度に基づいてテキスト色を決定する関数
  const getTextColor = (backgroundColor: string) => {
    // 16進数カラーをRGBに変換
    const hex = backgroundColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // 明度を計算（0-255）
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    
    // 明度が128より高い場合は黒、低い場合は白
    return brightness > 128 ? '#000000' : '#FFFFFF'
  }

  // タグの選択/選択解除
  const toggleTag = (tag: PracticeTag) => {
    if (disabled) return

    const isSelected = selectedTags.some(t => t.id === tag.id)
    if (isSelected) {
      onTagsChange(selectedTags.filter(t => t.id !== tag.id))
    } else {
      onTagsChange([...selectedTags, tag])
    }
  }

  // 新しいタグを作成
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return

    try {
      await createTag({
        variables: {
          input: {
            name: newTagName.trim(),
            color: newTagColor
          }
        }
      })
    } catch (error) {
      console.error('タグ作成エラー:', error)
    }
  }

  // プリセットカラー（淡い色）
  const presetColors = [
    '#93C5FD', // 淡い青
    '#FCA5A5', // 淡い赤
    '#86EFAC', // 淡い緑
    '#FDE047', // 淡い黄
    '#C4B5FD', // 淡い紫
    '#F9A8D4', // 淡いピンク
    '#D1D5DB', // 淡いグレー
    '#5EEAD4', // 淡いティール
    '#FED7AA', // 淡いオレンジ
    '#A7F3D0', // 淡いエメラルド
  ]

  if (tagsLoading) {
    return (
      <div className="text-sm text-gray-500">タグを読み込み中...</div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 選択されたタグの表示 */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium"
              style={{ 
                backgroundColor: tag.color,
                color: getTextColor(tag.color)
              }}
            >
              {tag.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="ml-2 hover:opacity-70"
                  style={{ color: getTextColor(tag.color) }}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 利用可能なタグの表示 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          タグを選択
        </label>
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag: PracticeTag) => {
            const isSelected = selectedTags.some(t => t.id === tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag)}
                disabled={disabled}
                className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
                  isSelected
                    ? 'border-transparent shadow-md ring-2 ring-white ring-opacity-50'
                    : 'border-transparent hover:shadow-sm'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ 
                  backgroundColor: tag.color,
                  color: getTextColor(tag.color)
                }}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* 新しいタグを作成 */}
      {!disabled && (
        <div className="space-y-2">
          {!showCreateTag ? (
            <button
              type="button"
              onClick={() => setShowCreateTag(true)}
              className="inline-flex items-center px-3 py-1 border border-dashed border-gray-300 rounded-full text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-400"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              新しいタグを作成
            </button>
          ) : (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タグ名
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="例: 長水路、EN、AN、ゴールセット"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={20}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  カラー
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                  />
                  <div className="flex space-x-1">
                    {presetColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewTagColor(color)}
                        className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || createLoading}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createLoading ? '作成中...' : '作成'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTag(false)
                    setNewTagName('')
                  }}
                  className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-400"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
