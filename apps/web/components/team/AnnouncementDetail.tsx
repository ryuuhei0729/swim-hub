'use client'

import { useTeamAnnouncement, useDeleteTeamAnnouncement } from '@/hooks'
import type { TeamAnnouncement } from '@/types'

interface AnnouncementDetailProps {
  announcementId: string
  isAdmin: boolean
  onClose: () => void
  onEdit?: (announcement: TeamAnnouncement) => void
}

export const AnnouncementDetail: React.FC<AnnouncementDetailProps> = ({
  announcementId,
  isAdmin,
  onClose,
  onEdit
}) => {
  const { announcement, loading, error } = useTeamAnnouncement(announcementId)
  const { remove, loading: deleteLoading } = useDeleteTeamAnnouncement()

  const handleDelete = async () => {
    if (!announcement || !confirm('このお知らせを削除しますか？')) return
    
    try {
      await remove(announcement.id)
      onClose()
    } catch (error) {
      console.error('削除エラー:', error)
      alert('削除に失敗しました')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                disabled={deleteLoading}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteLoading ? '削除中...' : '削除'}
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
              {!announcement.isPublished && (
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                  下書き
                </span>
              )}
              <span>作成: {formatDate(announcement.createdAt)}</span>
              {announcement.publishedAt && (
                <span>公開: {formatDate(announcement.publishedAt)}</span>
              )}
              {announcement.updatedAt !== announcement.createdAt && (
                <span>更新: {formatDate(announcement.updatedAt)}</span>
              )}
            </div>
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
