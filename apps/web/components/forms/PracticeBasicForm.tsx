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
    date: format(validDate, 'yyyy-MM-dd'),
    place: '',
    note: ''
  })

  // フォーム初期化（編集データがある場合とない場合）
  useEffect(() => {
    if (isOpen) {
      const validDate = selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()
      
      if (editData) {
        // 編集モード: 既存データで初期化
        setFormData({
          date: editData.date || format(validDate, 'yyyy-MM-dd'),
          place: editData.place || '',
          note: editData.note || ''
        })
      } else {
        // 新規作成モード: デフォルト値で初期化
        setFormData({
          date: format(validDate, 'yyyy-MM-dd'),
          place: '',
          note: ''
        })
      }
    }
  }, [isOpen, selectedDate, editData])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション
    if (!formData.place.trim()) {
      alert('練習場所を入力してください')
      return
    }

    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習予定を編集' : '練習予定を作成'}
              </h3>
              <button
                type="button"
                onClick={onClose}
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
                className="bg-blue-600 hover:bg-blue-700"
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
