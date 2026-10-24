/**
 * 目標の達成率 = マイルストーンの達成数 ÷ 全件 × 100 (唯一の定義元)。
 * 0件は null (呼び出し側は「未設定」を出し、% もバーも出さない)。
 */
export function computeMilestoneRatio(milestones: ReadonlyArray<{ status: string }>): number | null {
  if (milestones.length === 0) return null;
  const achieved = milestones.filter((m) => m.status === "achieved").length;
  return (achieved / milestones.length) * 100;
}
