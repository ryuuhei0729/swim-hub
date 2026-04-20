export {
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
} from "@apps/shared/constants/onboarding";
export type { OnboardingStep } from "@apps/shared/constants/onboarding";

/** Mobile 用ステップラベル配列 (Stepper コンポーネント向け) */
export const ONBOARDING_STEP_LABELS = ["ようこそ", "プロフィール", "ベストタイム"] as const;
