// =============================================================================
// 目標の達成率 (差分ベース) - 唯一の定義元
// =============================================================================
// (初期タイム - 現在のベスト) / (初期タイム - 目標タイム) × 100 を 0〜100 にクランプする。
// 本人画面 (GoalAPI.calculateGoalProgress) とチーム管理者の閲覧画面の両方がここを呼ぶ。
// 式を他所に書き写さないこと (片方だけ変わると同じ目標で達成率が食い違う)。
//
// 水路が分からない (大会 NULL) ときの「計算不能 (null)」はこの関数の責務ではなく、
// 呼び出し側が判定する。ここに来た時点で currentBestTime の取得条件は確定している。
// =============================================================================

export interface ComputeGoalProgressParams {
  startTime: number | null;
  targetTime: number;
  currentBestTime: number | null;
}

export function computeGoalProgress({
  startTime,
  targetTime,
  currentBestTime,
}: ComputeGoalProgressParams): number {
  // 初期タイムが無い (または 0) → 0%
  if (!startTime) return 0;
  // ベストが無い (または 0) → 0%
  if (!currentBestTime) return 0;

  const targetImprovement = startTime - targetTime;
  // 目標が初期タイム以下 → 0%
  if (targetImprovement <= 0) return 0;

  const progress = ((startTime - currentBestTime) / targetImprovement) * 100;
  return Math.min(Math.max(progress, 0), 100);
}
