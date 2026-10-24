// =============================================================================
// オンボーディング定数 - Swim Hub共通パッケージ
// =============================================================================

/** オンボーディングステップの ID 型 */
export type OnboardingStep = 1 | 2 | 3;

/** オンボーディングステップ定義 */
export interface OnboardingStepDefinition {
  id: OnboardingStep;
  label: string;
  description?: string;
}

/** オンボーディングステップ一覧 */
export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  { id: 1, label: "ようこそ" },
  { id: 2, label: "プロフィール" },
  { id: 3, label: "ベストタイム" },
];

/** オンボーディングステップ総数 */
export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;
