'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { TeamAPI } from '@apps/shared/api/teams'
import { BaseModal } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface TeamCompetitionFormProps {
  isOpen: boolean
  onClose: () => void
  teamId: string
  onSuccess: () => void
}

export default function TeamCompetitionForm({ 
  isOpen, 
  onClose, 
  teamId, 
  onSuccess 
}: TeamCompetitionFormProps) {
  const { supabase } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD形式
    place: '',
    note: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !formData.date) {
      setError('大会名と日付は必須です')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const teamAPI = new TeamAPI(supabase)
      
      // チーム大会を作成（team_idを自動で設定）
      await teamAPI.createTeamCompetition(teamId, {
        title: formData.title,
        date: formData.date,
        place: formData.place || null,
        note: formData.note || null
      })
      
      onSuccess()
      onClose()
      
      // フォームをリセット
      setFormData({
        title: '',
        date: new Date().toISOString().split('T')[0],
        place: '',
        note: ''
      })
    } catch (err) {
      console.error('チーム大会作成エラー:', err)
      setError(err instanceof Error ? err.message : 'チーム大会の作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
      // フォームをリセット
      setFormData({
        title: '',
        date: new Date().toISOString().split('T')[0],
        place: '',
        note: ''
      })
      setError(null)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="w-full max-w-md mx-auto p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            チーム大会追加
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={loading}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
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

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 大会名 */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              大会名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="例: 県大会"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={loading}
            />
          </div>

          {/* 日付 */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              日付 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              disabled={loading}
            />
          </div>

          {/* 場所 */}
          <div>
            <label htmlFor="place" className="block text-sm font-medium text-gray-700 mb-2">
              場所
            </label>
            <input
              type="text"
              id="place"
              value={formData.place}
              onChange={(e) => setFormData(prev => ({ ...prev, place: e.target.value }))}
              placeholder="例: 県立プール"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
          </div>

          {/* メモ */}
          <div>
            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
              メモ
            </label>
            <textarea
              id="note"
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              placeholder="大会の詳細や注意事項など"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
          </div>

          {/* ボタン */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </BaseModal>
  )
}

