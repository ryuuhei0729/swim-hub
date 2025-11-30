'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import {
  useCreateTeamAnnouncementMutation,
  useUpdateTeamAnnouncementMutation,
} from '@apps/shared/hooks/queries/announcements'
import type { TeamAnnouncement } from '@/types'

interface AnnouncementFormProps {
  isOpen: boolean
  onClose: () => void
  teamId: string
  editData?: TeamAnnouncement
}

export const AnnouncementForm: React.FC<AnnouncementFormProps> = ({
  isOpen,
  onClose,
  teamId,
  editData
}) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [startAt, setStartAt] = useState<string>('')
  const [endAt, setEndAt] = useState<string>('')
  const [errors, setErrors] = useState<{ startAt?: string; endAt?: string }>({})

  const { supabase } = useAuth()
  const createAnnouncementMutation = useCreateTeamAnnouncementMutation(supabase)
  const updateAnnouncementMutation = useUpdateTeamAnnouncementMutation(supabase)
  const isLoading = createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending

  // ローカル時刻をdatetime-local形式に変換するヘルパー関数
  const formatLocalDateTime = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // 編集データがある場合はフォームに設定
  useEffect(() => {
    if (editData) {
      setTitle(editData.title)
      setContent(editData.content)
      setIsPublished(editData.is_published)
      // start_atとend_atをdatetime-local形式に変換（ローカル時刻で表示）
      setStartAt(editData.start_at ? formatLocalDateTime(new Date(editData.start_at)) : '')
      setEndAt(editData.end_at ? formatLocalDateTime(new Date(editData.end_at)) : '')
    } else {
      setTitle('')
      setContent('')
      setIsPublished(false)
      // デフォルト値: 現在時刻から1週間後まで（ローカル時刻）
      const now = new Date()
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      setStartAt(formatLocalDateTime(now))
      setEndAt(formatLocalDateTime(oneWeekLater))
    }
    setErrors({})
  }, [editData, isOpen])

  const validateDates = (): boolean => {
    const newErrors: { startAt?: string; endAt?: string } = {}
    const now = new Date()

    // end_atのバリデーション
    if (endAt) {
      const endDate = new Date(endAt)
      if (endDate < now) {
        newErrors.endAt = '表示終了日時は現在時刻より後の日時を指定してください'
      }
    }

    // start_atとend_atの両方が設定されている場合のバリデーション
    if (startAt && endAt) {
      const startDate = new Date(startAt)
      const endDate = new Date(endAt)
      if (endDate < startDate) {
        newErrors.endAt = '表示終了日時は表示開始日時より後の日時を指定してください'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim() || !content.trim()) {
      console.error('タイトルと内容を入力してください')
      return
    }

    // 日時のバリデーション
    if (!validateDates()) {
      return
    }

    try {
      const startAtValue = startAt ? new Date(startAt).toISOString() : null
      const endAtValue = endAt ? new Date(endAt).toISOString() : null

      if (editData) {
        // 更新
        await updateAnnouncementMutation.mutateAsync({
          id: editData.id,
          input: {
          title: title.trim(),
          content: content.trim(),
            is_published: isPublished,
            start_at: startAtValue,
            end_at: endAtValue,
        }
        })
      } else {
        // 新規作成
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')
        
        await createAnnouncementMutation.mutateAsync({
          team_id: teamId,
          title: title.trim(),
          content: content.trim(),
          is_published: isPublished,
          start_at: startAtValue,
          end_at: endAtValue,
          created_by: user.id,
        })
      }

      onClose()
    } catch (error) {
      console.error('保存エラー:', error)
      // API側のバリデーションエラーを表示
      if (error instanceof Error) {
        setErrors({ endAt: error.message })
      }
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* オーバーレイ */}
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={handleClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-6 py-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {editData ? 'お知らせを編集' : '新しいお知らせ'}
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* タイトル */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="お知らせのタイトルを入力"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/100</p>
          </div>

          {/* 内容 */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
              内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isLoading}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="お知らせの内容を入力"
              maxLength={2000}
            />
            <p className="text-xs text-gray-500 mt-1">{content.length}/2000</p>
          </div>

          {/* 公開状態 */}
          <div className="space-y-3 border-t border-gray-200 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                公開状態
              </label>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
            <input
                    type="radio"
                    name="publishStatus"
              checked={isPublished}
                    onChange={() => setIsPublished(true)}
                    disabled={isLoading}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    <span className="font-medium">公開する</span>
                    <span className="text-gray-500 ml-1">（メンバーに表示されます）</span>
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="publishStatus"
                    checked={!isPublished}
                    onChange={() => setIsPublished(false)}
                    disabled={isLoading}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    <span className="font-medium">下書きとして保存</span>
                    <span className="text-gray-500 ml-1">（管理者のみ表示されます）</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* 表示期間設定 */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 表示開始日時 */}
              <div>
                <label htmlFor="startAt" className="block text-sm font-medium text-gray-700 mb-1">
                  開始日時
                </label>
                <input
                  type="datetime-local"
                  id="startAt"
                  value={startAt}
                  onChange={(e) => {
                    setStartAt(e.target.value)
                    setErrors({ ...errors, startAt: undefined })
                  }}
              disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
              </div>

              {/* 表示終了日時 */}
              <div>
                <label htmlFor="endAt" className="block text-sm font-medium text-gray-700 mb-1">
                  終了日時
            </label>
                <input
                  type="datetime-local"
                  id="endAt"
                  value={endAt}
                  onChange={(e) => {
                    setEndAt(e.target.value)
                    setErrors({ ...errors, endAt: undefined })
                  }}
                  disabled={isLoading}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                    errors.endAt ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
            </div>
            {errors.endAt && (
              <p className="text-xs text-red-500">{errors.endAt}</p>
            )}
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading || !title.trim() || !content.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '保存中...' : editData ? '更新' : '作成'}
            </button>
          </div>
        </form>
          </div>
        </div>
      </div>
    </div>
  )
}
