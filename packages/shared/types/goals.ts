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

/**
 * マイルストーンのタイプ。
 * - reps_time: 練習タイム目標。1本×1セットは練習タイム1本 + 大会記録で、それ以外は
 *   本数の平均タイムで判定する
 * - set: サークルイン目標
 * - other: 自由記述 (内容は title に持つ)。自動判定せず手動で完了にする
 * - time: 旧「タイム目標」。reps_time (1本×1セット) に統合済み。新しいコードは書き込まず
 *   (createMilestone / updateMilestone で reps_time に変換)、配布済みの古いアプリが
 *   書いた行を読むためだけに残している
 */
export type MilestoneType = "time" | "reps_time" | "set" | "other";

// マイルストーン
export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  type: MilestoneType;
  params: MilestoneParams;
  deadline: string | null;
  status: MilestoneStatus;
  achieved_at: string | null;
  reflection_done: boolean;
  reflection_note: string | null;
  /**
   * 達成候補 (mobile の確認ダイアログ用)。判定で条件を満たす記録が見つかったが、
   * まだユーザーが「達成！」を押していない状態。null は候補なし。
   * 列追加前のデータ・テストの fixture では欠けるので optional
   */
  achievement_candidate?: MilestoneAchievementCandidate | null;
  /** 確認ダイアログで「キャンセル」した日時。これ以前に登録した記録では再び候補にしない */
  candidate_dismissed_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** 達成候補の根拠 (確定時に milestone_achievements へ書く内容) */
export interface MilestoneAchievementCandidate {
  practice_log_id: string | null;
  record_id: string | null;
  achieved_value: Record<string, unknown>;
  detected_at: string;
}

export type MilestoneStatus = "not_started" | "in_progress" | "achieved" | "expired";

export type MilestoneInsert = Omit<
  Milestone,
  | "id"
  | "created_at"
  | "updated_at"
  | "achieved_at"
  | "reflection_done"
  | "reflection_note"
  | "achievement_candidate"
  | "candidate_dismissed_at"
>;
export type MilestoneUpdate = Partial<Omit<MilestoneInsert, "goal_id">> & {
  achieved_at?: string | null;
  reflection_done?: boolean;
  reflection_note?: string | null;
  achievement_candidate?: MilestoneAchievementCandidate | null;
  candidate_dismissed_at?: string | null;
};

// マイルストーンパラメータ（Union型）
export type MilestoneParams =
  | MilestoneTimeParams
  | MilestoneRepsTimeParams
  | MilestoneSetParams
  | MilestoneGoalSetParams
  | MilestoneOtherParams;

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

/** type: "other" の params。内容は title に持つので空オブジェクト ({}) で保存する */
export type MilestoneOtherParams = Record<string, never>;

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

/** 練習タイム目標の 1本×1セット (= 旧タイム目標。大会記録でも判定する) */
export function isSingleRepsTimeParams(
  params: MilestoneParams,
): params is MilestoneRepsTimeParams {
  return isMilestoneRepsTimeParams(params) && params.reps === 1 && params.sets === 1;
}

/** 旧タイム目標の params を練習タイム目標 (1本×1セット) の params に変換する */
export function timeParamsToRepsTime(params: MilestoneTimeParams): MilestoneRepsTimeParams {
  return {
    distance: params.distance,
    reps: 1,
    sets: 1,
    target_average_time: params.target_time,
    style: params.style,
    swim_category: params.swim_category,
    circle: 0,
  };
}

/**
 * 保存・判定の前に旧 time 型を reps_time (1本×1セット) にそろえる。
 * time は配布済みの古いアプリが書くことがあるので、読む側でも必ず通す。
 */
export function normalizeMilestoneTypeParams(
  type: MilestoneType,
  params: MilestoneParams,
): { type: MilestoneType; params: MilestoneParams } {
  if (type === "time" && isMilestoneTimeParams(params)) {
    return { type: "reps_time", params: timeParamsToRepsTime(params) };
  }
  return { type, params };
}

/** 水泳の条件 (距離) を持たない params = type: "other" */
export function isMilestoneOtherParams(params: MilestoneParams): params is MilestoneOtherParams {
  return !("distance" in params);
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
 * - other: 水泳の条件を持たない (params は {})。内容 (title) の検査は呼び出し側で行う
 * type と params の型が食い違う場合は false。
 */
export function isMilestoneParamsSavable(type: MilestoneType, params: MilestoneParams): boolean {
  if (type === "other") return isMilestoneOtherParams(params);
  if (isMilestoneOtherParams(params) || !(params.distance > 0)) return false;
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
}

export interface UpdateGoalInput {
  id: string;
  competitionId?: string;
  styleId?: number;
  targetTime?: number;
  status?: "active" | "achieved" | "cancelled";
  reflectionNote?: string | null;
}

export interface CreateMilestoneInput {
  goalId: string;
  title: string;
  type: MilestoneType;
  params: MilestoneParams;
  deadline?: string | null;
}

export interface UpdateMilestoneInput {
  id: string;
  type?: MilestoneType;
  title?: string;
  params?: MilestoneParams;
  deadline?: string | null;
  reflectionNote?: string | null;
}
