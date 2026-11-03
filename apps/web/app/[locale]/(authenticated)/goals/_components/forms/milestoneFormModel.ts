// =============================================================================
// マイルストーンフォームのタブ ⇔ 保存する type + params の変換 (mobile の MilestoneFormScreen と同じ規則)
// =============================================================================
import { DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS, DEFAULT_TIME_PARAMS } from "@apps/shared/constants/goals";
import type {
  Milestone,
  MilestoneOtherParams,
  MilestoneParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  MilestoneType,
} from "@apps/shared/types";
import {
  isMilestoneRepsTimeParams,
  isMilestoneSetParams,
  isMilestoneTimeParams,
  timeParamsToRepsTime,
} from "@apps/shared/types/goals";

/**
 * フォームのタブと DB の type:
 * - practice_time: reps_time 型 (1本×1セットは旧タイム目標と同じく大会記録でも判定される)
 * - set: set 型
 * - other: other 型 (自由記述。内容は title)
 */
export type MilestoneFormTab = "practice_time" | "set" | "other";
export type MilestoneFormParams = MilestoneRepsTimeParams | MilestoneSetParams | MilestoneOtherParams;

export function defaultParamsFor(tab: MilestoneFormTab): MilestoneFormParams {
  // shared の定数は共有オブジェクトなので、state に入れる前に必ず複製する
  if (tab === "practice_time") {
    // 本数・セット数を増やしたときのサークルは平均タイム目標の既定値にしておく
    return { ...timeParamsToRepsTime(DEFAULT_TIME_PARAMS), circle: DEFAULT_REPS_TIME_PARAMS.circle };
  }
  if (tab === "set") return { ...DEFAULT_SET_PARAMS };
  return {};
}

/** 1本×1セットの練習タイム目標 (= 旧タイム目標) */
export function isSinglePracticeTime(params: MilestoneRepsTimeParams): boolean {
  return params.reps <= 1 && params.sets <= 1;
}

/** 保存済みのマイルストーン (type + params) をフォームのタブと入力値に変換する */
export function milestoneToForm(milestone: Pick<Milestone, "type" | "params">): {
  tab: MilestoneFormTab;
  params: MilestoneFormParams;
} {
  const p = milestone.params;
  if (milestone.type === "time" && isMilestoneTimeParams(p)) {
    return { tab: "practice_time", params: timeParamsToRepsTime(p) };
  }
  if (milestone.type === "reps_time" && isMilestoneRepsTimeParams(p)) {
    return { tab: "practice_time", params: { ...p } };
  }
  if (milestone.type === "set" && isMilestoneSetParams(p)) {
    return { tab: "set", params: { ...p } };
  }
  return { tab: "other", params: {} };
}

/** フォームのタブと入力値を、保存する type + params に変換する。食い違っていれば null */
export function formToMilestone(
  tab: MilestoneFormTab,
  params: MilestoneFormParams,
): { type: MilestoneType; params: MilestoneParams } | null {
  if (tab === "other") return { type: "other", params: {} };
  if (tab === "set") return isMilestoneSetParams(params) ? { type: "set", params } : null;
  return isMilestoneRepsTimeParams(params) ? { type: "reps_time", params } : null;
}

/** 練習メニューのテンプレートにも追加できるか (本数×セットを持つものだけ) */
export function canAddToPracticeTemplate(tab: MilestoneFormTab, params: MilestoneFormParams): boolean {
  if (tab === "set") return true;
  return tab === "practice_time" && isMilestoneRepsTimeParams(params) && !isSinglePracticeTime(params);
}
