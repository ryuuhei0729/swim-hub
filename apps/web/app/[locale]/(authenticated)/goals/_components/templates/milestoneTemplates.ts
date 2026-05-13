import type {
  MilestoneGoalSetParams,
  MilestoneParams,
  MilestoneTimeParams,
} from "@apps/shared/types";

export interface MilestoneTemplate {
  id: string;
  /** 翻訳キー (goals.template.*) */
  nameKey: "timeTrial" | "goalSet";
  /** 翻訳キー (goals.template.*) */
  descriptionKey: "timeTrialDesc" | "goalSetDesc";
  type: "time" | "reps_time" | "set";
  category: "sprint" | "middle" | "long" | "endurance" | "any";
  defaultParams: MilestoneParams;
}

export const MILESTONE_TEMPLATES: MilestoneTemplate[] = [
  // タイムトライアル
  {
    id: "time_trial",
    nameKey: "timeTrial",
    descriptionKey: "timeTrialDesc",
    type: "time",
    category: "any",
    defaultParams: {
      distance: 100, // デフォルト値（実際はgoalから自動取得）
      target_time: 60.0, // デフォルト値（実際はgoalから自動取得し、* 1.01）
      style: "Fr", // デフォルト値（実際はgoalから自動取得）
      swim_category: "Swim",
    } as MilestoneTimeParams,
  },
  // ゴールセット
  {
    id: "goalset_50m_6x3",
    nameKey: "goalSet",
    descriptionKey: "goalSetDesc",
    type: "reps_time",
    category: "middle",
    defaultParams: {
      distance: 50,
      reps: 6,
      sets: 3,
      target_average_time: 35.0, // デフォルト値（実際は逆算で計算）
      style: "Fr",
      swim_category: "Swim",
      circle: 90,
      practice_pool_type: 0, // デフォルト: 短水路（実際はモーダルで選択）
    } as MilestoneGoalSetParams,
  },
];
