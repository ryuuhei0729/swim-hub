// =============================================================================
// 練習ログテンプレートの型定義
// =============================================================================

/**
 * 練習ログテンプレートの基本型（DBテーブル構造に対応）
 */
export interface PracticeLogTemplate {
  id: string
  user_id: string
  name: string
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
  distance: number
  rep_count: number
  set_count: number
  circle: number | null
  note: string | null
  tag_ids: string[]
  is_favorite: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

/**
 * テンプレート作成用の入力型
 */
export interface CreatePracticeLogTemplateInput {
  name: string
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
  distance: number
  rep_count: number
  set_count: number
  circle?: number | null
  note?: string | null
  tag_ids?: string[]
}

/**
 * テンプレート更新用の入力型
 */
export type UpdatePracticeLogTemplateInput = Partial<
  Omit<CreatePracticeLogTemplateInput, 'user_id'>
>
