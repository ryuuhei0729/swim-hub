// =============================================================================
// 目標管理機能 定数定義
// =============================================================================

import type { MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'

// プール種別
export const POOL_TYPES = [
  { value: 0, label: '短水路 (25m)' },
  { value: 1, label: '長水路 (50m)' }
] as const

// 泳法
export const SWIM_STYLES = [
  { value: 'Fr', label: '自由形' },
  { value: 'Ba', label: '背泳ぎ' },
  { value: 'Br', label: '平泳ぎ' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' }
] as const

// Swim/Pull/Kick
export const SWIM_CATEGORIES = [
  { value: 'Swim', label: 'Swim' },
  { value: 'Pull', label: 'Pull' },
  { value: 'Kick', label: 'Kick' }
] as const

// マイルストーンパラメータ初期値
export const DEFAULT_TIME_PARAMS: MilestoneTimeParams = {
  distance: 50,
  target_time: 30.0,
  style: 'Fr',
  swim_category: 'Swim'
}

export const DEFAULT_REPS_TIME_PARAMS: MilestoneRepsTimeParams = {
  distance: 50,
  reps: 10,
  sets: 1,
  target_average_time: 30.0,
  style: 'Fr',
  swim_category: 'Swim',
  circle: 45
}

export const DEFAULT_SET_PARAMS: MilestoneSetParams = {
  distance: 200,
  reps: 4,
  sets: 3,
  circle: 140,
  style: 'Fr',
  swim_category: 'Swim'
}
