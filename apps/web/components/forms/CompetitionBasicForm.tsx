'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'

interface CompetitionBasicFormData {
  date: string
  title: string
  place: string
  poolType: number
  note: string
}

type EditCompetitionBasicData = {
  date?: string
  title?: string
  competition_name?: string
  place?: string
  location?: string
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
    title: '',
    place: '',
    poolType: 0,
    note: ''
  })

  // selectedDateまたはeditDataが変更された時にフォームを初期化
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        // 編集モード
        setFormData({
          date: editData.date || format(selectedDate, 'yyyy-MM-dd'),
          title: editData.title || editData.competition_name || '',
          place: editData.place || editData.location || '',
          poolType: editData.pool_type ?? 0,
          note: editData.note || ''
        })
      } else {
        // 新規作成モード
        setFormData({
          date: format(selectedDate, 'yyyy-MM-dd'),
          title: '',
          place: '',
          poolType: 0,
          note: ''
        })
      }
    }
  }, [isOpen, selectedDate, editData])

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

    await onSubmit(formData)
  }

  const handleClose = () => {
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      title: '',
      place: '',
      poolType: 0,
      note: ''
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
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
              {/* 日付 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日付 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="w-full"
                />
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

