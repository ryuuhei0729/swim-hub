'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import PracticeImageUploader, { 
  PracticeImageFile, 
  ExistingImage 
} from './PracticeImageUploader'

export interface PracticeFormData {
  practiceDate: string
  place: string
  note: string
}

export interface PracticeImageData {
  newFiles: PracticeImageFile[]
  deletedIds: string[]
}

type EditPracticeData = {
  date?: string
  place?: string
  note?: string
  images?: ExistingImage[]
}

interface PracticeFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PracticeFormData, imageData?: PracticeImageData) => Promise<void>
  initialDate?: Date
  editData?: EditPracticeData
  isLoading?: boolean
}

export default function PracticeForm({
  isOpen,
  onClose,
  onSubmit,
  initialDate,
  editData,
  isLoading = false
}: PracticeFormProps) {
  const [formData, setFormData] = useState<PracticeFormData>({
    practiceDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    place: '',
    note: ''
  })

  // 画像データ
  const [imageData, setImageData] = useState<PracticeImageData>({
    newFiles: [],
    deletedIds: []
  })

  // 初期化済みフラグ（モーダルが開かれた時だけ初期化するため）
  const [isInitialized, setIsInitialized] = useState(false)
  // フォームに変更があるかどうかを追跡
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  // 送信済みフラグ（送信後は警告を出さない）
  const [isSubmitted, setIsSubmitted] = useState(false)

  // モーダルが閉じた時に初期化フラグをリセット
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false)
      setHasUnsavedChanges(false)
      setIsSubmitted(false)
      // 画像データもリセット
      setImageData({ newFiles: [], deletedIds: [] })
    }
  }, [isOpen])

  // フォームに変更があったことを記録
  useEffect(() => {
    if (isOpen && isInitialized) {
      setHasUnsavedChanges(true)
    }
  }, [formData, imageData, isOpen, isInitialized])

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = (_e: PopStateEvent) => {
      if (hasUnsavedChanges && !isSubmitted) {
        const confirmed = window.confirm('入力内容が保存されていません。このまま戻りますか？')
        if (!confirmed) {
          // 履歴を戻す
          window.history.pushState(null, '', window.location.href)
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])

  // initialDateが変更された時にフォームデータを更新
  useEffect(() => {
    if (isOpen && initialDate) {
      setFormData(prev => ({
        ...prev,
        practiceDate: format(initialDate, 'yyyy-MM-dd')
      }))
    }
  }, [isOpen, initialDate])

  // 編集データがある場合、フォームを初期化（モーダルが開かれた時だけ）
  useEffect(() => {
    if (!isOpen || isInitialized) return

    if (editData) {
      setFormData({
        practiceDate: editData.date || format(new Date(), 'yyyy-MM-dd'),
        place: editData.place || '',
        note: editData.note || ''
      })
      setIsInitialized(true)
    } else {
      // 新規作成時はデフォルト値にリセット
      setFormData({
        practiceDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        place: '',
        note: ''
      })
      setIsInitialized(true)
    }
  }, [editData, isOpen, initialDate, isInitialized])

  // 画像の変更ハンドラー
  const handleImagesChange = useCallback((newFiles: PracticeImageFile[], deletedIds: string[]) => {
    setImageData({ newFiles, deletedIds })
  }, [])

  if (!isOpen) return null

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      const confirmed = window.confirm('入力内容が保存されていません。このまま閉じますか？')
      if (!confirmed) {
        return
      }
    }
    // プレビューURLをクリーンアップ
    imageData.newFiles.forEach(file => {
      URL.revokeObjectURL(file.previewUrl)
    })
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)
    try {
      // 画像データがある場合は一緒に送信
      const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0
      await onSubmit(formData, hasImageChanges ? imageData : undefined)
      setHasUnsavedChanges(false)
      onClose()
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習記録を編集' : '練習記録を追加'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="閉じる"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* 練習日 */}
            <div>
              <label htmlFor="practice-date" className="block text-sm font-medium text-gray-700 mb-2">
                練習日
              </label>
              <Input
                id="practice-date"
                type="date"
                value={formData.practiceDate}
                onChange={(e) => setFormData(prev => ({ ...prev, practiceDate: e.target.value }))}
                required
              />
            </div>

            {/* 練習場所 */}
            <div>
              <label htmlFor="practice-place" className="block text-sm font-medium text-gray-700 mb-2">
                練習場所
              </label>
              <Input
                id="practice-place"
                type="text"
                value={formData.place}
                onChange={(e) => setFormData(prev => ({ ...prev, place: e.target.value }))}
                placeholder="例: 市営プール"
                required
              />
            </div>

            {/* メモ */}
            <div>
              <label htmlFor="practice-note" className="block text-sm font-medium text-gray-700 mb-2">
                メモ
              </label>
              <textarea
                id="practice-note"
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="練習に関する特記事項"
              />
            </div>

            {/* 画像添付 */}
            <div className="border-t border-gray-200 pt-6">
              <PracticeImageUploader
                existingImages={editData?.images}
                onImagesChange={handleImagesChange}
                disabled={isLoading}
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={isLoading}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? '保存中...' : (editData ? '更新' : '保存')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
