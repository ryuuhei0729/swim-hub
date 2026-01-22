/**
 * RecordLogForm関連の型定義
 */

import { EntryInfo } from '@apps/shared/types/ui'

// SplitTimeRow型定義（editData用のcamelCase型）
export type SplitTimeRow = {
  distance: number
  splitTime: number
}

// フォーム内部状態用のスプリットタイム型
export interface SplitTimeDraft {
  distance: number | string
  splitTime: number
  splitTimeDisplayValue?: string
  uiKey?: string
}

// フォーム内部状態用
export interface RecordLogFormState {
  styleId: string
  time: number
  timeDisplayValue?: string
  isRelaying: boolean
  splitTimes: SplitTimeDraft[]
  note: string
  videoUrl?: string
  reactionTime: string
}

// 送信用
export interface RecordLogFormData {
  styleId: string
  time: number
  timeDisplayValue?: string
  isRelaying: boolean
  splitTimes: Array<{ distance: number; splitTime: number }>
  note: string
  videoUrl?: string
  reactionTime: string
}

export interface RecordLogEditData {
  id?: string
  styleId?: number
  time?: number
  isRelaying?: boolean
  splitTimes?: SplitTimeRow[]
  note?: string
  videoUrl?: string
  reactionTime?: number | null
}

export interface StyleOption {
  id: string | number
  nameJp: string
  distance: number
}

export interface RecordLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (dataList: RecordLogFormData[]) => Promise<void>
  competitionId: string
  competitionTitle?: string
  competitionDate?: string
  editData?: RecordLogEditData | null
  isLoading?: boolean
  styles?: StyleOption[]
  entryDataList?: EntryInfo[]
}
