import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoalAPI } from "@apps/shared/api/goals";
import type { GoalWithMilestones, Milestone } from "@apps/shared/types";
import { runMilestoneJudgment } from "@apps/shared/utils/milestoneJudgment";

/**
 * ダッシュボードのマウント時に1回だけ、期限切れの目標・マイルストーンを確認する。
 * 達成判定を先に走らせ (代理入力分を反映し、達成済みマイルストーンに「未達成」の振り返りを
 * 出さないため)、期限切れ目標を優先し、無ければ期限切れマイルストーンを1件だけ返す。
 * アプリ復帰やタブ再フォーカスでは再実行しない。
 */
export function useExpiredGoalCheck(supabase: SupabaseClient, userId: string | undefined) {
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const [expiredGoal, setExpiredGoal] = useState<GoalWithMilestones | null>(null);
  const [expiredMilestone, setExpiredMilestone] = useState<Milestone | null>(null);
  const hasCheckedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** 期限切れ目標 → 無ければ期限切れマイルストーン の順に先頭1件を取り直す */
  const loadNext = useCallback(async () => {
    const goals = await goalAPI.getExpiredGoals();
    const firstGoal = goals[0];
    if (firstGoal) {
      if (isMountedRef.current) setExpiredGoal(firstGoal);
      return;
    }
    if (isMountedRef.current) setExpiredGoal(null);
    const milestones = await goalAPI.getExpiredMilestones();
    const firstMilestone = milestones[0];
    if (firstMilestone && isMountedRef.current) setExpiredMilestone(firstMilestone);
  }, [goalAPI]);

  useEffect(() => {
    if (!userId || hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    void (async () => {
      try {
        await runMilestoneJudgment(goalAPI, userId);
        await loadNext();
      } catch (error) {
        console.error("Failed to check expired goals:", error);
      }
    })();
  }, [userId, goalAPI, loadNext]);

  /** 目標の振り返りを保存した後。次の期限切れ目標、尽きたらマイルストーンへ進む */
  const handleGoalSaved = useCallback(async () => {
    try {
      await loadNext();
    } catch (error) {
      console.error("Failed to check expired goals:", error);
      if (isMountedRef.current) setExpiredGoal(null);
    }
  }, [loadNext]);

  /** マイルストーンの振り返りを保存した後。次の期限切れマイルストーンを出す */
  const handleMilestoneSaved = useCallback(async () => {
    try {
      const milestones = await goalAPI.getExpiredMilestones();
      if (isMountedRef.current) setExpiredMilestone(milestones[0] ?? null);
    } catch (error) {
      console.error("Failed to check expired goals:", error);
      if (isMountedRef.current) setExpiredMilestone(null);
    }
  }, [goalAPI]);

  /** スキップ: 閉じるだけ。そのマウント中は次の期限切れを出さない */
  const skipGoal = useCallback(() => setExpiredGoal(null), []);
  const skipMilestone = useCallback(() => setExpiredMilestone(null), []);

  return {
    expiredGoal,
    expiredMilestone,
    handleGoalSaved,
    handleMilestoneSaved,
    skipGoal,
    skipMilestone,
  };
}
