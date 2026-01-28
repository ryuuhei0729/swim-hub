'use client'

import { useState, useCallback } from 'react'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { StarIcon as StarIconOutline, EllipsisVerticalIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { PracticeLogTemplate } from '@swim-hub/shared/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface PracticeLogTemplateCardProps {
  template: PracticeLogTemplate
  onToggleFavorite: (templateId: string) => void
  onDelete: (templateId: string) => void
  isLoading?: boolean
}

export function PracticeLogTemplateCard({
  template,
  onToggleFavorite,
  onDelete,
  isLoading,
}: PracticeLogTemplateCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const formatCircle = (seconds: number | null): string => {
    if (!seconds) return ''
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}'${sec.toString().padStart(2, '0')}"`
  }

  const handleToggleFavorite = useCallback(() => {
    onToggleFavorite(template.id)
    setShowMenu(false)
  }, [template.id, onToggleFavorite])

  const handleDeleteClick = useCallback(() => {
    setShowMenu(false)
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    onDelete(template.id)
    setShowDeleteConfirm(false)
  }, [template.id, onDelete])

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setShowMenu(!showMenu)
    }
  }, [showMenu])

  return (
    <>
      <div className="relative bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={isLoading}
              className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label={template.is_favorite ? 'お気に入りから削除' : 'お気に入りに追加'}
            >
              {template.is_favorite ? (
                <StarIconSolid className="h-5 w-5 text-yellow-500" />
              ) : (
                <StarIconOutline className="h-5 w-5 text-gray-400 hover:text-yellow-500" />
              )}
            </button>
            <h3 className="font-semibold text-gray-900">{template.name}</h3>
          </div>

          {/* メニューボタン */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              onKeyDown={handleMenuKeyDown}
              className="p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="メニューを開く"
              aria-expanded={showMenu}
              aria-haspopup="true"
            >
              <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
            </button>

            {/* ドロップダウンメニュー */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                  onKeyDown={(e) => e.key === 'Escape' && setShowMenu(false)}
                  role="button"
                  tabIndex={-1}
                  aria-label="メニューを閉じる"
                />
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    {template.is_favorite ? (
                      <>
                        <StarIconOutline className="h-4 w-4" />
                        お気に入りから削除
                      </>
                    ) : (
                      <>
                        <StarIconSolid className="h-4 w-4" />
                        お気に入りに追加
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <TrashIcon className="h-4 w-4" />
                    削除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            {template.distance}m × {template.rep_count}本 × {template.set_count}セット
          </p>
          <p>
            {template.style} {template.swim_category}
            {template.circle && (
              <span className="ml-2">サークル {formatCircle(template.circle)}</span>
            )}
          </p>
          {template.note && (
            <p className="text-gray-500 truncate">{template.note}</p>
          )}
        </div>

        {/* フッター */}
        {template.use_count > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
            使用回数: {template.use_count}回
          </div>
        )}
      </div>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="テンプレートを削除"
        message={`「${template.name}」を削除しますか？この操作は取り消せません。`}
        variant="danger"
        confirmLabel="削除"
      />
    </>
  )
}
