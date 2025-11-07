'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import { useCreateTeamAnnouncement, useUpdateTeamAnnouncement } from '@apps/shared/hooks'
import type { TeamAnnouncement, CreateTeamAnnouncementInput, UpdateTeamAnnouncementInput } from '@/types'

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

  const { supabase } = useAuth()
  const { create, loading: createLoading } = useCreateTeamAnnouncement(supabase)
  const { update, loading: updateLoading } = useUpdateTeamAnnouncement(supabase)
  const isLoading = createLoading || updateLoading

  // 編集データがある場合はフォームに設定
  useEffect(() => {
    if (editData) {
      setTitle(editData.title)
      setContent(editData.content)
      setIsPublished(editData.is_published)
    } else {
      setTitle('')
      setContent('')
      setIsPublished(false)
    }
  }, [editData, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim() || !content.trim()) {
      console.error('タイトルと内容を入力してください')
      return
    }

    try {

      if (editData) {
        // 更新
        const input: UpdateTeamAnnouncementInput = {
          id: editData.id,
          title: title.trim(),
          content: content.trim(),
          isPublished
        }
        await update(editData.id, input)
      } else {
        // 新規作成
        const input: CreateTeamAnnouncementInput = {
          teamId,
          title: title.trim(),
          content: content.trim(),
          isPublished
        }
        await create(input)
      }

      onClose()
    } catch (error) {
      console.error('保存エラー:', error)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
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

          {/* 公開設定 */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isPublished"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isPublished" className="ml-2 text-sm text-gray-700">
              すぐに公開する
            </label>
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
  )
}
