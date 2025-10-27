'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { TeamAPI } from '@apps/shared/api/teams'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface TeamPracticeFormProps {
  isOpen: boolean
  onClose: () => void
  teamId: string
  onSuccess: () => void
}

export default function TeamPracticeForm({ 
  isOpen, 
  onClose, 
  teamId, 
  onSuccess 
}: TeamPracticeFormProps) {
  const { supabase } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD形式
    place: '',
    note: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.date) {
      setError('日付は必須です')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const teamAPI = new TeamAPI(supabase)
      
      // チーム練習記録を作成（team_idを自動で設定）
      await teamAPI.createTeamPractice(teamId, {
        date: formData.date,
        place: formData.place || null,
        note: formData.note || null
      })
      
      onSuccess()
      onClose()
      
      // フォームをリセット
      setFormData({
        date: new Date().toISOString().split('T')[0],
        place: '',
        note: ''
      })
    } catch (err) {
      console.error('チーム練習記録作成エラー:', err)
      setError(err instanceof Error ? err.message : 'チーム練習記録の作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
      // フォームをリセット
      setFormData({
        date: new Date().toISOString().split('T')[0],
        place: '',
        note: ''
      })
      setError(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
        />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                チーム練習記録を追加
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={loading}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              チームの練習記録を作成します
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* エラー表示 */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      エラーが発生しました
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 練習日 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                練習日 <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            {/* 練習場所 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                練習場所
              </label>
              <Input
                type="text"
                value={formData.place}
                onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                placeholder="例: 市営プール、学校プール"
              />
            </div>

            {/* メモ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メモ
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="練習内容や感想など"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={loading}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? '作成中...' : '作成'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
