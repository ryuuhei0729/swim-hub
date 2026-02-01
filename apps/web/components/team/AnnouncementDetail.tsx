'use client'

import {
  useTeamAnnouncementQuery,
  useDeleteTeamAnnouncementMutation,
} from '@apps/shared/hooks/queries/announcements'
import { useAuth } from '@/contexts'
import type { TeamAnnouncement } from '@/types'
import { formatDateTime } from '@apps/shared/utils/date'

interface AnnouncementDetailProps {
  teamId: string
  announcementId: string
  isAdmin: boolean
  onClose: () => void
  onEdit?: (announcement: TeamAnnouncement) => void
}

export const AnnouncementDetail: React.FC<AnnouncementDetailProps> = ({
  teamId,
  announcementId,
  isAdmin,
  onClose,
  onEdit
}) => {
  const { supabase } = useAuth()
  const {
    data: announcement,
    isLoading: loading,
    error
  } = useTeamAnnouncementQuery(supabase, teamId, announcementId)
  const deleteAnnouncementMutation = useDeleteTeamAnnouncementMutation(supabase)

  const handleDelete = async () => {
    if (!announcement || !confirm('このお知らせを削除しますか？')) return
    
    try {
      await deleteAnnouncementMutation.mutateAsync({ id: announcement.id, teamId })
      onClose()
    } catch (error) {
      console.error('削除エラー:', error)
    }
  }


  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !announcement) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">お知らせの読み込みに失敗しました</p>
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">お知らせ詳細</h2>
          <div className="flex gap-2">
            {isAdmin && onEdit && (
              <button
                onClick={() => onEdit(announcement)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                編集
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleDelete}
                disabled={deleteAnnouncementMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteAnnouncementMutation.isPending ? '削除中...' : '削除'}
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* タイトル */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {announcement.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {!announcement.is_published && (
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                  下書き
                </span>
              )}
              <span>作成: {formatDateTime(announcement.created_at)}</span>
              {announcement.updated_at !== announcement.created_at && (
                <span>更新: {formatDateTime(announcement.updated_at)}</span>
              )}
            </div>
            
            {/* 表示期間 */}
            {(announcement.start_at || announcement.end_at) && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-1">表示期間</p>
                <div className="text-sm text-gray-600">
                  {announcement.start_at ? (
                    <span>開始: {formatDateTime(announcement.start_at)}</span>
                  ) : (
                    <span>開始: 制限なし</span>
                  )}
                  {announcement.start_at && announcement.end_at && <span className="mx-2">〜</span>}
                  {announcement.end_at ? (
                    <span>終了: {formatDateTime(announcement.end_at)}</span>
                  ) : (
                    <span>終了: 制限なし</span>
                  )}
                </div>
                {/* 期間外の場合は警告表示 */}
                {announcement.is_published && (() => {
                  const now = new Date()
                  const startAt = announcement.start_at ? new Date(announcement.start_at) : null
                  const endAt = announcement.end_at ? new Date(announcement.end_at) : null
                  const isOutOfPeriod = 
                    (startAt && startAt > now) || 
                    (endAt && endAt < now)
                  
                  return isOutOfPeriod ? (
                    <p className="text-xs text-orange-600 mt-1">
                      ⚠️ 現在は表示期間外です
                    </p>
                  ) : null
                })()}
              </div>
            )}
          </div>

          {/* 内容 */}
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
              {announcement.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
