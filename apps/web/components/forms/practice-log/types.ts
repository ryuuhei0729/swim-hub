/**
 * PracticeLogForm関連の型定義
 */

import { PracticeTag } from '@apps/shared/types'
import type { TimeEntry } from '@apps/shared/types/ui'

export type Tag = PracticeTag

export interface PracticeMenu {
  id: string
  style: string
  swimCategory: 'Swim' | 'Pull' | 'Kick'
  distance: number | ''
  reps: number | ''
  sets: number | ''
  circleMin: number | ''
  circleSec: number | ''
  note: string
  tags: Tag[]
  times: TimeEntry[]
}

export interface PracticeLogSubmitData {
  style: string
  swimCategory: 'Swim' | 'Pull' | 'Kick'
  distance: number
  reps: number
  sets: number
  circleTime: number | null
  note: string
  tags: Tag[]
  times: TimeEntry[]
}

export interface PracticeLogEditData {
  id?: string
  style?: string
  swim_category?: 'Swim' | 'Pull' | 'Kick'
  distance?: number
  rep_count?: number
  set_count?: number
  circle?: number | null
  note?: string | null
  tags?: Tag[]
  times?: Array<{
    memberId: string
    times: TimeEntry[]
  }>
}

export interface PracticeLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PracticeLogSubmitData[]) => Promise<void>
  practiceId: string
  editData?: PracticeLogEditData | null
  isLoading?: boolean
  availableTags: Tag[]
  setAvailableTags: (tags: Tag[] | ((prev: Tag[]) => Tag[])) => void
  styles?: Array<{ id: string | number; name_jp: string; distance: number }>
}

// 種目の選択肢
export const SWIM_STYLES = [
  { value: 'Fr', label: '自由形' },
  { value: 'Ba', label: '背泳ぎ' },
  { value: 'Br', label: '平泳ぎ' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' },
] as const

// 泳法カテゴリの選択肢
export const SWIM_CATEGORIES = [
  { value: 'Swim', label: 'Swim' },
  { value: 'Pull', label: 'Pull' },
  { value: 'Kick', label: 'Kick' },
] as const
