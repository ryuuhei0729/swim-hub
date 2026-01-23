'use client'

import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthProvider'
import { TeamRecordsAPI } from '@apps/shared/api/teams/records'
import { Button, Input, DatePicker } from '@/components/ui'
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
  const recordsAPI = useMemo(() => new TeamRecordsAPI(supabase), [supabase])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'), // ローカル日付のYYYY-MM-DD形式
    endDate: '', // 終了日（複数日開催の場合）
    place: '',
    poolType: 0, // プール種別（0: 短水路, 1: 長水路）
    note: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.date) {
      setError('日付は必須です')
      return
    }
    
    // 終了日が設定されている場合、開始日以降であることを確認
    if (formData.endDate && formData.endDate < formData.date) {
      setError('終了日は開始日以降の日付を指定してください')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('認証が必要です')

      const competitionInput: import('@swim-hub/shared/types').CompetitionInsert = {
        user_id: user.id,
        title: formData.title || null,
        date: formData.date,
        end_date: formData.endDate || null, // 終了日（空文字の場合はnull）
        place: formData.place || null,
        note: formData.note || null,
        pool_type: formData.poolType,
        team_id: teamId
      }
      await recordsAPI.create(competitionInput)
      
      onSuccess()
      onClose()
      
      // フォームをリセット
      setFormData({
        title: '',
        date: new Date().toISOString().split('T')[0],
        endDate: '',
        place: '',
        poolType: 0,
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
        date: format(new Date(), 'yyyy-MM-dd'),
        endDate: '',
        place: '',
        poolType: 0,
        note: ''
      })
      setError(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto" data-testid="team-competition-modal">
      <div className="flex items-center justify-center min-h-screen pt-4 px-0 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity z-10"
          onClick={handleClose}
        />

        <div className="relative z-20 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full" data-testid="team-competition-dialog">
          {/* ヘッダー */}
          <div className="bg-white px-3 py-3 sm:px-6 sm:py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg leading-6 font-medium text-gray-900">
                チーム大会を追加
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={loading}
                data-testid="team-competition-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-gray-600">
              チームの大会記録を作成します
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="team-competition-form">
            {/* エラー表示 */}
            {error && (
              <div className="rounded-md bg-red-50 p-4" data-testid="team-competition-error">
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

            {/* 大会名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                大会名
              </label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例: 県大会（空欄の場合は「大会」と表示）"
                data-testid="team-competition-title"
              />
            </div>

            {/* 大会日（開始日・終了日） */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div>
                <DatePicker
                  label="開始日"
                  value={formData.date}
                  onChange={(date) => setFormData({ ...formData, date })}
                  required
                />
              </div>
              <div>
                <DatePicker
                  label="終了日"
                  value={formData.endDate}
                  onChange={(date) => setFormData({ ...formData, endDate: date })}
                  minDate={formData.date ? new Date(formData.date) : undefined}
                  helperText="複数日の場合"
                />
              </div>
            </div>

            {/* 場所 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                場所
              </label>
              <Input
                type="text"
                value={formData.place}
                onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                placeholder="例: 県立プール"
                data-testid="team-competition-place"
              />
            </div>

            {/* プール種別 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                プール種別 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.poolType}
                onChange={(e) => setFormData({ ...formData, poolType: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                data-testid="team-competition-pool-type"
              >
                <option value={0}>短水路 (25m)</option>
                <option value={1}>長水路 (50m)</option>
              </select>
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
                placeholder="大会の詳細や注意事項など"
                data-testid="team-competition-note"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-2 sm:gap-3 pt-4 sm:pt-6 border-t">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={loading}
                data-testid="team-competition-cancel-button"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="team-competition-submit-button"
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

