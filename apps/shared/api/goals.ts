// =============================================================================
// 目標管理API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { format, parseISO, isValid, startOfDay } from "date-fns";
import { CompetitionInsert } from "../types";
import { normalizeRelation, normalizeRelationArray } from "../utils/supabase-helpers";
import { toStyleCode } from "../utils/swimStyles";
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
  UpdateMilestoneInput,
} from "../types/goals";
import type { Competition, Style } from "../types";

// Supabaseクエリ結果の型（配列/単一オブジェクトの不整合に対応）
interface GoalQueryResult extends Goal {
  competition?: Competition | Competition[] | null;
  style?: Style | Style[];
  milestones?: Milestone | Milestone[];
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
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let competitionId = input.competitionId;

    // 大会が未作成の場合は新規作成
    if (!competitionId && input.competitionData) {
      const competitionInsert: CompetitionInsert = {
        user_id: user.id,
        title: input.competitionData.title,
        date: input.competitionData.date,
        end_date: input.competitionData.endDate ?? null,
        place: input.competitionData.place,
        pool_type: input.competitionData.poolType,
        entry_status: "before",
        note: null,
      };

      const { data: competition, error: compError } = await this.supabase
        .from("competitions")
        .insert(competitionInsert)
        .select()
        .single();

      if (compError) throw compError;
      competitionId = competition.id;
    }

    if (!competitionId) {
      throw new Error("大会IDまたは大会情報が必要です");
    }

    // ベストタイムを取得（startTimeが指定されていない場合）。対象大会と同じ
    // 水路（poolType）の記録に絞る。水路が分からない場合は自動取得自体を行わない
    // (絞り込みなしで取得すると短水路の記録が混入しうるため。フォールバックは禁止)。
    let startTime = input.startTime;
    if (startTime === undefined) {
      startTime =
        input.poolType !== undefined
          ? await this.getBestTimeForStyle(user.id, input.styleId, input.poolType)
          : null;
    }

    const goalInsert: GoalInsert = {
      user_id: user.id,
      competition_id: competitionId,
      style_id: input.styleId,
      target_time: input.targetTime,
      start_time: startTime,
      status: "active",
    };

    const { data, error } = await this.supabase.from("goals").insert(goalInsert).select().single();

