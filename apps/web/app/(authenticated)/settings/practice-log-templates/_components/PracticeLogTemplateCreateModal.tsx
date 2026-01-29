'use client'

import { useState, useCallback, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { XMarkIcon } from '@heroicons/react/24/outline'
import {
  useCreatePracticeLogTemplateMutation,
  useUpdatePracticeLogTemplateMutation,
} from '@swim-hub/shared/hooks'
import { usePracticeTagsQuery } from '@swim-hub/shared/hooks/queries/practices'
import type { CreatePracticeLogTemplateInput, PracticeLogTemplate } from '@swim-hub/shared/types'
import type { PracticeTag } from '@swim-hub/shared/types'
import TagInput from '@/components/forms/TagInput'
import { Button } from '@/components/ui'

interface PracticeLogTemplateCreateModalProps {
  isOpen: boolean
  onClose: () => void
  editData?: PracticeLogTemplate | null
}

const STYLES = ['Fr', 'Ba', 'Br', 'Fly', 'IM']
const SWIM_CATEGORIES: Array<'Swim' | 'Pull' | 'Kick'> = ['Swim', 'Pull', 'Kick']
const DISTANCES = [25, 50, 100, 200, 400, 800, 1500]

export function PracticeLogTemplateCreateModal({
  isOpen,
  onClose,
  editData,
}: PracticeLogTemplateCreateModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const createMutation = useCreatePracticeLogTemplateMutation(supabase)
  const updateMutation = useUpdatePracticeLogTemplateMutation(supabase)
  const { data: tagsData } = usePracticeTagsQuery(supabase)

  const isEditMode = !!editData

  const [formData, setFormData] = useState<CreatePracticeLogTemplateInput>({
    name: '',
    style: 'Fr',
    swim_category: 'Swim',
    distance: 50,
    rep_count: 1,
    set_count: 1,
    circle: 90,
    note: '',
    tag_ids: [],
  })

  const [circleMinutes, setCircleMinutes] = useState(1)
  const [circleSeconds, setCircleSeconds] = useState(30)
  const [availableTags, setAvailableTags] = useState<PracticeTag[]>([])
  const [selectedTags, setSelectedTags] = useState<PracticeTag[]>([])

  // タグデータを設定
  useEffect(() => {
    if (tagsData) {
      setAvailableTags(tagsData)
    }
  }, [tagsData])

  // 編集モード時にフォームにデータを設定
  useEffect(() => {
    if (isOpen && editData) {
      const circleTime = editData.circle || 90
      const min = Math.floor(circleTime / 60)
      const sec = circleTime % 60

      setFormData({
        name: editData.name,
        style: editData.style,
        swim_category: editData.swim_category,
        distance: editData.distance,
        rep_count: editData.rep_count,
        set_count: editData.set_count,
        circle: circleTime,
        note: editData.note || '',
        tag_ids: editData.tag_ids || [],
      })
      setCircleMinutes(min)
      setCircleSeconds(sec)

      // 既存のタグを選択状態に
      if (editData.tag_ids && tagsData) {
        const selected = tagsData.filter((tag) => editData.tag_ids.includes(tag.id))
        setSelectedTags(selected)
      }
    } else if (isOpen && !editData) {
      // 新規作成時はフォームをリセット
      setFormData({
        name: '',
        style: 'Fr',
        swim_category: 'Swim',
        distance: 50,
        rep_count: 1,
        set_count: 1,
        circle: 90,
        note: '',
        tag_ids: [],
      })
      setCircleMinutes(1)
      setCircleSeconds(30)
      setSelectedTags([])
    }
  }, [isOpen, editData, tagsData])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      const circleInSeconds = circleMinutes * 60 + circleSeconds
      const input: CreatePracticeLogTemplateInput = {
        ...formData,
        circle: circleInSeconds,
        note: formData.note || null,
        tag_ids: selectedTags.map((tag) => tag.id),
      }

      try {
        if (isEditMode && editData) {
          await updateMutation.mutateAsync({
            templateId: editData.id,
            input,
          })
        } else {
          await createMutation.mutateAsync(input)
        }
        onClose()
      } catch (error) {
        console.error('テンプレート保存エラー:', error)
      }
    },
    [
      formData,
      circleMinutes,
      circleSeconds,
      selectedTags,
      isEditMode,
      editData,
      createMutation,
      updateMutation,
      onClose,
    ]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  const handleTagsChange = useCallback((tags: PracticeTag[]) => {
    setSelectedTags(tags)
  }, [])

  const handleAvailableTagsUpdate = useCallback((tags: PracticeTag[]) => {
    setAvailableTags(tags)
  }, [])

  if (!isOpen) return null

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-modal-title"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 id="template-modal-title" className="text-base sm:text-lg font-semibold text-gray-900">
              {isEditMode ? 'テンプレートを編集' : '新しいテンプレートを作成'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
              aria-label="閉じる"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4">
            {/* テンプレート名 */}
            <div>
              <label
                htmlFor="template-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                テンプレート名 <span className="text-red-500">*</span>
              </label>
              <input
                id="template-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例: 朝練キック"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                maxLength={100}
              />
            </div>

            {/* 種目 & カテゴリ */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="template-style"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  種目
                </label>
                <select
                  id="template-style"
                  value={formData.style}
                  onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="template-category"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  カテゴリ
                </label>
                <select
                  id="template-category"
                  value={formData.swim_category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      swim_category: e.target.value as 'Swim' | 'Pull' | 'Kick',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {SWIM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 距離 × 本数 × セット */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="template-distance"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  距離 (m)
                </label>
                <select
                  id="template-distance"
                  value={formData.distance}
                  onChange={(e) =>
                    setFormData({ ...formData, distance: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {DISTANCES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="template-rep"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  本数
                </label>
                <input
                  id="template-rep"
                  type="number"
                  min={1}
                  max={99}
                  value={formData.rep_count}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rep_count: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="template-set"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  セット
                </label>
                <input
                  id="template-set"
                  type="number"
                  min={1}
                  max={99}
                  value={formData.set_count}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      set_count: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* サークル（必須） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                サークル <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={circleMinutes}
                  onChange={(e) => setCircleMinutes(Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                  aria-label="サークル 分"
                />
                <span className="text-gray-600">分</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={circleSeconds}
                  onChange={(e) => setCircleSeconds(Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                  aria-label="サークル 秒"
                />
                <span className="text-gray-600">秒</span>
              </div>
            </div>

            {/* タグ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タグ</label>
              <TagInput
                selectedTags={selectedTags}
                availableTags={availableTags}
                onTagsChange={handleTagsChange}
                onAvailableTagsUpdate={handleAvailableTagsUpdate}
                placeholder="タグを選択または作成"
              />
            </div>

            {/* メモ */}
            <div>
              <label
                htmlFor="template-note"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                メモ（任意）
              </label>
              <textarea
                id="template-note"
                value={formData.note || ''}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="メモを入力..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={!formData.name || isPending}
              >
                {isPending
                  ? isEditMode
                    ? '更新中...'
                    : '作成中...'
                  : isEditMode
                    ? '更新'
                    : '作成'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
