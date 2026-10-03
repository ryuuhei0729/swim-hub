// =============================================================================
// 目標管理機能 定数定義
// =============================================================================

import type {
  MilestoneTimeParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
} from "@apps/shared/types";
import { SWIM_STYLES as CANONICAL_SWIM_STYLES } from "@apps/shared/types/common";

// プール種別
export const POOL_TYPES = [
  { value: 0 },
  { value: 1 },
] as const;

// 泳法。canonical (Fr/Br/Ba/Fly/IM、apps/shared/types/common.ts の SWIM_STYLES) から導出する。
// 独立したリテラル配列を持たない (CLAUDE.md: 同一のドメイン対応表を2箇所にハードコードするな)。
export const SWIM_STYLES = CANONICAL_SWIM_STYLES.map((value) => ({ value })) as ReadonlyArray<{
  value: (typeof CANONICAL_SWIM_STYLES)[number];
}>;

// Swim/Pull/Kick
export const SWIM_CATEGORIES = [
  { value: "Swim", label: "Swim" },
  { value: "Pull", label: "Pull" },
  { value: "Kick", label: "Kick" },
] as const;

// マイルストーンパラメータ初期値
export const DEFAULT_TIME_PARAMS: MilestoneTimeParams = {
  distance: 50,
  target_time: 30.0,
  style: "Fr",
  swim_category: "Swim",
};

export const DEFAULT_REPS_TIME_PARAMS: MilestoneRepsTimeParams = {
  distance: 50,
  reps: 10,
  sets: 1,
  target_average_time: 30.0,
  style: "Fr",
  swim_category: "Swim",
  circle: 45,
};

export const DEFAULT_SET_PARAMS: MilestoneSetParams = {
  distance: 200,
  reps: 4,
  sets: 3,
  circle: 140,
  style: "Fr",
  swim_category: "Swim",
};