    if (error) throw error;
    return data;
  }

  /**
   * 大会目標一覧取得
   */
  async getGoals(filters?: {
    status?: "active" | "achieved" | "cancelled";
    competitionId?: string;
  }): Promise<Goal[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let query = this.supabase
      .from("goals")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*)
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.competitionId) {
      query = query.eq("competition_id", filters.competitionId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // レスポンスの型変換（Supabaseの配列/単一オブジェクトの不整合に対応）
    if (!data) return [];

    return (data as GoalQueryResult[]).map((item) => {
      // Goal型の基本フィールドのみを返す（competitionとstyleは別途取得）
      const { competition: _comp, style: _style, ...goalData } = item;
      return goalData as Goal;
    });
  }

  /**
   * 目標の対象大会として選択可能な大会一覧を取得する。
   * 個人大会 + 所属チームの大会 (RLS の competitions SELECT ポリシー
   * (20260705000000: 本人 or チームメンバー or チーム管理者) にすべて委ねる)。
   * `RecordAPI.getCompetitions()` は個人大会限定 (既存テスト・利用箇所が前提にしているため
   * 変更しない) なのでチーム大会が必要な目標フォームは本メソッドを使う。
   */
  async getSelectableCompetitions(startDate?: string, endDate?: string): Promise<Competition[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let query = this.supabase
      .from("competitions")
      .select("*")
      .order("date", { ascending: false });

    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * 大会目標詳細取得（マイルストーン含む）
   */
  async getGoalWithMilestones(goalId: string): Promise<GoalWithMilestones | null> {
    const { data, error } = await this.supabase
      .from("goals")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        milestones(*)
      `,
      )
      .eq("id", goalId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // レコードが見つからない
      throw error;
    }

    // レスポンスの型変換（Supabaseの配列/単一オブジェクトの不整合に対応）
    const goal = data as GoalQueryResult;
    const competition = normalizeRelation(goal.competition);
    const style = normalizeRelation(goal.style);
    const milestones = normalizeRelationArray(goal.milestones);

    return {
      ...goal,
      competition,
      style,
      milestones,
    } as GoalWithMilestones;
  }

  /**
   * 大会目標更新
   */
  async updateGoal(goalId: string, updates: Omit<UpdateGoalInput, "id">): Promise<Goal> {
    const updateData: GoalUpdate = {};

    if (updates.competitionId !== undefined) {
      updateData.competition_id = updates.competitionId;
    }
    if (updates.styleId !== undefined) {
      updateData.style_id = updates.styleId;
    }
    if (updates.targetTime !== undefined) {
      updateData.target_time = updates.targetTime;
    }
    if (updates.startTime !== undefined) {
      updateData.start_time = updates.startTime;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === "achieved") {
        updateData.achieved_at = new Date().toISOString();
      }
    }
    if (updates.reflectionNote !== undefined) {
      updateData.reflection_note = updates.reflectionNote;
    }

    const { data, error } = await this.supabase
      .from("goals")
      .update(updateData)
      .eq("id", goalId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 大会目標削除
   */
  async deleteGoal(goalId: string): Promise<void> {
    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（practices.ts の deletePractice と同型）。
    const { data, error } = await this.supabase
      .from("goals")
      .delete()
      .eq("id", goalId)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("大会目標の削除に失敗しました");
    }
  }

  /**
   * 種目ごとのベストタイム取得
   * poolType (対象大会と同じ水路) で必ず絞り込む（長水路の目標に短水路の記録が
   * 混入するのを防ぐ）。水路が分からない場合はこの関数を呼び出さないこと
   * (呼び出し元で「計算不能」を返す。絞り込み無しのフォールバックは禁止)。
   * @private
   */
  private async getBestTimeForStyle(
    userId: string,
    styleId: number,
    poolType: number,
  ): Promise<number | null> {
    const { data, error } = await this.supabase
      .from("records")
      .select("time")
      .eq("user_id", userId)
      .eq("style_id", styleId)
      .eq("pool_type", poolType)
      // リレーの引き継ぎ (is_relaying=true) は個人の自己ベストの集計から除く
      // (RecordAPI の「ベストタイム取得」等アプリ全体の扱いに揃える)。
      .eq("is_relaying", false)
      .order("time", { ascending: true })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // レコードが見つからない
      throw error;
    }

    return data?.time || null;
  }

  /**
   * 大会目標の達成率を計算
   * 差分ベース: (初期タイム - 最新ベスト) / (初期タイム - 目標タイム)
   * 大会情報が取得できない場合 (競技会削除・チーム退会等で水路が分からない場合) は
   * 自己ベストを取得せず null (計算不能) を返す。呼び出し側は既存の空・未設定
   * 表示パターンで扱うこと。
   */
  async calculateGoalProgress(goalId: string): Promise<number | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data: goal, error: goalError } = await this.supabase
      .from("goals")
      .select("*, competition:competitions(pool_type)")
      .eq("id", goalId)
      .single();

    if (goalError || !goal) {
      return 0;
    }

    if (!goal.start_time) {
      return 0; // 初期タイムがない場合は0%
    }

    const competition = normalizeRelation(
      goal.competition as { pool_type: number } | { pool_type: number }[] | null | undefined,
    );

    if (competition?.pool_type === undefined) {
      return null; // 水路が分からない場合は計算不能 (短水路混入を防ぐため取得自体をしない)
    }

    // 最新ベストタイムを取得
    const currentBest = await this.getBestTimeForStyle(
      user.id,
      goal.style_id,
      competition.pool_type,
    );
    if (!currentBest) {
      return 0;
    }

    const improvement = goal.start_time - currentBest;
    const targetImprovement = goal.start_time - goal.target_time;

    if (targetImprovement <= 0) {
      return 0; // 目標が初期タイム以下の場合
    }

    const progress = (improvement / targetImprovement) * 100;
    return Math.min(Math.max(progress, 0), 100); // 0-100%にクランプ
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
      status: "not_started",
    };

    const { data, error } = await this.supabase
      .from("milestones")
      .insert(milestoneInsert)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * マイルストーン一覧取得
   */
  async getMilestones(
    goalId: string,
    filters?: {
      status?: MilestoneStatus | MilestoneStatus[];
      deadlineAfter?: string; // この日付以降のdeadlineのみ（期限切れ除外）。deadlineがnullの場合は常に含める
    },
  ): Promise<Milestone[]> {
    let query = this.supabase
      .from("milestones")
      .select("*")
      .eq("goal_id", goalId)
      .order("created_at", { ascending: false });

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        // 複数ステータス対応
        query = query.in("status", filters.status);
      } else {
        // 単一ステータス（後方互換性のため）
        query = query.eq("status", filters.status);
      }
    }

    if (filters?.deadlineAfter) {
      // deadline >= deadlineAfter または deadline IS NULL
      // Supabaseでは .or() を使用
      query = query.or(`deadline.gte.${filters.deadlineAfter},deadline.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * マイルストーン更新
   */
  async updateMilestone(
    milestoneId: string,
    updates: Omit<UpdateMilestoneInput, "id">,
  ): Promise<Milestone> {
    const updateData: MilestoneUpdate = {};

    if (updates.type !== undefined) {
      updateData.type = updates.type;
    }
    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }
    if (updates.params !== undefined) {
      updateData.params = updates.params;
    }
    if (updates.deadline !== undefined) {
      updateData.deadline = updates.deadline;
    }
    if (updates.reflectionNote !== undefined) {
      updateData.reflection_note = updates.reflectionNote;
      // 内省メモを保存する際は、reflection_doneもtrueにする
      if (updates.reflectionNote !== null) {
        updateData.reflection_done = true;
      }
    }

    const { data, error } = await this.supabase
      .from("milestones")
      .update(updateData)
      .eq("id", milestoneId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * マイルストーン削除
   */
  async deleteMilestone(milestoneId: string): Promise<void> {
    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（practices.ts の deletePractice と同型）。
    const { data, error } = await this.supabase
      .from("milestones")
      .delete()
      .eq("id", milestoneId)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("マイルストーンの削除に失敗しました");
    }
  }

  /**
   * 期限切れ目標取得（ログイン時）
   * 大会日付が過去で、statusがactiveのもの
   */
  async getExpiredGoals(): Promise<GoalWithMilestones[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const todayDate = startOfDay(new Date());
    const todayStr = format(todayDate, "yyyy-MM-dd");

    // activeな目標を取得し、サーバー側で大会日付が今日より前のものをフィルタ
    const { data, error } = await this.supabase
      .from("goals")
      .select(
        `
        *,
        competition:competitions!inner(*),
        style:styles(*),
        milestones(*)
      `,
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .lt("competition.date", todayStr);

    if (error) throw error;

    // クライアント側でデータ整形と追加の日付バリデーション
    const expiredGoals = ((data || []) as GoalQueryResult[])
      .map((item) => {
        return {
          ...item,
          competition: normalizeRelation(item.competition),
          style: normalizeRelation(item.style),
          milestones: normalizeRelationArray(item.milestones),
        } as GoalWithMilestones;
      })
      .filter((goal: GoalWithMilestones) => {
        // 大会日付のバリデーション
        if (!goal.competition?.date) return false;
        const competitionDate = parseISO(goal.competition.date);
        if (!isValid(competitionDate)) return false;
        // 日付のみで比較（タイムゾーン問題を回避）
        return startOfDay(competitionDate) < todayDate;
      })
      .sort((a: GoalWithMilestones, b: GoalWithMilestones) => {
        // 大会日付の降順でソート
        const dateA = a.competition?.date ? parseISO(a.competition.date) : new Date(0);
        const dateB = b.competition?.date ? parseISO(b.competition.date) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

    return expiredGoals;
  }

  /**
   * 期限切れマイルストーン取得（ログイン時）
   */
  async getExpiredMilestones(): Promise<Milestone[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const today = format(new Date(), "yyyy-MM-dd"); // ローカル日付のYYYY-MM-DD形式

    const { data, error } = await this.supabase
      .from("milestones")
      .select(
        `
        *,
        goals!inner(user_id)
      `,
      )
      .eq("goals.user_id", user.id)
      .eq("reflection_done", false)
      .not("deadline", "is", null)
      .lt("deadline", today)
      .neq("status", "achieved")
      .order("deadline", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * マイルストーンステータス更新（内部使用）
   */
  async updateMilestoneStatus(
    milestoneId: string,
    status: MilestoneStatus,
    achievedAt?: string,
  ): Promise<Milestone> {
    const updateData: MilestoneUpdate = {
      status,
    };

    if (achievedAt) {
      updateData.achieved_at = achievedAt;
    }

    const { data, error } = await this.supabase
      .from("milestones")
      .update(updateData)
      .eq("id", milestoneId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // =========================================================================
  // 達成判定ロジック
  // =========================================================================

  /**
   * マイルストーン達成判定（自動実行）
   *
   * @param milestone 判定対象のマイルストーンの行。呼び出し元 (updateAllMilestoneStatuses)
   *   が既に取得済みの行をそのまま渡す (再取得しない)
   */
  async checkMilestoneAchievement(milestone: Milestone): Promise<{
    achieved: boolean;
    achievementData?: {
      practiceLogId?: string;
      recordId?: string;
      achievedValue: { [key: string]: unknown };
    };
  }> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let achieved = false;
    let achievementData:
      | {
          practiceLogId?: string;
          recordId?: string;
          achievedValue: { [key: string]: unknown };
        }
      | undefined;

    if (milestone.type === "time") {
      const result = await this.checkTimeAchievement(milestone, user.id);
      achieved = result.achieved;
      achievementData = result.achievementData;
    } else if (milestone.type === "reps_time") {
      const result = await this.checkRepsTimeAchievement(milestone, user.id);
      achieved = result.achieved;
      achievementData = result.achievementData;
    } else if (milestone.type === "set") {
      const result = await this.checkSetAchievement(milestone, user.id);
      achieved = result.achieved;
      achievementData = result.achievementData;
    }

    return { achieved, achievementData };
  }

  /**
   * time型の達成判定
   * @private
   */
  private async checkTimeAchievement(
    milestone: Milestone,
    userId: string,
  ): Promise<{
    achieved: boolean;
    achievementData?: {
      practiceLogId?: string;
      recordId?: string;
      achievedValue: { [key: string]: unknown };
    };
  }> {
    const params = milestone.params as MilestoneTimeParams;

    // milestones.params は JSONB でサーバー側の enum バリデーションが無く、
    // 認証済みユーザーが自分の milestone に任意の params.style ("%" 等) を
    // 書き込める。ilike に渡す前に canonical 化してワイルドカードを含む値を弾く
    // (canonical 外なら practice_logs/styles マスターに一致する行は存在しえない
    // ので、クエリを送らず未達成として扱う)。practice_logs 側・records 側の
    // 両方でこの1回の判定を使い回す。
    const styleCode = toStyleCode(params.style);
    if (!styleCode) {
      return { achieved: false };
    }

    // 練習記録から検索。practice_logs.style は CHECK 制約の無い自由記述列で
    // canonical (タイトルケース) 書き込みを規約とするが、大文字小文字の揺れを
    // 吸収するため ilike で照合する (styles.style と同型のパターン)。
    // swim_category は practice_logs.swim_category が Postgres の ENUM 型
    // ("Swim"/"Pull"/"Kick" の3値のみ) なので style と違って表記揺れが
    // DB に入り得ず、.eq の完全一致で絞ってよい (reps_time/set 型の判定と同じ絞り方)。
    // これが無いとキックの練習タイムでもスイムの目標が達成扱いになってしまう。
    const { data: practiceLogs, error: practiceError } = await this.supabase
      .from("practice_logs")
      .select(
        `
        id,
        practice_times(time)
      `,
      )
      .eq("user_id", userId)
      .eq("distance", params.distance)
      .ilike("style", styleCode)
      .eq("swim_category", params.swim_category)
      .order("created_at", { ascending: false });

    if (!practiceError && practiceLogs) {
      for (const log of practiceLogs) {
        const times = Array.isArray(log.practice_times)
          ? log.practice_times
          : log.practice_times
            ? [log.practice_times]
            : [];
        for (const time of times) {
          if (time.time <= params.target_time) {
            return {
              achieved: true,
              achievementData: {
                practiceLogId: log.id,
                achievedValue: {
                  time: time.time,
                  target_time: params.target_time,
                },
              },
            };
          }
        }
      }
    }

    // 大会記録から検索。
    const { data: records, error: recordError } = await this.supabase
      .from("records")
      .select(
        `
        id,
        time,
        style_id,
        styles!inner(distance, style)
      `,
      )
      .eq("user_id", userId)
      .eq("styles.distance", params.distance)
      // styles.style の照合はケース非依存にする (移行期の暫定措置。恒久固定ではない)。
      // コードと migration (styles.style をタイトルケースへ移行, Issue #13) を
      // 別々にデプロイする場合は「コードを100%ロールアウトしてから migration を
      // 適用する」順序を守ること。ilike が救えるのは「コード先行」方向のみ
      // (新コードの ilike が旧DBの小文字行にもマッチする) で、逆の
      // 「migration 先行」方向は救えない: DB が先にタイトルケースへ移行された状態で
      // 旧コード (このコミット以前の .eq(..., toLowerCase())) がまだ稼働していると、
      // 旧コードは小文字で問い合わせるため新データ (タイトルケース) と一致せず
      // 0件・エラーなしで静かに壊れる。ilike はワイルドカードを含まない値に対しては
      // 大文字小文字を無視した完全一致として働く (embedded resource
      // styles!inner(...) に対しても動作することを local Supabase で実証済み)。
      // 旧コード (この .toLowerCase() を使わない版) が本番から完全に消えたことを
      // 確認できたら、.eq に戻してインデックス効率を回復する選択肢がある。
      // styleCode は toStyleCode で検証済みの canonical 値のみ (ワイルドカード不可)。
      .ilike("styles.style", styleCode)
      // リレーの引き継ぎ (is_relaying=true) は達成に数えない (getBestTimeForStyle と
      // 同じ扱いに揃える)。
      .eq("is_relaying", false)
      .lte("time", params.target_time)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!recordError && records && records.length > 0) {
      const record = records[0];
      if (record) {
        return {
          achieved: true,
          achievementData: {
            recordId: record.id,
            achievedValue: {
              time: record.time,
              target_time: params.target_time,
            },
          },
        };
      }
    }

    return { achieved: false };
  }

  /**
   * reps_time型の達成判定
   * @private
   */
  private async checkRepsTimeAchievement(
    milestone: Milestone,
    userId: string,
  ): Promise<{
    achieved: boolean;
    achievementData?: {
      practiceLogId?: string;
      recordId?: string;
      achievedValue: { [key: string]: unknown };
    };
  }> {
    const params = milestone.params as MilestoneRepsTimeParams;

    // canonical 外なら practice_logs マスターに一致する行は存在しえないので、
    // クエリを送らず未達成として扱う (checkTimeAchievement と同型)。
    const styleCode = toStyleCode(params.style);
    if (!styleCode) {
      return { achieved: false };
    }

    // 条件に一致するpractice_logsを取得
    const { data: logs, error: logError } = await this.supabase
      .from("practice_logs")
      .select(
        `
        id,
        practice_times(time, set_number, rep_number)
      `,
      )
      .eq("user_id", userId)
      .eq("distance", params.distance)
      .ilike("style", styleCode)
      .eq("swim_category", params.swim_category)
      .gte("rep_count", params.reps)
      .order("created_at", { ascending: false });

    if (logError || !logs) {
      return { achieved: false };
    }

    // 各ログのタイムを検証（set単位で平均計算）
    for (const log of logs) {
      const times = Array.isArray(log.practice_times)
        ? log.practice_times
        : log.practice_times
          ? [log.practice_times]
          : [];

      // set_numberごとにグループ化
      const setGroups = new Map<number, typeof times>();
      for (const time of times) {
        const setNum = time.set_number;
        if (!setGroups.has(setNum)) {
          setGroups.set(setNum, []);
        }
        setGroups.get(setNum)!.push(time);
      }

      for (const [setNum, setTimes] of setGroups.entries()) {
        if (setTimes.length >= params.reps) {
          // rep_number順にソートしてから最初のN本の平均を計算
          const sortedTimes = [...setTimes].sort((a, b) => a.rep_number - b.rep_number);
          const firstNTimes = sortedTimes.slice(0, params.reps);
          const avgTime = firstNTimes.reduce((sum, t) => sum + t.time, 0) / params.reps;

          if (avgTime <= params.target_average_time) {
            return {
              achieved: true,
              achievementData: {
                practiceLogId: log.id,
                achievedValue: {
                  average_time: avgTime,
                  target_average_time: params.target_average_time,
                  set_number: setNum,
                  times: firstNTimes.map((t) => t.time),
                },
              },
            };
          }
        }
      }
    }

    return { achieved: false };
  }

  /**
   * set型の達成判定
   * @private
   */
  private async checkSetAchievement(
    milestone: Milestone,
    userId: string,
  ): Promise<{
    achieved: boolean;
    achievementData?: {
      practiceLogId?: string;
      recordId?: string;
      achievedValue: { [key: string]: unknown };
    };
  }> {
    const params = milestone.params as MilestoneSetParams;

    // canonical 外なら practice_logs マスターに一致する行は存在しえないので、
    // クエリを送らず未達成として扱う (checkTimeAchievement と同型)。
    const styleCode = toStyleCode(params.style);
    if (!styleCode) {
      return { achieved: false };
    }

    // 条件に一致するpractice_logsを取得
    const { data: logs, error: logError } = await this.supabase
      .from("practice_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("distance", params.distance)
      .ilike("style", styleCode)
      .eq("swim_category", params.swim_category)
      .eq("rep_count", params.reps)
      .gte("set_count", params.sets)
      .order("created_at", { ascending: false })
      .limit(1);

    const firstLog = logs?.[0];
    if (logError || !logs || logs.length === 0 || !firstLog) {
      return { achieved: false };
    }

    // 条件を満たすログが1件以上あればOK
    return {
      achieved: true,
      achievementData: {
        practiceLogId: firstLog.id,
        achievedValue: {
          distance: params.distance,
          reps: params.reps,
          sets: params.sets,
          circle: params.circle,
        },
      },
    };
  }

  // =========================================================================
  // レコード存在確認ロジック（ステータス遷移用）
  // =========================================================================

  /**
   * マイルストーンに関連するレコードが存在するか確認
   * @private
   */
  private async hasRecordsForMilestone(userId: string, milestone: Milestone): Promise<boolean> {
    if (milestone.type === "time") {
      return await this.hasTimeRecords(userId, milestone);
    } else if (milestone.type === "reps_time") {
      return await this.hasRepsTimeRecords(userId, milestone);
    } else if (milestone.type === "set") {
      return await this.hasSetRecords(userId, milestone);
    }
    return false;
  }

  /**
   * time型のレコード存在確認
   * @private
   */
  private async hasTimeRecords(userId: string, milestone: Milestone): Promise<boolean> {
    const params = milestone.params as MilestoneTimeParams;

    // ilike に渡す前に canonical 化する理由は checkTimeAchievement 内の
    // 同型クエリのコメント参照 (ワイルドカード注入対策。canonical 外なら
    // practice_logs/styles マスターに一致する行は存在しえないのでクエリを
    // 送らず false とする)。practice_logs 側・records 側の両方で使い回す。
    const styleCode = toStyleCode(params.style);
    if (!styleCode) {
      return false;
    }

    // 練習記録を確認（practice_timesが存在するか）
    const { data: practiceLogs, error: practiceError } = await this.supabase
      .from("practice_logs")
      .select(
        `
        id,
        practice_times(id)
      `,
      )
      .eq("user_id", userId)
      .eq("distance", params.distance)
      .ilike("style", styleCode)
      // swim_category は checkTimeAchievement と同じ理由 (ENUM 型で表記揺れ無し) で
      // .eq の完全一致で絞る。判定 (checkTimeAchievement) と条件がずれると
      // 「記録はあるのに達成判定はされない」等の不整合が起きるため揃える。
      .eq("swim_category", params.swim_category)
      .limit(1);

    if (!practiceError && practiceLogs && practiceLogs.length > 0) {
      // practice_timesが存在するか確認
      for (const log of practiceLogs) {
        const times = Array.isArray(log.practice_times)
          ? log.practice_times
          : log.practice_times
            ? [log.practice_times]
            : [];
        if (times.length > 0) {
          return true;
        }
      }
    }

    // 大会記録を確認。
    const { data: records, error: recordError } = await this.supabase
      .from("records")
      .select(
        `
        id,
        styles!inner(distance, style)
      `,
      )
      .eq("user_id", userId)
      .eq("styles.distance", params.distance)
      // ケース非依存にする理由・デプロイ順序の注意点は checkTimeAchievement 内の
      // 同型クエリのコメント参照 (移行期の暫定措置。恒久固定ではない)。
      .ilike("styles.style", styleCode)
      // 判定 (checkTimeAchievement) と条件をそろえる。引き継ぎの記録は
      // 「記録あり」判定にも数えない。
      .eq("is_relaying", false)
      .limit(1);

    if (!recordError && records && records.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * reps_time型のレコード存在確認
   * @private
   */
  private async hasRepsTimeRecords(userId: string, milestone: Milestone): Promise<boolean> {
    const params = milestone.params as MilestoneRepsTimeParams;

    // canonical 外なら practice_logs マスターに一致する行は存在しえないので、
    // クエリを送らず false とする (hasTimeRecords と同型)。
    const styleCode = toStyleCode(params.style);
    if (!styleCode) {
      return false;
    }

    // 条件に一致するpractice_logsを確認（practice_timesが存在するか）
    const { data: logs, error: logError } = await this.supabase
      .from("practice_logs")
      .select(
        `
        id,
        practice_times(id)
      `,
      )
      .eq("user_id", userId)
      .eq("distance", params.distance)
      .ilike("style", styleCode)
      .eq("swim_category", params.swim_category)
      .gte("rep_count", params.reps)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return false;
    }

    // practice_timesが存在するか確認
    for (const log of logs) {
      const times = Array.isArray(log.practice_times)
        ? log.practice_times
        : log.practice_times
          ? [log.practice_times]
          : [];
      if (times.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * set型のレコード存在確認
   * @private
   */
  private async hasSetRecords(userId: string, milestone: Milestone): Promise<boolean> {
    const params = milestone.params as MilestoneSetParams;

    // canonical 外なら practice_logs マスターに一致する行は存在しえないので、
    // クエリを送らず false とする (hasTimeRecords と同型)。
    const styleCode = toStyleCode(params.style);
    if (!styleCode) {
      return false;
    }

    // 条件に一致するpractice_logsを確認
    const { data: logs, error: logError } = await this.supabase
      .from("practice_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("distance", params.distance)
      .ilike("style", styleCode)
      .eq("swim_category", params.swim_category)
      .eq("rep_count", params.reps)
      .gte("set_count", params.sets)
      .limit(1);

    if (logError || !logs || logs.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * ユーザーの全アクティブなマイルストーンのステータスを更新
   * 練習記録・大会記録作成/更新時に自動実行
   */
  async updateAllMilestoneStatuses(userId: string): Promise<void> {
    // ユーザーの全アクティブなマイルストーンを取得
    const { data: milestones, error: milestonesError } = await this.supabase
      .from("milestones")
      .select(
        `
        *,
        goals!inner(user_id)
      `,
      )
      .eq("goals.user_id", userId)
      .in("status", ["not_started", "in_progress"]);

    if (milestonesError || !milestones) {
      return;
    }

    const today = format(new Date(), "yyyy-MM-dd"); // ローカル日付のYYYY-MM-DD形式

    // マイルストーンごとの判定・更新は互いに独立しているため並列実行する
    // (1件の失敗が残り全件の判定を止めないようにする)。主キーで取得した
    // 行の配列なので同一マイルストーンが重複することはない。
    const results = await Promise.allSettled(
      milestones.map((milestone) => this.processMilestoneStatusUpdate(userId, milestone, today)),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected" && process.env.NODE_ENV !== "production") {
        console.error(
          `マイルストーン ${milestones[index]?.id} のステータス更新中にエラー:`,
          result.reason,
        );
      }
    });
  }

  /**
   * 単一マイルストーンの達成判定・ステータス更新・期限切れチェック。
   * updateAllMilestoneStatuses から並列に呼ばれる (1件分の処理を独立させたもの)。
   * @private
   */
  private async processMilestoneStatusUpdate(
    userId: string,
    milestone: Milestone,
    today: string,
  ): Promise<void> {
    // 達成判定
    const { achieved, achievementData } = await this.checkMilestoneAchievement(milestone);

    if (achieved && milestone.status !== "achieved") {
      // 達成状態に更新
      await this.updateMilestoneStatus(milestone.id, "achieved", new Date().toISOString());

      // ローカル変数も更新（期限切れチェックで正しく判定するため）
      milestone.status = "achieved";

      // 達成記録を保存（milestone_achievements）
      if (achievementData) {
        try {
          // 重複チェック: 既に同じマイルストーン・同じレコードのachievementが存在するか確認
          let shouldInsert = true;

          if (achievementData.practiceLogId) {
            const existingCheck = await this.supabase
              .from("milestone_achievements")
              .select("id")
              .eq("milestone_id", milestone.id)
              .eq("practice_log_id", achievementData.practiceLogId)
              .maybeSingle();

            if (existingCheck.error && existingCheck.error.code !== "PGRST116") {
              // PGRST116は「not found」エラー（正常なケース）
              console.warn(
                `マイルストーン ${milestone.id} の達成記録重複チェック中にエラー:`,
                existingCheck.error,
              );
            } else if (existingCheck.data) {
              // 既に存在する場合はスキップ（並行実行時の重複防止）
              shouldInsert = false;
            }
          } else if (achievementData.recordId) {
            const existingCheck = await this.supabase
              .from("milestone_achievements")
              .select("id")
              .eq("milestone_id", milestone.id)
              .eq("record_id", achievementData.recordId)
              .maybeSingle();

            if (existingCheck.error && existingCheck.error.code !== "PGRST116") {
              // PGRST116は「not found」エラー（正常なケース）
              console.warn(
                `マイルストーン ${milestone.id} の達成記録重複チェック中にエラー:`,
                existingCheck.error,
              );
            } else if (existingCheck.data) {
              // 既に存在する場合はスキップ（並行実行時の重複防止）
              shouldInsert = false;
            }
          }

          // 達成記録を挿入（重複がない場合のみ）
          if (shouldInsert) {
            const { error: achievementError } = await this.supabase
              .from("milestone_achievements")
              .insert({
                milestone_id: milestone.id,
                practice_log_id: achievementData.practiceLogId || null,
                record_id: achievementData.recordId || null,
                achieved_value: achievementData.achievedValue,
              });

            if (achievementError) {
              // ユニーク制約エラー（重複）の場合は警告のみで続行
              // その他のエラーもログに記録して続行（他のマイルストーンの処理を中断しない）
              const isDuplicateError =
                achievementError.code === "23505" || // PostgreSQL unique violation
                achievementError.message?.includes("duplicate") ||
                achievementError.message?.includes("unique");

              if (isDuplicateError) {
                console.warn(
                  `マイルストーン ${milestone.id} の達成記録は既に存在します（並行実行による重複）:`,
                  achievementError.message,
                );
              } else {
                console.error(
                  `マイルストーン ${milestone.id} の達成記録の保存に失敗:`,
                  achievementError,
                );
              }
              // エラーが発生してもループを継続（他のマイルストーンの処理を続行）
            }
          }
        } catch (error) {
          // 予期しないエラーもキャッチしてログに記録し、処理を続行
          console.error(
            `マイルストーン ${milestone.id} の達成記録保存中に予期しないエラー:`,
            error,
          );
          // エラーが発生してもループを継続
        }
      }
    } else if (!achieved && milestone.status === "not_started") {
      // 関連レコードが存在する場合のみ「進行中」に変更
      const hasRecords = await this.hasRecordsForMilestone(userId, milestone);
      if (hasRecords) {
        await this.updateMilestoneStatus(milestone.id, "in_progress");
        // ローカル変数も更新（期限切れチェックで正しく判定するため）
        milestone.status = "in_progress";
      }
    }

    // 期限切れチェック
    if (milestone.deadline) {
      // deadlineは既にYYYY-MM-DD形式の文字列として格納されているため、そのまま使用
      // ただし、Dateオブジェクトの場合はformatで変換
      const deadline =
        typeof milestone.deadline === "string"
          ? milestone.deadline
          : format(new Date(milestone.deadline), "yyyy-MM-dd");
      if (deadline < today && milestone.status !== "achieved") {
        await this.updateMilestoneStatus(milestone.id, "expired");
      }
    }
  }
}
