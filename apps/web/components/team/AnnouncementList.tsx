'use client'

import { useState } from 'react'
import { useTeamAnnouncements, useDeleteTeamAnnouncement } from '@/hooks'
import type { TeamAnnouncement } from '@/types'

interface AnnouncementListProps {
  teamId: string
  isAdmin: boolean
  onCreateNew?: () => void
  onEdit?: (announcement: TeamAnnouncement) => void
  viewOnly?: boolean
}

export const AnnouncementList: React.FC<AnnouncementListProps> = ({
  teamId,
  isAdmin,
  onCreateNew,
  onEdit,
  viewOnly = false
}) => {
  const { announcements, loading, error, refetch } = useTeamAnnouncements(teamId)
  const { remove, loading: deleteLoading } = useDeleteTeamAnnouncement()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // viewOnlyの場合は公開済みのものだけをフィルタリング
  const filteredAnnouncements = viewOnly 
    ? announcements.filter((a: TeamAnnouncement) => a.isPublished)
    : announcements

  const handleDelete = async (id: string) => {
    if (!confirm('このお知らせを削除しますか？')) return
    
    try {
      setDeletingId(id)
      await remove(id)
      await refetch()
    } catch (error) {
      console.error('削除エラー:', error)
      alert('削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">お知らせの読み込みに失敗しました</p>
        <button 
          onClick={() => refetch()}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          再試行
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー（viewOnlyの場合は非表示） */}
      {!viewOnly && (
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">お知らせ</h2>
          {isAdmin && onCreateNew && (
            <button
              onClick={onCreateNew}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              新規作成
            </button>
          )}
        </div>
      )}

      {/* お知らせ一覧 */}
      {filteredAnnouncements.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>お知らせはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnnouncements.map((announcement) => (
            <div
              key={announcement.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-gray-900">
                      {announcement.title}
                    </h3>
                    {!announcement.isPublished && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                        下書き
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                    {announcement.content}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>作成: {formatDate(announcement.createdAt)}</span>
                    {announcement.publishedAt && (
                      <span>公開: {formatDate(announcement.publishedAt)}</span>
                    )}
                  </div>
                </div>
                
                {/* アクションボタン（viewOnlyの場合は非表示） */}
                {!viewOnly && (
                  <div className="flex gap-2 ml-4">
                    {isAdmin && onEdit && (
                      <button
                        onClick={() => onEdit(announcement)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        編集
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(announcement.id)}
                        disabled={deletingId === announcement.id || deleteLoading}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                      >
                        {deletingId === announcement.id ? '削除中...' : '削除'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
