'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface PracticeBasicData {
  date: string
  place: string
  note: string
}

type EditPracticeBasicData = {
  date?: string
  place?: string
  note?: string
}

interface PracticeBasicFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PracticeBasicData) => Promise<void>
  selectedDate: Date
  editData?: EditPracticeBasicData // 編集時のデータ
  isLoading?: boolean
}

export default function PracticeBasicForm({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  editData,
  isLoading = false
}: PracticeBasicFormProps) {
  // selectedDateの有効性を確保
  const validDate = selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()
  
  const [formData, setFormData] = useState<PracticeBasicData>({
    date: format(selectedDate, 'yyyy-MM-dd'),
    place: '',
    note: ''
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
    }
  }, [isOpen])

  // フォームに変更があったことを記録
  useEffect(() => {
    if (isOpen && isInitialized) {
      setHasUnsavedChanges(true)
    }
  }, [formData, isOpen, isInitialized])

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

  // selectedDateまたはeditDataが変更された時にフォームを初期化（モーダルが開かれた時だけ）
  useEffect(() => {
    if (!isOpen || isInitialized) return

    if (editData) {
      // 編集モード
      setFormData({
        date: editData.date || format(selectedDate, 'yyyy-MM-dd'),
        place: editData.place || '',
        note: editData.note || ''
      })
      setIsInitialized(true)
    } else {
      // 新規作成モード
      setFormData({
        date: format(selectedDate, 'yyyy-MM-dd'),
        place: '',
        note: ''
      })
      setIsInitialized(true)
    }
  }, [isOpen, selectedDate, editData, isInitialized])

  if (!isOpen) return null

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      const confirmed = window.confirm('入力内容が保存されていません。このまま閉じますか？')
      if (!confirmed) {
        return
      }
    }
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション
    if (!formData.place.trim()) {
      console.error('練習場所を入力してください')
      return
    }

    setIsSubmitted(true)
    try {
      await onSubmit(formData)
      setHasUnsavedChanges(false)
      onClose()
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
      setIsSubmitted(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" data-testid="practice-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-lg">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習予定を編集' : '練習予定を作成'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {validDate ? format(validDate, 'M月d日(E)', { locale: ja }) : '選択された日付'}の練習予定を{editData ? '編集' : '作成'}します
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* 練習日 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                練習日
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                required
                data-testid="practice-date"
              />
            </div>

            {/* 練習場所 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                練習場所 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.place}
                onChange={(e) =>
                  setFormData({ ...formData, place: e.target.value })
                }
                placeholder="例: 市営プール、学校プール"
                required
                data-testid="practice-place"
              />
            </div>

            {/* メモ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メモ
              </label>
              <textarea
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="練習に関する特記事項（天候、体調など）"
                data-testid="practice-note"
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
                className="bg-blue-600 hover:bg-blue-700"
                data-testid={editData ? 'update-practice-button' : 'save-practice-button'}
              >
                {isLoading ? (editData ? '更新中...' : '作成中...') : (editData ? '練習予定を更新' : '練習予定を作成')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
