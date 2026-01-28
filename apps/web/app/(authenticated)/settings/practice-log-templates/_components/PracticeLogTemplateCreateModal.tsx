'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useCreatePracticeLogTemplateMutation } from '@swim-hub/shared/hooks'
import type { CreatePracticeLogTemplateInput } from '@swim-hub/shared/types'

interface PracticeLogTemplateCreateModalProps {
  isOpen: boolean
  onClose: () => void
}

const STYLES = ['Fr', 'Ba', 'Br', 'Fly', 'IM']
const SWIM_CATEGORIES: Array<'Swim' | 'Pull' | 'Kick'> = ['Swim', 'Pull', 'Kick']
const DISTANCES = [25, 50, 100, 200, 400, 800, 1500]

export function PracticeLogTemplateCreateModal({
  isOpen,
  onClose,
}: PracticeLogTemplateCreateModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const createMutation = useCreatePracticeLogTemplateMutation(supabase)

  const [formData, setFormData] = useState<CreatePracticeLogTemplateInput>({
    name: '',
    style: 'Fr',
    swim_category: 'Swim',
    distance: 50,
    rep_count: 1,
    set_count: 1,
    circle: null,
    note: '',
  })

  const [circleMinutes, setCircleMinutes] = useState(1)
  const [circleSeconds, setCircleSeconds] = useState(30)
  const [useCircle, setUseCircle] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      const input: CreatePracticeLogTemplateInput = {
        ...formData,
        circle: useCircle ? circleMinutes * 60 + circleSeconds : null,
        note: formData.note || null,
      }

      try {
        await createMutation.mutateAsync(input)
        // フォームをリセット
        setFormData({
          name: '',
          style: 'Fr',
          swim_category: 'Swim',
          distance: 50,
          rep_count: 1,
          set_count: 1,
          circle: null,
          note: '',
        })
        setUseCircle(false)
        onClose()
      } catch (error) {
        console.error('テンプレート作成エラー:', error)
      }
    },
    [formData, useCircle, circleMinutes, circleSeconds, createMutation, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-template-title"
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
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 id="create-template-title" className="text-lg font-semibold">
              新しいテンプレートを作成
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100"
              aria-label="閉じる"
            >
              <XMarkIcon className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
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
                  onChange={(e) =>
                    setFormData({ ...formData, style: e.target.value })
                  }
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

            {/* サークル */}
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={useCircle}
                  onChange={(e) => setUseCircle(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  サークルを設定
                </span>
              </label>
              {useCircle && (
                <div className="flex items-center gap-2 ml-6">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={circleMinutes}
                    onChange={(e) => setCircleMinutes(Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                    aria-label="サークル 分"
                  />
                  <span className="text-gray-600">分</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={circleSeconds}
                    onChange={(e) => setCircleSeconds(Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                    aria-label="サークル 秒"
                  />
                  <span className="text-gray-600">秒</span>
                </div>
              )}
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
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                placeholder="メモを入力..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!formData.name || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? '作成中...' : '作成'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
