// =============================================================================
// 目標管理機能 定数定義
// =============================================================================

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

export {
  DEFAULT_TIME_PARAMS,
  DEFAULT_REPS_TIME_PARAMS,
  DEFAULT_SET_PARAMS,
} from "@apps/shared/constants/goals";
