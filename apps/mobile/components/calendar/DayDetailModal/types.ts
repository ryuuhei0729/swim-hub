import type { CalendarItem } from '@apps/shared/types/ui'
import type { PracticeTime } from '@apps/shared/types'

// DayDetailModalのProps
export interface DayDetailModalProps {
  visible: boolean
  date: Date
  entries: CalendarItem[]
  onClose: () => void
  onEntryPress?: (item: CalendarItem) => void
  onAddPractice?: (date: Date) => void
  onAddRecord?: (dateOrCompetitionId: Date | string, dateParam?: string) => void
  onEditPractice?: (item: CalendarItem) => void
  onDeletePractice?: (itemId: string) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (item: CalendarItem) => void
  onDeletePracticeLog?: (logId: string) => void
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onEditEntry?: (item: CalendarItem) => void
  onDeleteEntry?: (entryId: string) => void
  onAddEntry?: (competitionId: string, date: string) => void
  onEditCompetition?: (item: CalendarItem) => void
  onDeleteCompetition?: (competitionId: string) => void
}

// PracticeLogDetailのProps
export interface PracticeLogDetailProps {
  item: CalendarItem
  title: string
  color: string
  typeLabel: string
  isPractice: boolean
  isPracticeLog: boolean
  practiceId: string
  hasEntriesOrRecords?: boolean
  onEntryPress?: (item: CalendarItem) => void
  onClose: () => void
  onEditPractice?: (item: CalendarItem) => void
  onDeletePractice?: (itemId: string) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (item: CalendarItem) => void
  onDeletePracticeLog?: (logId: string) => void
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onEditEntry?: (item: CalendarItem) => void
  onDeleteEntry?: (entryId: string) => void
  onAddEntry?: (competitionId: string, date: string) => void
  onEditCompetition?: (item: CalendarItem) => void
  onDeleteCompetition?: (competitionId: string) => void
  onPracticeTimeLoaded?: (practiceLogId: string, hasTimes: boolean) => void
}

// TimeTableのProps
export interface TimeTableProps {
  times: Array<{ id: string; time: number; repNumber: number; setNumber: number }>
  repCount: number
  setCount: number
}

// RecordDetailのProps
export interface RecordDetailProps {
  competitionId: string
  competitionName: string
  place?: string
  poolType?: number
  note?: string
  records: CalendarItem[]
  onEditCompetition?: () => void
  onDeleteCompetition?: () => void
  onAddRecord?: () => void
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onClose?: () => void
}

// EntryDetailのProps
export interface EntryDetailProps {
  competitionId: string
  competitionName: string
  place?: string
  poolType?: number
  note?: string
  entries: CalendarItem[]
  onEditCompetition?: (item: CalendarItem) => void
  onDeleteCompetition?: () => void
  onEditEntry?: (item: CalendarItem) => void
  onDeleteEntry?: (entryId: string) => void
  onAddRecord?: (competitionId: string, date: string) => void
  onClose?: () => void
}

// 練習ログの型
export interface PracticeLogData {
  id: string
  practiceId: string
  style: string
  repCount: number
  setCount: number
  distance: number
  circle: number | null
  note: string | null
  times: Array<{
    id: string
    time: number
    repNumber: number
    setNumber: number
  }>
}

// 練習ログ詳細の型
export interface PracticeLogDetailData {
  id: string
  style: string
  repCount: number
  setCount: number
  distance: number
  circle: number | null
  note: string | null
  times: Array<{ id: string; time: number; repNumber: number; setNumber: number }>
}

// 記録データの型
export interface RecordData {
  id: string
  styleName: string
  time: number
  reactionTime: number | null
  isRelaying: boolean
  note: string | null
  styleId: number
  styleDistance: number
}

// エントリーデータの型
export interface EntryData {
  id: string
  styleId: number
  styleName: string
  entryTime: number | null
  note: string | null
}

// 練習ログDBからの型
export interface PracticeLogFromDB {
  id: string
  practice_id: string
  style: string
  rep_count: number
  set_count: number
  distance: number
  circle: number | null
  note: string | null
  practice_times?: PracticeTime[]
}
