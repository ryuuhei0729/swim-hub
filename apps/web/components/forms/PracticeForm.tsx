'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'

interface PracticeFormData {
  practiceDate: string
  place: string
  note: string
}

interface PracticeFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PracticeFormData) => Promise<void>
  initialDate?: Date
  editData?: any
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

  // initialDateが変更された時にフォームデータを更新
  useEffect(() => {
    if (isOpen && initialDate) {
      setFormData(prev => ({
        ...prev,
        practiceDate: format(initialDate, 'yyyy-MM-dd')
      }))
    }
  }, [isOpen, initialDate])

  // 編集データがある場合、フォームを初期化
  useEffect(() => {
    if (editData && isOpen) {
      setFormData({
        practiceDate: editData.date || format(new Date(), 'yyyy-MM-dd'),
        place: editData.place || '',
        note: editData.note || ''
      })
    } else if (!editData && isOpen) {
      // 新規作成時はデフォルト値にリセット
      setFormData({
        practiceDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        place: '',
        note: ''
      })
    }
  }, [editData, isOpen, initialDate])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('フォーム送信エラー:', error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習記録を編集' : '練習記録を追加'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
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

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                onClick={onClose}
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
