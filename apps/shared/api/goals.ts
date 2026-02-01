// =============================================================================
// 目標管理API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { format, parseISO, isValid, startOfDay } from 'date-fns'
import {
  CompetitionInsert
} from '../types'
import { normalizeRelation, normalizeRelationArray } from '../utils/supabase-helpers'
import {
  CreateGoalInput,
  CreateMilestoneInput,
  Goal,
  GoalInsert,
  GoalUpdate,
  GoalWithMilestones,
  Milestone,
  MilestoneInsert,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  MilestoneStatus,
  MilestoneTimeParams,
  MilestoneUpdate,
  UpdateGoalInput,
  UpdateMilestoneInput
} from '../types/goals'
import type { Competition, Style } from '../types'

// Supabaseクエリ結果の型（配列/単一オブジェクトの不整合に対応）
interface GoalQueryResult extends Goal {
  competition?: Competition | Competition[]
  style?: Style | Style[]
  milestones?: Milestone | Milestone[]
}

// スタイルコード→日本語名のマッピング（practice_logsは日本語名で格納されている）
const STYLE_CODE_TO_JAPANESE: Record<string, string> = {
  fr: '自由形',
  ba: '背泳ぎ',
  br: '平泳ぎ',
  fly: 'バタフライ',
  im: '個人メドレー'
}

/**
 * スタイルコードを日本語名に変換
 * practice_logsのstyleカラムは日本語名で格納されているため、クエリ時に変換が必要
 */
function getStyleJapanese(styleCode: string): string {
  return STYLE_CODE_TO_JAPANESE[styleCode.toLowerCase()] || styleCode
}

