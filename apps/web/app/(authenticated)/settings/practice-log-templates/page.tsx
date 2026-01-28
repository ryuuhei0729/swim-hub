'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { PracticeLogTemplateList } from './_components/PracticeLogTemplateList'
import { PracticeLogTemplateCreateModal } from './_components/PracticeLogTemplateCreateModal'
import type { PracticeLogTemplate } from '@swim-hub/shared/types'

export default function PracticeLogTemplatesPage() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [editData, setEditData] = useState<PracticeLogTemplate | null>(null)

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleBackKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleBack()
      }
    },
    [handleBack]
  )

  const handleCreateNew = useCallback(() => {
    setEditData(null)
    setShowModal(true)
  }, [])

  const handleEdit = useCallback((template: PracticeLogTemplate) => {
    setEditData(template)
    setShowModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setEditData(null)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            onKeyDown={handleBackKeyDown}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg"
            aria-label="戻る"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold">テンプレート管理</h1>
        </div>
      </header>

      {/* コンテンツ */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <PracticeLogTemplateList onCreateNew={handleCreateNew} onEdit={handleEdit} />
      </main>

      {/* 作成・編集モーダル */}
      <PracticeLogTemplateCreateModal
        isOpen={showModal}
        onClose={handleCloseModal}
        editData={editData}
      />
    </div>
  )
}
