'use client'

import { useState } from 'react'
import { AnnouncementList } from './AnnouncementList'
import { AnnouncementForm } from './AnnouncementForm'
import { AnnouncementDetail } from './AnnouncementDetail'
import type { TeamAnnouncement } from '@apps/shared/types/team'

interface TeamAnnouncementsProps {
  teamId: string
  isAdmin: boolean
  viewOnly?: boolean
  hideEmptyMessage?: boolean
}

export const TeamAnnouncements: React.FC<TeamAnnouncementsProps> = ({
  teamId,
  isAdmin,
  viewOnly = false,
  hideEmptyMessage = false
}) => {
  const [showForm, setShowForm] = useState(false)
  const [_showDetail, setShowDetail] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<TeamAnnouncement | undefined>()
  const [viewingAnnouncementId, setViewingAnnouncementId] = useState<string | null>(null)

  const handleCreateNew = () => {
    setEditingAnnouncement(undefined)
    setShowForm(true)
  }

  const handleEdit = (announcement: TeamAnnouncement) => {
    setEditingAnnouncement(announcement)
    setShowForm(true)
  }

  const _handleViewDetail = (announcementId: string) => {
    setViewingAnnouncementId(announcementId)
    setShowDetail(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingAnnouncement(undefined)
  }

  const handleCloseDetail = () => {
    setShowDetail(false)
    setViewingAnnouncementId(null)
  }

  return (
    <>
      <AnnouncementList
        teamId={teamId}
        isAdmin={isAdmin}
        onCreateNew={handleCreateNew}
        onEdit={handleEdit}
        viewOnly={viewOnly}
        hideEmptyMessage={hideEmptyMessage}
      />

      {/* お知らせ作成・編集フォーム */}
      <AnnouncementForm
        isOpen={showForm}
        onClose={handleCloseForm}
        teamId={teamId}
        editData={editingAnnouncement}
      />

      {/* お知らせ詳細表示 */}
      {viewingAnnouncementId && (
        <AnnouncementDetail
          teamId={teamId}
          announcementId={viewingAnnouncementId}
          isAdmin={isAdmin}
          onClose={handleCloseDetail}
          onEdit={handleEdit}
        />
      )}
    </>
  )
}
