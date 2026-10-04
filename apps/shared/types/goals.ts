// =============================================================================
// 目標管理機能 型定義 - Swim Hub共通パッケージ
// =============================================================================

import { Competition, Style } from "./index";

// =============================================================================
// 1. 基本型定義
// =============================================================================

// 大会目標
export interface Goal {
  id: string;
  user_id: string;
  competition_id: string | null;
  style_id: number;
  target_time: number;
  start_time: number | null;
  status: "active" | "achieved" | "cancelled";
  achieved_at: string | null;
  // 期限切れ振り返り（未達成）メモ。milestones.reflection_note と同型
  reflection_note: string | null;
  created_at: string;
  updated_at: string;
}

// reflection_note は作成時に指定するものではないため MilestoneInsert と同様に Omit する
export type GoalInsert = Omit<
  Goal,
  "id" | "created_at" | "updated_at" | "achieved_at" | "reflection_note"
>;
export type GoalUpdate = Partial<Omit<GoalInsert, "user_id">> & {
  achieved_at?: string | null;
  reflection_note?: string | null;
};

// マイルストーン
export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  type: "time" | "reps_time" | "set";
  params: MilestoneParams;
  deadline: string | null;
  status: MilestoneStatus;
  achieved_at: string | null;
  reflection_done: boolean;
  reflection_note: string | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneStatus = "not_started" | "in_progress" | "achieved" | "expired";

export type MilestoneInsert = Omit<
  Milestone,
  "id" | "created_at" | "updated_at" | "achieved_at" | "reflection_done" | "reflection_note"
>;
export type MilestoneUpdate = Partial<Omit<MilestoneInsert, "goal_id">> & {
  achieved_at?: string | null;
  reflection_done?: boolean;
  reflection_note?: string | null;
};

// マイルストーンパラメータ（Union型）
export type MilestoneParams =
  | MilestoneTimeParams
  | MilestoneRepsTimeParams
  | MilestoneSetParams
  | MilestoneGoalSetParams;

export interface MilestoneTimeParams {
  distance: number;
  target_time: number;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
}

export interface MilestoneRepsTimeParams {
  distance: number;
  reps: number;
  sets: number;
  target_average_time: number;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  circle: number;
}

// ゴールセット用パラメータ（reps_time型を拡張）
export interface MilestoneGoalSetParams extends MilestoneRepsTimeParams {
  practice_pool_type: number; // ゴールセット実施水路（0: 短水路, 1: 長水路）
}

export interface MilestoneSetParams {
  distance: number;
  reps: number;
  sets: number;
  circle: number;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
}

// 達成記録
export interface MilestoneAchievement {
  id: string;
  milestone_id: string;
  practice_log_id: string | null;
  record_id: string | null;
  achieved_value: Record<string, unknown>; // JSONB型
  achieved_at: string;
}

export type MilestoneAchievementInsert = Omit<MilestoneAchievement, "id" | "achieved_at">;

// =============================================================================
// 2. JOINされた型定義
// =============================================================================

// 大会目標 with 大会・種目・マイルストーン
// competition は null になりうる: (1) competition_id 自体が NULL
// (個人大会削除・FK の ON DELETE SET NULL) (2) competition_id は非 NULL だが
// チーム退会等で RLS 経由の embed が見えない場合。呼び出し側は必ず null ガードすること。
export interface GoalWithMilestones extends Goal {
  competition: Competition | null;
  style: Style;
  milestones: Milestone[];
}

// マイルストーン with 目標
export interface MilestoneWithGoal extends Milestone {
  goal: Goal & {
    competition: Competition | null;
    style: Style;
  };
}

// =============================================================================
// 3. 型ガード関数
// =============================================================================

export function isMilestoneTimeParams(params: MilestoneParams): params is MilestoneTimeParams {
  return (
    "target_time" in params &&
    !("target_average_time" in params) &&
    !("sets" in params && "circle" in params && !("target_average_time" in params))
  );
}

export function isMilestoneRepsTimeParams(
  params: MilestoneParams,
): params is MilestoneRepsTimeParams {
  return "target_average_time" in params && "reps" in params;
}

export function isMilestoneSetParams(params: MilestoneParams): params is MilestoneSetParams {
  return "sets" in params && "circle" in params && !("target_average_time" in params);
}

export function isMilestoneGoalSetParams(
  params: MilestoneParams,
): params is MilestoneGoalSetParams {
  return "practice_pool_type" in params && "target_average_time" in params && "reps" in params;
}

/**
 * マイルストーンの目標タイム欄 (type: "time" の target_time / type: "reps_time" の
 * target_average_time) が保存可能な値かどうかを判定する。0秒は意味の無い目標タイムであり
 * 達成判定も成立しないため無効とする。タイムを持たない set 型は常に有効とみなす。
 */
export function isMilestoneTimeValueValid(params: MilestoneParams): boolean {
  if (isMilestoneTimeParams(params)) return params.target_time > 0;
  if (isMilestoneRepsTimeParams(params)) return params.target_average_time > 0;
  return true;
}

/**
 * マイルストーンの params が保存可能かを判定する。0 や空欄 (フォーム上は 0 に変換される) の
 * まま保存すると達成判定が成立しなくなる (reps=0 → 0/0=NaN 等) ため、type ごとに必須値を検査する。
 * - 共通: distance > 0
 * - time: target_time > 0
 * - reps_time: reps >= 1, sets >= 1, target_average_time > 0 (circle は判定にも要約文にも使わないので不問)
 * - set: reps >= 1, sets >= 1, circle > 0
 * type と params の型が食い違う場合は false。
 */
export function isMilestoneParamsSavable(
  type: "time" | "reps_time" | "set",
  params: MilestoneParams,
): boolean {
  if (!(params.distance > 0)) return false;
  if (type === "time") {
    return isMilestoneTimeParams(params) && params.target_time > 0;
  }
  if (type === "reps_time") {
    return (
      isMilestoneRepsTimeParams(params) &&
      params.reps >= 1 &&
      params.sets >= 1 &&
      params.target_average_time > 0
    );
  }
  return (
    isMilestoneSetParams(params) && params.reps >= 1 && params.sets >= 1 && params.circle > 0
  );
}

// =============================================================================
// 4. フォーム用型定義（camelCase）
// =============================================================================

export interface CreateGoalInput {
  userId: string;
  competitionId?: string; // 既存の大会IDまたはundefined
  competitionData?: {
    title: string;
    date: string;
    /** 複数日開催の終了日。単日・未指定は null / undefined */
    endDate?: string | null;
    place: string | null;
    poolType: number;
  };
  styleId: number;
  targetTime: number;
  startTime?: number | null;
  // 対象大会の水路（0: 短水路, 1: 長水路）。startTime 未指定時の自己ベスト
  // 自動取得 (getBestTimeForStyle) を対象大会と同じ水路に絞るために使う
  poolType?: number;
}

export interface UpdateGoalInput {
  id: string;
  competitionId?: string;
  styleId?: number;
  targetTime?: number;
  startTime?: number | null;
  status?: "active" | "achieved" | "cancelled";
  reflectionNote?: string | null;
}

export interface CreateMilestoneInput {
  goalId: string;
  title: string;
  type: "time" | "reps_time" | "set";
  params: MilestoneParams;
  deadline?: string | null;
}

export interface UpdateMilestoneInput {
  id: string;
  type?: "time" | "reps_time" | "set";
  title?: string;
  params?: MilestoneParams;
  deadline?: string | null;
  reflectionNote?: string | null;
}
