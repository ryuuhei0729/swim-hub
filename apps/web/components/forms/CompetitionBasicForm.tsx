'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'

interface CompetitionBasicFormData {
  date: string
  endDate: string // 終了日（複数日開催の場合）。空文字の場合は単日開催
  title: string
  place: string
  poolType: number
  note: string
}

type EditCompetitionBasicData = {
  date?: string
  end_date?: string | null // 終了日（複数日開催の場合）
  title?: string
  competition_name?: string
  place?: string
  pool_type?: number
  note?: string
}

interface CompetitionBasicFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CompetitionBasicFormData) => Promise<void>
  selectedDate: Date
  editData?: EditCompetitionBasicData
  isLoading?: boolean
}

const POOL_TYPES = [
  { value: 0, label: '短水路 (25m)' },
  { value: 1, label: '長水路 (50m)' }
]

export default function CompetitionBasicForm({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  editData,
  isLoading = false
}: CompetitionBasicFormProps) {
  const [formData, setFormData] = useState<CompetitionBasicFormData>({
    date: format(selectedDate, 'yyyy-MM-dd'),
    endDate: '',
    title: '',
    place: '',
    poolType: 0,
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
        endDate: editData.end_date || '',
        title: editData.title || editData.competition_name || '',
        place: editData.place || '',
        poolType: editData.pool_type ?? 0,
        note: editData.note || ''
      })
      setIsInitialized(true)
    } else {
      // 新規作成モード
      setFormData({
        date: format(selectedDate, 'yyyy-MM-dd'),
        endDate: '',
        title: '',
        place: '',
        poolType: 0,
        note: ''
      })
      setIsInitialized(true)
    }
  }, [isOpen, selectedDate, editData, isInitialized])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション
    if (!formData.title.trim()) {
      console.error('大会名を入力してください')
      return
    }
    if (!formData.place.trim()) {
      console.error('場所を入力してください')
      return
    }
    // 終了日が設定されている場合、開始日以降であることを確認
    if (formData.endDate && formData.endDate < formData.date) {
      console.error('終了日は開始日以降の日付を指定してください')
      return
    }

    setIsSubmitted(true)
    try {
      await onSubmit(formData)
      setHasUnsavedChanges(false)
      onClose()
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      const confirmed = window.confirm('入力内容が保存されていません。このまま閉じますか？')
      if (!confirmed) {
        return
      }
    }
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      endDate: '',
      title: '',
      place: '',
      poolType: 0,
      note: ''
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" data-testid="competition-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-lg">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '大会情報編集' : '大会情報登録'}
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 日付（開始日・終了日） */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    開始日 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="w-full"
                    data-testid="competition-date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    終了日 <span className="text-gray-400 text-xs">（複数日の場合）</span>
                  </label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    min={formData.date}
                    className="w-full"
                    data-testid="competition-end-date"
                  />
                </div>
              </div>

              {/* 大会名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  大会名 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="例: 全国大会"
                  required
                  className="w-full"
                  data-testid="competition-title"
                />
              </div>

              {/* 場所 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  場所 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.place}
                  onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                  placeholder="例: 東京アクアティクスセンター"
                  required
                  className="w-full"
                  data-testid="competition-place"
                />
              </div>

              {/* プール種別 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プール種別 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.poolType}
                  onChange={(e) => setFormData({ ...formData, poolType: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  data-testid="competition-pool-type"
                >
                  {POOL_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メモ
                </label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="大会に関するメモ（任意）"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  data-testid="competition-note"
                />
              </div>
            </form>
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full sm:w-auto sm:ml-3"
              data-testid={editData ? 'competition-update-button' : 'competition-next-button'}
            >
              {isLoading ? '保存中...' : editData ? '更新' : '次へ（記録登録）'}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
            >
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

