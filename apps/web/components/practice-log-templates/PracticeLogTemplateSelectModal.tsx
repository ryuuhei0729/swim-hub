'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { XMarkIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/24/solid'
import {
  usePracticeLogTemplatesQuery,
  useUsePracticeLogTemplateMutation,
} from '@swim-hub/shared/hooks'
import type { PracticeLogTemplate } from '@swim-hub/shared/types'

interface PracticeLogTemplateSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (template: PracticeLogTemplate) => void
}

export function PracticeLogTemplateSelectModal({
  isOpen,
  onClose,
  onSelect,
}: PracticeLogTemplateSelectModalProps) {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: templates, isLoading } = usePracticeLogTemplatesQuery(supabase)
  const useMutation = useUsePracticeLogTemplateMutation(supabase)

  const formatCircle = (seconds: number | null): string => {
    if (!seconds) return ''
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}'${sec.toString().padStart(2, '0')}"`
  }

  const handleSelect = useCallback(
    (template: PracticeLogTemplate) => {
      // use_countを更新
      useMutation.mutate(template.id)
      onSelect(template)
      onClose()
    },
    [useMutation, onSelect, onClose]
  )

  const handleManageClick = useCallback(() => {
    onClose()
    router.push('/settings/practice-log-templates')
  }, [router, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  const handleTemplateKeyDown = useCallback(
    (e: React.KeyboardEvent, template: PracticeLogTemplate) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleSelect(template)
      }
    },
    [handleSelect]
  )

  if (!isOpen) return null

  const favoriteTemplates = templates?.filter((t) => t.is_favorite) || []
  const otherTemplates = templates?.filter((t) => !t.is_favorite) || []

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-template-title"
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
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-200 shrink-0">
            <h3 id="select-template-title" className="text-base sm:text-lg font-semibold text-gray-900">
              テンプレートを選択
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
              aria-label="閉じる"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded-lg" />
                ))}
              </div>
            ) : templates?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-4">テンプレートがありません</p>
                <button
                  type="button"
                  onClick={handleManageClick}
                  className="text-blue-600 hover:text-blue-800"
                >
                  テンプレートを作成する
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* お気に入りテンプレート */}
                {favoriteTemplates.length > 0 && (
                  <section>
                    <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                      <StarIcon className="h-4 w-4 text-yellow-500" />
                      よく使うテンプレート
                    </h3>
                    <div className="space-y-2">
                      {favoriteTemplates.map((template) => (
                        <TemplateItem
                          key={template.id}
                          template={template}
                          onSelect={handleSelect}
                          onKeyDown={handleTemplateKeyDown}
                          formatCircle={formatCircle}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* その他のテンプレート */}
                {otherTemplates.length > 0 && (
                  <section>
                    {favoriteTemplates.length > 0 && (
                      <h3 className="text-sm font-medium text-gray-500 mb-2">
                        すべてのテンプレート
                      </h3>
                    )}
                    <div className="space-y-2">
                      {otherTemplates.map((template) => (
                        <TemplateItem
                          key={template.id}
                          template={template}
                          onSelect={handleSelect}
                          onKeyDown={handleTemplateKeyDown}
                          formatCircle={formatCircle}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="p-3 sm:p-6 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={handleManageClick}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Cog6ToothIcon className="h-5 w-5" />
              テンプレートを管理
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// テンプレート項目コンポーネント
function TemplateItem({
  template,
  onSelect,
  onKeyDown,
  formatCircle,
}: {
  template: PracticeLogTemplate
  onSelect: (template: PracticeLogTemplate) => void
  onKeyDown: (e: React.KeyboardEvent, template: PracticeLogTemplate) => void
  formatCircle: (seconds: number | null) => string
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(template)}
      onKeyDown={(e) => onKeyDown(e, template)}
      className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
      aria-label={`テンプレート: ${template.name}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{template.name}</span>
        <span className="text-gray-400 text-sm">&gt;</span>
      </div>
      <div className="text-sm text-gray-600 mt-1">
        {template.distance}m × {template.rep_count}本 × {template.set_count}セット{' '}
        {template.style} {template.swim_category}
        {template.circle && (
          <span className="ml-2 text-gray-500">
            サークル {formatCircle(template.circle)}
          </span>
        )}
      </div>
    </div>
  )
}
