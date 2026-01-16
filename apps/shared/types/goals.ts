// =============================================================================
// 目標管理機能 型定義 - Swim Hub共通パッケージ
// =============================================================================

import { Competition, Style } from './database'

// =============================================================================
// 1. 基本型定義
// =============================================================================

// 大会目標
export interface Goal {
  id: string
  user_id: string
  competition_id: string
  style_id: number
  target_time: number
  start_time: number | null
  status: 'active' | 'achieved' | 'cancelled'
  achieved_at: string | null
  created_at: string
  updated_at: string
}

export type GoalInsert = Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'achieved_at'>
export type GoalUpdate = Partial<Omit<GoalInsert, 'user_id'>> & {
  achieved_at?: string | null
}

// マイルストーン
export interface Milestone {
  id: string
  goal_id: string
  title: string
  type: 'time' | 'reps_time' | 'set'
  params: MilestoneParams
  deadline: string | null
  status: MilestoneStatus
  achieved_at: string | null
  reflection_done: boolean
  reflection_note: string | null
  created_at: string
  updated_at: string
}

export type MilestoneStatus = 'not_started' | 'in_progress' | 'achieved' | 'expired'

export type MilestoneInsert = Omit<Milestone, 'id' | 'created_at' | 'updated_at' | 'achieved_at' | 'reflection_done' | 'reflection_note'>
export type MilestoneUpdate = Partial<Omit<MilestoneInsert, 'goal_id'>> & {
  achieved_at?: string | null
  reflection_done?: boolean
  reflection_note?: string | null
}

// マイルストーンパラメータ（Union型）
export type MilestoneParams = 
  | MilestoneTimeParams 
  | MilestoneRepsTimeParams 
  | MilestoneSetParams

export interface MilestoneTimeParams {
  distance: number
  target_time: number
  style: string
}

export interface MilestoneRepsTimeParams {
  distance: number
  reps: number
  sets: number
  target_average_time: number
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
  circle: number
}

export interface MilestoneSetParams {
  distance: number
  reps: number
  sets: number
  circle: number
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
}

// 達成記録
export interface MilestoneAchievement {
  id: string
  milestone_id: string
  practice_log_id: string | null
  record_id: string | null
  achieved_value: Record<string, unknown> // JSONB型
  achieved_at: string
}

export type MilestoneAchievementInsert = Omit<MilestoneAchievement, 'id' | 'achieved_at'>

// =============================================================================
// 2. JOINされた型定義
// =============================================================================

// 大会目標 with 大会・種目・マイルストーン
export interface GoalWithMilestones extends Goal {
  competition: Competition
  style: Style
  milestones: Milestone[]
}

// マイルストーン with 目標
export interface MilestoneWithGoal extends Milestone {
  goal: Goal & {
    competition: Competition
    style: Style
  }
}

// =============================================================================
// 3. 型ガード関数
// =============================================================================

export function isMilestoneTimeParams(params: MilestoneParams): params is MilestoneTimeParams {
  return 'target_time' in params && !('target_average_time' in params) && !('sets' in params && 'circle' in params && !('target_average_time' in params))
}

export function isMilestoneRepsTimeParams(params: MilestoneParams): params is MilestoneRepsTimeParams {
  return 'target_average_time' in params && 'reps' in params
}

export function isMilestoneSetParams(params: MilestoneParams): params is MilestoneSetParams {
  return 'sets' in params && 'circle' in params && !('target_average_time' in params)
}

// =============================================================================
// 4. フォーム用型定義（camelCase）
// =============================================================================

export interface CreateGoalInput {
  userId: string
  competitionId?: string // 既存の大会IDまたはundefined
  competitionData?: {
    title: string
    date: string
    place: string | null
    poolType: number
  }
  styleId: number
  targetTime: number
  startTime?: number | null
}

export interface UpdateGoalInput {
  id: string
  competitionId?: string
  styleId?: number
  targetTime?: number
  startTime?: number | null
  status?: 'active' | 'achieved' | 'cancelled'
}

export interface CreateMilestoneInput {
  goalId: string
  title: string
  type: 'time' | 'reps_time' | 'set'
  params: MilestoneParams
  deadline?: string | null
}

export interface UpdateMilestoneInput {
  id: string
  type?: 'time' | 'reps_time' | 'set'
  title?: string
  params?: MilestoneParams
  deadline?: string | null
  reflectionNote?: string | null
}
