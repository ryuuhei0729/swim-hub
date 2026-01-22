import React from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale/ja'
import { BaseModal } from '@/components/ui'
import { TeamEvent, TeamAttendanceWithDetails } from '@swim-hub/shared/types'
import { TeamMember } from '@swim-hub/shared/utils/team'
import { AttendanceGroupingDisplay } from './AttendanceGroupingDisplay'

interface AttendanceStatusModalProps {
  isOpen: boolean
  event: TeamEvent | null
  attendanceData: TeamAttendanceWithDetails[]
  teamMembers: TeamMember[]
  loading: boolean
  onClose: () => void
}

export function AttendanceStatusModal({
  isOpen,
  event,
  attendanceData,
  teamMembers,
  loading,
  onClose
}: AttendanceStatusModalProps) {
  const formatEventDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMMM d日 (EEE)', { locale: ja })
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? `${formatEventDate(event.date)}の出欠状況` : ''}
      size="lg"
    >
      {loading ? (
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AttendanceGroupingDisplay
            attendanceData={attendanceData}
            teamMembers={teamMembers}
          />
        </div>
      )}
    </BaseModal>
  )
}
