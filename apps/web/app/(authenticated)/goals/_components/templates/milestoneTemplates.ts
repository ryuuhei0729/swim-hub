import type { MilestoneParams, MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'

export interface MilestoneTemplate {
  id: string
  name: string
  description: string
  type: 'time' | 'reps_time' | 'set'
  category: 'sprint' | 'middle' | 'long' | 'endurance'
  defaultParams: MilestoneParams
}

export const MILESTONE_TEMPLATES: MilestoneTemplate[] = [
  // スプリント系
  {
    id: 'sprint_50m_single',
    name: '50mタイムトライアル',
    description: '50m×1本の目標タイム達成',
    type: 'time',
    category: 'sprint',
    defaultParams: {
      distance: 50,
      target_time: 30.0,
      style: 'Fr'
    } as MilestoneTimeParams
  },
  {
    id: 'sprint_50m_reps',
    name: '50m×10本平均',
    description: '50m×10本の平均タイム達成',
    type: 'reps_time',
    category: 'sprint',
    defaultParams: {
      distance: 50,
      reps: 10,
      sets: 1,
      target_average_time: 35.0,
      style: 'Fr',
      swim_category: 'Swim',
      circle: 60
    } as MilestoneRepsTimeParams
  },
  // 中距離系
  {
    id: 'middle_100m_single',
    name: '100mタイムトライアル',
    description: '100m×1本の目標タイム達成',
    type: 'time',
    category: 'middle',
    defaultParams: {
      distance: 100,
      target_time: 60.0,
      style: 'Fr'
    } as MilestoneTimeParams
  },
  {
    id: 'middle_100m_reps',
    name: '100m×5本平均',
    description: '100m×5本の平均タイム達成',
    type: 'reps_time',
    category: 'middle',
    defaultParams: {
      distance: 100,
      reps: 5,
      sets: 1,
      target_average_time: 70.0,
      style: 'Fr',
      swim_category: 'Swim',
      circle: 120
    } as MilestoneRepsTimeParams
  },
  // 長距離・持久力系
  {
    id: 'endurance_200m_set',
    name: '200m×4本×3セット完遂',
    description: '200m×4本×3セットの完遂',
    type: 'set',
    category: 'endurance',
    defaultParams: {
      distance: 200,
      reps: 4,
      sets: 3,
      circle: 140,
      style: 'Fr',
      swim_category: 'Swim'
    } as MilestoneSetParams
  },
  {
    id: 'endurance_400m_reps',
    name: '400m×4本平均',
    description: '400m×4本の平均タイム達成',
    type: 'reps_time',
    category: 'endurance',
    defaultParams: {
      distance: 400,
      reps: 4,
      sets: 1,
      target_average_time: 300.0,
      style: 'Fr',
      swim_category: 'Swim',
      circle: 360
    } as MilestoneRepsTimeParams
  }
]
