import type { CalendarItem, CalendarItemType } from '@/types'
import type { GalleryImage } from '@/components/ui/ImageGallery'
import type {
  Record,
  PracticeLogWithTimes,
  PracticeTag,
  PracticeLogTemplate
} from '@apps/shared/types'

// 削除確認の型
export interface DeleteConfirmState {
  id: string
  type: CalendarItemType
  competitionId?: string
}

// 出欠モーダルの状態型
export interface AttendanceModalState {
  eventId: string
  eventType: 'practice' | 'competition'
  teamId: string
}

// PracticeDetailsのProps
export interface PracticeDetailsProps {
  practiceId: string
  place?: string
  practiceLogUpdateKey?: string
  onEdit?: (images?: GalleryImage[]) => void
  onDelete?: () => void
  onAddPracticeLog?: (practiceId: string) => void
  onAddPracticeLogFromTemplate?: (practiceId: string, template: PracticeLogTemplate) => void
  onEditPracticeLog?: (log: PracticeLogWithTimes & { tags?: PracticeTag[] }) => void
  onDeletePracticeLog?: (logId: string) => void
  isTeamPractice?: boolean
  teamId?: string | null
  teamName?: string | undefined
  onShowAttendance?: () => void
}

// CompetitionDetailsのProps
export interface CompetitionDetailsProps {
  competitionId: string
  competitionName?: string
  place?: string
  poolType?: number
  note?: string
  records?: CalendarItem[]
  onEdit?: (images?: GalleryImage[]) => void
  onDelete?: () => void
  onAddRecord?: (params: { competitionId?: string; entryData?: { styleId: number; styleName: string } }) => void
  onEditRecord?: (record: Record) => void
  onDeleteRecord?: (recordId: string) => void
  onClose?: () => void
  isTeamCompetition?: boolean
  teamId?: string | null
  teamName?: string | undefined
  onShowAttendance?: () => void
}

// RecordSplitTimesのProps
export interface RecordSplitTimesProps {
  recordId: string
  raceDistance?: number
  recordTime?: number
}

// CompetitionWithEntryのProps
export interface CompetitionWithEntryProps {
  entryId: string
  competitionId: string
  competitionName: string
  place?: string
  note?: string
  styleId?: number
  styleName: string
  entryTime?: number | null
  isTeamCompetition?: boolean
  deletedEntryIds?: string[]
  onAddRecord?: (params: {
    competitionId?: string
    entryData?: { styleId: number; styleName: string }
    entryDataList?: Array<{ styleId: number; styleName: string; entryTime?: number }>
  }) => void
  onEditCompetition?: (images?: GalleryImage[]) => void
  onDeleteCompetition?: () => void
  onEditEntry?: () => void
  onDeleteEntry?: (entryId: string) => void
  onClose?: () => void
}

// AttendanceModalのProps
export interface AttendanceModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  eventType: 'practice' | 'competition'
  teamId: string
}

// AttendanceButtonのProps
export interface AttendanceButtonProps {
  onClick: () => void
}

// DeleteConfirmModalのProps
export interface DeleteConfirmModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
}

// エントリー表示用の型
export interface CompetitionEntryDisplay {
  id: string
  styleId: number
  styleName: string
  entryTime?: number | null
  note?: string | null
}

// フォーマット済み練習ログ型
export interface FormattedPracticeLog {
  id: string
  practiceId: string
  style: string
  swim_category?: 'Swim' | 'Pull' | 'Kick'
  repCount: number
  setCount: number
  distance: number
  circle: number | null
  note: string | null
  tags: PracticeTag[]
  times: Array<{
    id: string
    time: number
    repNumber: number
    setNumber: number
  }>
  created_at?: string
  updated_at?: string
}