export class GoalAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 大会目標の操作
  // =========================================================================

  /**
   * 大会目標作成
   * 既存の大会IDまたは新規大会作成に対応
   */
  async createGoal(input: CreateGoalInput): Promise<Goal> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    let competitionId = input.competitionId

    // 大会が未作成の場合は新規作成
    if (!competitionId && input.competitionData) {
      const competitionInsert: CompetitionInsert = {
        user_id: user.id,
        title: input.competitionData.title,
        date: input.competitionData.date,
        place: input.competitionData.place,
        pool_type: input.competitionData.poolType,
        entry_status: 'before',
        note: null
      }

      const { data: competition, error: compError } = await this.supabase
        .from('competitions')
        .insert(competitionInsert)
        .select()
        .single()

      if (compError) throw compError
      competitionId = competition.id
    }

    if (!competitionId) {
      throw new Error('大会IDまたは大会情報が必要です')
    }

    // ベストタイムを取得（startTimeが指定されていない場合）
    let startTime = input.startTime
    if (startTime === undefined) {
      startTime = await this.getBestTimeForStyle(user.id, input.styleId)
    }

    const goalInsert: GoalInsert = {
      user_id: user.id,
      competition_id: competitionId,
      style_id: input.styleId,
      target_time: input.targetTime,
      start_time: startTime,
      status: 'active'
    }

    const { data, error } = await this.supabase
      .from('goals')
      .insert(goalInsert)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 大会目標一覧取得
   */
  async getGoals(
    filters?: {
      status?: 'active' | 'achieved' | 'cancelled'
      competitionId?: string
    }
  ): Promise<Goal[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    let query = this.supabase
      .from('goals')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.competitionId) {
      query = query.eq('competition_id', filters.competitionId)
    }

    const { data, error } = await query

    if (error) throw error
    
    // レスポンスの型変換（Supabaseの配列/単一オブジェクトの不整合に対応）
    if (!data) return []

    return (data as GoalQueryResult[]).map((item) => {
      // Goal型の基本フィールドのみを返す（competitionとstyleは別途取得）
      const { competition: _comp, style: _style, ...goalData } = item
      return goalData as Goal
    })
  }

  /**
   * 大会目標詳細取得（マイルストーン含む）
   */
  async getGoalWithMilestones(goalId: string): Promise<GoalWithMilestones | null> {
    const { data, error } = await this.supabase
      .from('goals')
      .select(`
        *,
        competition:competitions(*),
        style:styles(*),
        milestones(*)
      `)
      .eq('id', goalId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // レコードが見つからない
      throw error
    }

    // レスポンスの型変換（Supabaseの配列/単一オブジェクトの不整合に対応）
    const goal = data as GoalQueryResult
    const competition = normalizeRelation(goal.competition)
    const style = normalizeRelation(goal.style)
    const milestones = normalizeRelationArray(goal.milestones)

    return {
      ...goal,
      competition,
      style,
      milestones
    } as GoalWithMilestones
  }

  /**
   * 大会目標更新
   */
  async updateGoal(goalId: string, updates: Omit<UpdateGoalInput, 'id'>): Promise<Goal> {
    const updateData: GoalUpdate = {}
    
    if (updates.competitionId !== undefined) {
      updateData.competition_id = updates.competitionId
    }
    if (updates.styleId !== undefined) {
      updateData.style_id = updates.styleId
    }
    if (updates.targetTime !== undefined) {
      updateData.target_time = updates.targetTime
    }
    if (updates.startTime !== undefined) {
      updateData.start_time = updates.startTime
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status
      if (updates.status === 'achieved') {
        updateData.achieved_at = new Date().toISOString()
      }
    }

    const { data, error } = await this.supabase
      .from('goals')
      .update(updateData)
      .eq('id', goalId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * 大会目標削除
   */
  async deleteGoal(goalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('goals')
      .delete()
      .eq('id', goalId)

    if (error) throw error
  }

  /**
   * 種目ごとのベストタイム取得
   * @private
   */
  private async getBestTimeForStyle(userId: string, styleId: number): Promise<number | null> {
    const { data, error } = await this.supabase
      .from('records')
      .select('time')
      .eq('user_id', userId)
      .eq('style_id', styleId)
      .order('time', { ascending: true })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // レコードが見つからない
      throw error
    }

    return data?.time || null
  }

  /**
   * 大会目標の達成率を計算
   * 差分ベース: (初期タイム - 最新ベスト) / (初期タイム - 目標タイム)
   */
  async calculateGoalProgress(goalId: string): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data: goal, error: goalError } = await this.supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single()

    if (goalError || !goal) {
      return 0
    }

    if (!goal.start_time) {
      return 0 // 初期タイムがない場合は0%
    }

    // 最新ベストタイムを取得
    const currentBest = await this.getBestTimeForStyle(user.id, goal.style_id)
    if (!currentBest) {
      return 0
    }

    const improvement = goal.start_time - currentBest
    const targetImprovement = goal.start_time - goal.target_time

    if (targetImprovement <= 0) {
      return 0 // 目標が初期タイム以下の場合
    }

    const progress = (improvement / targetImprovement) * 100
    return Math.min(Math.max(progress, 0), 100) // 0-100%にクランプ
  }

  // =========================================================================
  // マイルストーンの操作
  // =========================================================================

  /**
   * マイルストーン作成
   */
  async createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
    const milestoneInsert: MilestoneInsert = {
      goal_id: input.goalId,
      title: input.title,
      type: input.type,
      params: input.params,
      deadline: input.deadline || null,
      status: 'not_started'
    }

    const { data, error } = await this.supabase
      .from('milestones')
      .insert(milestoneInsert)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * マイルストーン一覧取得
   */
  async getMilestones(
    goalId: string,
    filters?: {
      status?: MilestoneStatus | MilestoneStatus[]
      deadlineAfter?: string // この日付以降のdeadlineのみ（期限切れ除外）。deadlineがnullの場合は常に含める
    }
  ): Promise<Milestone[]> {
    let query = this.supabase
      .from('milestones')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        // 複数ステータス対応
        query = query.in('status', filters.status)
      } else {
        // 単一ステータス（後方互換性のため）
        query = query.eq('status', filters.status)
      }
    }

    if (filters?.deadlineAfter) {
      // deadline >= deadlineAfter または deadline IS NULL
      // Supabaseでは .or() を使用
      query = query.or(`deadline.gte.${filters.deadlineAfter},deadline.is.null`)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }

  /**
   * マイルストーン更新
   */
  async updateMilestone(milestoneId: string, updates: Omit<UpdateMilestoneInput, 'id'>): Promise<Milestone> {
    const updateData: MilestoneUpdate = {}
    
    if (updates.type !== undefined) {
      updateData.type = updates.type
    }
    if (updates.title !== undefined) {
      updateData.title = updates.title
    }
    if (updates.params !== undefined) {
      updateData.params = updates.params
    }
    if (updates.deadline !== undefined) {
      updateData.deadline = updates.deadline
    }
    if (updates.reflectionNote !== undefined) {
      updateData.reflection_note = updates.reflectionNote
      // 内省メモを保存する際は、reflection_doneもtrueにする
      if (updates.reflectionNote !== null) {
        updateData.reflection_done = true
      }
    }

    const { data, error } = await this.supabase
      .from('milestones')
      .update(updateData)
      .eq('id', milestoneId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * マイルストーン削除
   */
  async deleteMilestone(milestoneId: string): Promise<void> {
    const { error } = await this.supabase
      .from('milestones')
      .delete()
      .eq('id', milestoneId)

    if (error) throw error
  }

  /**
   * 期限切れ目標取得（ログイン時）
   * 大会日付が過去で、statusがactiveのもの
   */
  async getExpiredGoals(): Promise<GoalWithMilestones[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const todayDate = startOfDay(new Date())
    const todayStr = format(todayDate, 'yyyy-MM-dd')

    // activeな目標を取得し、サーバー側で大会日付が今日より前のものをフィルタ
    const { data, error } = await this.supabase
      .from('goals')
      .select(`
        *,
        competition:competitions!inner(*),
        style:styles(*),
        milestones(*)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lt('competition.date', todayStr)

    if (error) throw error

    // クライアント側でデータ整形と追加の日付バリデーション
    const expiredGoals = ((data || []) as GoalQueryResult[])
      .map((item) => {
        return {
          ...item,
          competition: normalizeRelation(item.competition),
          style: normalizeRelation(item.style),
          milestones: normalizeRelationArray(item.milestones)
        } as GoalWithMilestones
      })
      .filter((goal: GoalWithMilestones) => {
        // 大会日付のバリデーション
        if (!goal.competition?.date) return false
        const competitionDate = parseISO(goal.competition.date)
        if (!isValid(competitionDate)) return false
        // 日付のみで比較（タイムゾーン問題を回避）
        return startOfDay(competitionDate) < todayDate
      })
      .sort((a: GoalWithMilestones, b: GoalWithMilestones) => {
        // 大会日付の降順でソート
        const dateA = a.competition?.date ? parseISO(a.competition.date) : new Date(0)
        const dateB = b.competition?.date ? parseISO(b.competition.date) : new Date(0)
        return dateB.getTime() - dateA.getTime()
      })

    return expiredGoals
  }

  /**
   * 期限切れマイルストーン取得（ログイン時）
   */
  async getExpiredMilestones(): Promise<Milestone[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const today = format(new Date(), 'yyyy-MM-dd') // ローカル日付のYYYY-MM-DD形式

    const { data, error } = await this.supabase
      .from('milestones')
      .select(`
        *,
        goals!inner(user_id)
      `)
      .eq('goals.user_id', user.id)
      .eq('reflection_done', false)
      .not('deadline', 'is', null)
      .lt('deadline', today)
      .neq('status', 'achieved')
      .order('deadline', { ascending: false })

    if (error) throw error
    return data || []
  }

  /**
   * マイルストーンステータス更新（内部使用）
   */
  async updateMilestoneStatus(
    milestoneId: string,
    status: MilestoneStatus,
    achievedAt?: string
  ): Promise<Milestone> {
    const updateData: MilestoneUpdate = {
      status
    }

    if (achievedAt) {
      updateData.achieved_at = achievedAt
    }

    const { data, error } = await this.supabase
      .from('milestones')
      .update(updateData)
      .eq('id', milestoneId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // =========================================================================
  // 達成判定ロジック
  // =========================================================================

  /**
   * マイルストーン達成判定（自動実行）
   */
  async checkMilestoneAchievement(milestoneId: string): Promise<{
    achieved: boolean
    achievementData?: {
      practiceLogId?: string
      recordId?: string
      achievedValue: { [key: string]: unknown }
    }
  }> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // マイルストーン情報を取得
    const { data: milestone, error: milestoneError } = await this.supabase
      .from('milestones')
      .select('*')
      .eq('id', milestoneId)
      .single()

    if (milestoneError) throw milestoneError
    if (!milestone) throw new Error('マイルストーンが見つかりません')

    let achieved = false
    let achievementData: {
      practiceLogId?: string
      recordId?: string
      achievedValue: { [key: string]: unknown }
    } | undefined

    if (milestone.type === 'time') {
      const result = await this.checkTimeAchievement(milestone, user.id)
      achieved = result.achieved
      achievementData = result.achievementData
    } else if (milestone.type === 'reps_time') {
      const result = await this.checkRepsTimeAchievement(milestone, user.id)
      achieved = result.achieved
      achievementData = result.achievementData
    } else if (milestone.type === 'set') {
      const result = await this.checkSetAchievement(milestone, user.id)
      achieved = result.achieved
      achievementData = result.achievementData
    }

    return { achieved, achievementData }
  }

  /**
   * time型の達成判定
   * @private
   */
  private async checkTimeAchievement(
    milestone: Milestone,
    userId: string
  ): Promise<{
    achieved: boolean
    achievementData?: {
      practiceLogId?: string
      recordId?: string
      achievedValue: { [key: string]: unknown }
    }
  }> {
    const params = milestone.params as MilestoneTimeParams

    // 練習記録から検索（practice_logsのstyleは日本語名で格納されている）
    const styleJp = getStyleJapanese(params.style)
    const { data: practiceLogs, error: practiceError } = await this.supabase
      .from('practice_logs')
      .select(`
        id,
        practice_times(time)
      `)
      .eq('user_id', userId)
      .eq('distance', params.distance)
      .eq('style', styleJp)
      .order('created_at', { ascending: false })

    if (!practiceError && practiceLogs) {
      for (const log of practiceLogs) {
        const times = Array.isArray(log.practice_times) ? log.practice_times : (log.practice_times ? [log.practice_times] : [])
        for (const time of times) {
          if (time.time <= params.target_time) {
            return {
              achieved: true,
              achievementData: {
                practiceLogId: log.id,
                achievedValue: {
                  time: time.time,
                  target_time: params.target_time
                }
              }
            }
          }
        }
      }
    }

    // 大会記録から検索
    const { data: records, error: recordError } = await this.supabase
      .from('records')
      .select(`
        id,
        time,
        style_id,
        styles!inner(distance, style)
      `)
      .eq('user_id', userId)
      .eq('styles.distance', params.distance)
      .eq('styles.style', params.style.toLowerCase())
      .lte('time', params.target_time)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!recordError && records && records.length > 0) {
      const record = records[0]
      return {
        achieved: true,
        achievementData: {
          recordId: record.id,
          achievedValue: {
            time: record.time,
            target_time: params.target_time
          }
        }
      }
    }

    return { achieved: false }
  }

  /**
   * reps_time型の達成判定
   * @private
   */
  private async checkRepsTimeAchievement(
    milestone: Milestone,
    userId: string
  ): Promise<{
    achieved: boolean
    achievementData?: {
      practiceLogId?: string
      recordId?: string
      achievedValue: { [key: string]: unknown }
    }
  }> {
    const params = milestone.params as MilestoneRepsTimeParams

    // 条件に一致するpractice_logsを取得（practice_logsのstyleは日本語名で格納されている）
    const styleJp = getStyleJapanese(params.style)
    const { data: logs, error: logError } = await this.supabase
      .from('practice_logs')
      .select(`
        id,
        practice_times(time, set_number, rep_number)
      `)
      .eq('user_id', userId)
      .eq('distance', params.distance)
      .eq('style', styleJp)
      .eq('swim_category', params.swim_category)
      .gte('rep_count', params.reps)
      .order('created_at', { ascending: false })

    if (logError || !logs) {
      return { achieved: false }
    }

    // 各ログのタイムを検証（set単位で平均計算）
    for (const log of logs) {
      const times = Array.isArray(log.practice_times) ? log.practice_times : (log.practice_times ? [log.practice_times] : [])
      
      // set_numberごとにグループ化
      const setGroups = new Map<number, typeof times>()
      for (const time of times) {
        const setNum = time.set_number
        if (!setGroups.has(setNum)) {
          setGroups.set(setNum, [])
        }
        setGroups.get(setNum)!.push(time)
      }

      for (const [setNum, setTimes] of setGroups.entries()) {
        if (setTimes.length >= params.reps) {
          // rep_number順にソートしてから最初のN本の平均を計算
          const sortedTimes = [...setTimes].sort((a, b) => a.rep_number - b.rep_number)
          const firstNTimes = sortedTimes.slice(0, params.reps)
          const avgTime = firstNTimes.reduce((sum, t) => sum + t.time, 0) / params.reps
          
          if (avgTime <= params.target_average_time) {
            return {
              achieved: true,
              achievementData: {
                practiceLogId: log.id,
                achievedValue: {
                  average_time: avgTime,
                  target_average_time: params.target_average_time,
                  set_number: setNum,
                  times: firstNTimes.map(t => t.time)
                }
              }
            }
          }
        }
      }
    }

    return { achieved: false }
  }

  /**
   * set型の達成判定
   * @private
   */
  private async checkSetAchievement(
    milestone: Milestone,
    userId: string
  ): Promise<{
    achieved: boolean
    achievementData?: {
      practiceLogId?: string
      recordId?: string
      achievedValue: { [key: string]: unknown }
    }
  }> {
    const params = milestone.params as MilestoneSetParams

    // 条件に一致するpractice_logsを取得（practice_logsのstyleは日本語名で格納されている）
    const styleJp = getStyleJapanese(params.style)
    const { data: logs, error: logError } = await this.supabase
      .from('practice_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('distance', params.distance)
      .eq('style', styleJp)
      .eq('swim_category', params.swim_category)
      .eq('rep_count', params.reps)
      .gte('set_count', params.sets)
      .order('created_at', { ascending: false })
      .limit(1)

    if (logError || !logs || logs.length === 0) {
      return { achieved: false }
    }

    // 条件を満たすログが1件以上あればOK
    return {
      achieved: true,
      achievementData: {
        practiceLogId: logs[0].id,
        achievedValue: {
          distance: params.distance,
          reps: params.reps,
          sets: params.sets,
          circle: params.circle
        }
      }
    }
  }

  // =========================================================================
  // レコード存在確認ロジック（ステータス遷移用）
  // =========================================================================

  /**
   * マイルストーンに関連するレコードが存在するか確認
   * @private
   */
  private async hasRecordsForMilestone(
    userId: string,
    milestone: Milestone
  ): Promise<boolean> {
    if (milestone.type === 'time') {
      return await this.hasTimeRecords(userId, milestone)
    } else if (milestone.type === 'reps_time') {
      return await this.hasRepsTimeRecords(userId, milestone)
    } else if (milestone.type === 'set') {
      return await this.hasSetRecords(userId, milestone)
    }
    return false
  }

  /**
   * time型のレコード存在確認
   * @private
   */
  private async hasTimeRecords(
    userId: string,
    milestone: Milestone
  ): Promise<boolean> {
    const params = milestone.params as MilestoneTimeParams
    const styleJp = getStyleJapanese(params.style)

    // 練習記録を確認（practice_timesが存在するか）
    const { data: practiceLogs, error: practiceError } = await this.supabase
      .from('practice_logs')
      .select(`
        id,
        practice_times(id)
      `)
      .eq('user_id', userId)
      .eq('distance', params.distance)
      .eq('style', styleJp)
      .limit(1)

    if (!practiceError && practiceLogs && practiceLogs.length > 0) {
      // practice_timesが存在するか確認
      for (const log of practiceLogs) {
        const times = Array.isArray(log.practice_times) 
          ? log.practice_times 
          : (log.practice_times ? [log.practice_times] : [])
        if (times.length > 0) {
          return true
        }
      }
    }

    // 大会記録を確認
    const { data: records, error: recordError } = await this.supabase
      .from('records')
      .select(`
        id,
        styles!inner(distance, style)
      `)
      .eq('user_id', userId)
      .eq('styles.distance', params.distance)
      .eq('styles.style', params.style.toLowerCase())
      .limit(1)

    if (!recordError && records && records.length > 0) {
      return true
    }

    return false
  }

  /**
   * reps_time型のレコード存在確認
   * @private
   */
  private async hasRepsTimeRecords(
    userId: string,
    milestone: Milestone
  ): Promise<boolean> {
    const params = milestone.params as MilestoneRepsTimeParams
    const styleJp = getStyleJapanese(params.style)

    // 条件に一致するpractice_logsを確認（practice_timesが存在するか）
    const { data: logs, error: logError } = await this.supabase
      .from('practice_logs')
      .select(`
        id,
        practice_times(id)
      `)
      .eq('user_id', userId)
      .eq('distance', params.distance)
      .eq('style', styleJp)
      .eq('swim_category', params.swim_category)
      .gte('rep_count', params.reps)
      .limit(1)

    if (logError || !logs || logs.length === 0) {
      return false
    }

    // practice_timesが存在するか確認
    for (const log of logs) {
      const times = Array.isArray(log.practice_times) 
        ? log.practice_times 
        : (log.practice_times ? [log.practice_times] : [])
      if (times.length > 0) {
        return true
      }
    }

    return false
  }

  /**
   * set型のレコード存在確認
   * @private
   */
  private async hasSetRecords(
    userId: string,
    milestone: Milestone
  ): Promise<boolean> {
    const params = milestone.params as MilestoneSetParams
    const styleJp = getStyleJapanese(params.style)

    // 条件に一致するpractice_logsを確認
    const { data: logs, error: logError } = await this.supabase
      .from('practice_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('distance', params.distance)
      .eq('style', styleJp)
      .eq('swim_category', params.swim_category)
      .eq('rep_count', params.reps)
      .gte('set_count', params.sets)
      .limit(1)

    if (logError || !logs || logs.length === 0) {
      return false
    }

    return true
  }

  /**
   * ユーザーの全アクティブなマイルストーンのステータスを更新
   * 練習記録・大会記録作成/更新時に自動実行
   */
  async updateAllMilestoneStatuses(userId: string): Promise<void> {
    // ユーザーの全アクティブなマイルストーンを取得
    const { data: milestones, error: milestonesError } = await this.supabase
      .from('milestones')
      .select(`
        *,
        goals!inner(user_id)
      `)
      .eq('goals.user_id', userId)
      .in('status', ['not_started', 'in_progress'])

    if (milestonesError || !milestones) {
      return
    }

    const today = format(new Date(), 'yyyy-MM-dd') // ローカル日付のYYYY-MM-DD形式

    for (const milestone of milestones) {
      // 達成判定
      const { achieved, achievementData } = await this.checkMilestoneAchievement(milestone.id)

      if (achieved && milestone.status !== 'achieved') {
        // 達成状態に更新
        await this.updateMilestoneStatus(
          milestone.id,
          'achieved',
          new Date().toISOString()
        )

        // ローカル変数も更新（期限切れチェックで正しく判定するため）
        milestone.status = 'achieved'

        // 達成記録を保存（milestone_achievements）
        if (achievementData) {
          try {
            // 重複チェック: 既に同じマイルストーン・同じレコードのachievementが存在するか確認
            let shouldInsert = true
            
            if (achievementData.practiceLogId) {
              const existingCheck = await this.supabase
                .from('milestone_achievements')
                .select('id')
                .eq('milestone_id', milestone.id)
                .eq('practice_log_id', achievementData.practiceLogId)
                .maybeSingle()
              
              if (existingCheck.error && existingCheck.error.code !== 'PGRST116') {
                // PGRST116は「not found」エラー（正常なケース）
                console.warn(
                  `マイルストーン ${milestone.id} の達成記録重複チェック中にエラー:`,
                  existingCheck.error
                )
              } else if (existingCheck.data) {
                // 既に存在する場合はスキップ（並行実行時の重複防止）
                shouldInsert = false
              }
            } else if (achievementData.recordId) {
              const existingCheck = await this.supabase
                .from('milestone_achievements')
                .select('id')
                .eq('milestone_id', milestone.id)
                .eq('record_id', achievementData.recordId)
                .maybeSingle()
              
              if (existingCheck.error && existingCheck.error.code !== 'PGRST116') {
                // PGRST116は「not found」エラー（正常なケース）
                console.warn(
                  `マイルストーン ${milestone.id} の達成記録重複チェック中にエラー:`,
                  existingCheck.error
                )
              } else if (existingCheck.data) {
                // 既に存在する場合はスキップ（並行実行時の重複防止）
                shouldInsert = false
              }
            }

            // 達成記録を挿入（重複がない場合のみ）
            if (shouldInsert) {
              const { error: achievementError } = await this.supabase
                .from('milestone_achievements')
                .insert({
                  milestone_id: milestone.id,
                  practice_log_id: achievementData.practiceLogId || null,
                  record_id: achievementData.recordId || null,
                  achieved_value: achievementData.achievedValue
                })

              if (achievementError) {
                // ユニーク制約エラー（重複）の場合は警告のみで続行
                // その他のエラーもログに記録して続行（他のマイルストーンの処理を中断しない）
                const isDuplicateError = 
                  achievementError.code === '23505' || // PostgreSQL unique violation
                  achievementError.message?.includes('duplicate') ||
                  achievementError.message?.includes('unique')
                
                if (isDuplicateError) {
                  console.warn(
                    `マイルストーン ${milestone.id} の達成記録は既に存在します（並行実行による重複）:`,
                    achievementError.message
                  )
                } else {
                  console.error(
                    `マイルストーン ${milestone.id} の達成記録の保存に失敗:`,
                    achievementError
                  )
                }
                // エラーが発生してもループを継続（他のマイルストーンの処理を続行）
              }
            }
          } catch (error) {
            // 予期しないエラーもキャッチしてログに記録し、処理を続行
            console.error(
              `マイルストーン ${milestone.id} の達成記録保存中に予期しないエラー:`,
              error
            )
            // エラーが発生してもループを継続
          }
        }
      } else if (!achieved && milestone.status === 'not_started') {
        // 関連レコードが存在する場合のみ「進行中」に変更
        const hasRecords = await this.hasRecordsForMilestone(userId, milestone)
        if (hasRecords) {
          await this.updateMilestoneStatus(milestone.id, 'in_progress')
          // ローカル変数も更新（期限切れチェックで正しく判定するため）
          milestone.status = 'in_progress'
        }
      }

      // 期限切れチェック
      if (milestone.deadline) {
        // deadlineは既にYYYY-MM-DD形式の文字列として格納されているため、そのまま使用
        // ただし、Dateオブジェクトの場合はformatで変換
        const deadline = typeof milestone.deadline === 'string' 
          ? milestone.deadline 
          : format(new Date(milestone.deadline), 'yyyy-MM-dd')
        if (deadline < today && milestone.status !== 'achieved') {
          await this.updateMilestoneStatus(milestone.id, 'expired')
        }
      }
    }
  }
}
