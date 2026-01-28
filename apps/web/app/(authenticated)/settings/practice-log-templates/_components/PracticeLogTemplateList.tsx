'use client'

import { useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PlusIcon } from '@heroicons/react/24/outline'
import {
  usePracticeLogTemplatesQuery,
  usePracticeLogTemplateCountQuery,
  useDeletePracticeLogTemplateMutation,
  useTogglePracticeLogTemplateFavoriteMutation,
} from '@swim-hub/shared/hooks'
import { PracticeLogTemplateCard } from './PracticeLogTemplateCard'

const MAX_TEMPLATES = 10 // 無料ユーザーの上限

interface PracticeLogTemplateListProps {
  onCreateNew: () => void
}

export function PracticeLogTemplateList({ onCreateNew }: PracticeLogTemplateListProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: templates, isLoading, error } = usePracticeLogTemplatesQuery(supabase)
  const { data: count } = usePracticeLogTemplateCountQuery(supabase)
  const deleteMutation = useDeletePracticeLogTemplateMutation(supabase)
  const toggleFavoriteMutation = useTogglePracticeLogTemplateFavoriteMutation(supabase)

  const handleToggleFavorite = useCallback(
    (templateId: string) => {
      toggleFavoriteMutation.mutate(templateId)
    },
    [toggleFavoriteMutation]
  )

  const handleDelete = useCallback(
    (templateId: string) => {
      deleteMutation.mutate(templateId)
    },
    [deleteMutation]
  )

  // お気に入りとそれ以外を分離
  const favoriteTemplates = templates?.filter((t) => t.is_favorite) || []
  const otherTemplates = templates?.filter((t) => !t.is_favorite) || []

  const isAtLimit = (count || 0) >= MAX_TEMPLATES

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        テンプレートの読み込みに失敗しました
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          保存済み: {count || 0}/{MAX_TEMPLATES}
        </p>
      </div>

      {/* テンプレートがない場合 */}
      {templates?.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">テンプレートがありません</p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            新しいテンプレートを作成
          </button>
        </div>
      )}

      {/* お気に入りテンプレート */}
      {favoriteTemplates.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-1">
            よく使うテンプレート
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {favoriteTemplates.map((template) => (
              <PracticeLogTemplateCard
                key={template.id}
                template={template}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
                isLoading={
                  toggleFavoriteMutation.isPending || deleteMutation.isPending
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* その他のテンプレート */}
      {otherTemplates.length > 0 && (
        <section>
          {favoriteTemplates.length > 0 && (
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              すべてのテンプレート
            </h2>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {otherTemplates.map((template) => (
              <PracticeLogTemplateCard
                key={template.id}
                template={template}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
                isLoading={
                  toggleFavoriteMutation.isPending || deleteMutation.isPending
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* 新規作成ボタン（テンプレートがある場合） */}
      {templates && templates.length > 0 && (
        <button
          type="button"
          onClick={onCreateNew}
          disabled={isAtLimit}
          className={`w-full py-3 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 transition-colors ${
            isAtLimit
              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
              : 'border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-600'
          }`}
        >
          <PlusIcon className="h-5 w-5" />
          {isAtLimit ? '上限に達しました' : '新しいテンプレートを作成'}
        </button>
      )}
    </div>
  )
}
