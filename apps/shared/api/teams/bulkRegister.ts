// =============================================================================
// チームAPI - bulkRegister（一括登録）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { PracticeInsert, CompetitionInsert } from '../../types/database'

export interface BulkRegisterInput {
  practices: Array<{
    date: string
    place: string
    note: string | null
  }>
  competitions: Array<{
    title: string
    date: string
    end_date?: string | null // 終了日（複数日開催の場合）
    place: string
    pool_type: number
    note: string | null
  }>
}

export interface BulkRegisterResult {
  success: boolean
  practicesCreated: number
  competitionsCreated: number
  errors: string[]
}

export class TeamBulkRegisterAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * CompetitionとPracticeを一括登録
   */
  async bulkRegister(teamId: string, input: BulkRegisterInput): Promise<BulkRegisterResult> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) {
      throw new Error('認証が必要です')
    }

    // チーム管理者権限確認
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membershipError || !membership) {
      throw new Error('チームメンバーシップが見つかりません')
    }

    if (membership.role !== 'admin') {
      throw new Error('チーム管理者権限が必要です')
    }

    const errors: string[] = []
    let practicesCreated = 0
    let competitionsCreated = 0

    // Practiceを一括登録
    if (input.practices.length > 0) {
      try {
        const practiceInserts: PracticeInsert[] = input.practices.map(practice => ({
          user_id: user.id,
          date: practice.date,
          place: practice.place,
          note: practice.note,
          team_id: teamId
        }))

        const { data: practiceData, error: practiceError } = await this.supabase
          .from('practices')
          .insert(practiceInserts)
          .select('id')

        if (practiceError) {
          errors.push(`練習の登録に失敗しました: ${practiceError.message}`)
        } else {
          practicesCreated = practiceData?.length || 0
        }
      } catch (error) {
        errors.push(`練習の登録中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
      }
    }

    // Competitionを一括登録
    if (input.competitions.length > 0) {
      try {
        const competitionInserts: CompetitionInsert[] = input.competitions.map(competition => ({
          user_id: null,
          team_id: teamId,
          title: competition.title,
          date: competition.date,
          end_date: competition.end_date || null, // 終了日（複数日開催の場合）
          place: competition.place,
          pool_type: competition.pool_type,
          note: competition.note,
          entry_status: 'before'
        }))

        const { data: competitionData, error: competitionError } = await this.supabase
          .from('competitions')
          .insert(competitionInserts)
          .select('id')

        if (competitionError) {
          errors.push(`大会の登録に失敗しました: ${competitionError.message}`)
        } else {
          competitionsCreated = competitionData?.length || 0
        }
      } catch (error) {
        errors.push(`大会の登録中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
      }
    }

    return {
      success: errors.length === 0,
      practicesCreated,
      competitionsCreated,
      errors
    }
  }
}

