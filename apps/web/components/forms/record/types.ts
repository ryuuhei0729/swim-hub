/**
 * RecordForm関連の型定義
 */

export interface SplitTimeInput {
  distance: number | ''
  splitTime: number
  splitTimeDisplayValue?: string
  /** UI安定化用のキー（サーバー送信時には除去） */
  uiKey?: string
}

export interface RecordSet {
  id: string
  styleId: string
  time: number
  timeDisplayValue?: string
  isRelaying: boolean
  splitTimes: SplitTimeInput[]
  note: string
  videoUrl?: string
  reactionTime: string
}

export interface RecordFormData {
  recordDate: string
  place: string
  competitionName: string
  poolType: number // 0: short, 1: long
  records: RecordSet[]
  note: string
}

export interface SwimStyle {
  id: string
  nameJp: string
  distance: number
}

// 編集データ用の型
export type EditSplitTime = {
  distance: number
  splitTime: number
}

export type EditRecord = {
  id?: string
  styleId?: string
  time?: number
  isRelaying?: boolean
  splitTimes?: EditSplitTime[]
  note?: string
  videoUrl?: string
  reactionTime?: number | null
}

export type EditData = {
  recordDate?: string
  place?: string
  competitionName?: string
  poolType?: number
  note?: string
  records?: EditRecord[]
  // 単一レコード編集ケースのためのフィールド
  id?: string
  styleId?: string
  time?: number
  isRelaying?: boolean
  splitTimes?: EditSplitTime[]
  videoUrl?: string
  reactionTime?: number | null
}

export interface RecordFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: RecordFormData) => Promise<void>
  initialDate?: Date
  editData?: EditData
  isLoading?: boolean
  styles?: SwimStyle[]
}

export const POOL_TYPES = [
  { value: 0, label: '短水路 (25m)' },
  { value: 1, label: '長水路 (50m)' },
] as const
