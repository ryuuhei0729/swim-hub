import { useEffect, useMemo, useRef } from "react";
import { Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useMilestoneSummary } from "@/hooks/useMilestoneSummary";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import type { Milestone } from "@apps/shared/types";
import { formatTimeBest } from "@apps/shared/utils/time";

/** 候補の根拠 (achieved_value) から「記録: 29.85」「平均: 31.20」の行を作る。出せなければ null */
function evidenceKey(milestone: Milestone): { key: "recordTime" | "averageTime"; time: number } | null {
  const value = milestone.achievement_candidate?.achieved_value;
  if (!value) return null;
  if (typeof value.time === "number") return { key: "recordTime", time: value.time };
  if (typeof value.average_time === "number") return { key: "averageTime", time: value.average_time };
  return null;
}

/**
 * 達成の確認ダイアログ。mobile は判定で条件を満たす記録が見つかっても自動では達成にせず
 * (App.tsx の configureMilestoneJudgment({ autoAchieve: false }))、達成候補を置く。
 * ここで候補を1件ずつ「もしかしてマイルストーンを達成しましたか？」と聞き、
 * 「達成！」で達成に、「キャンセル」で候補を取り下げる (その時点より前の記録では二度と聞かない)。
 *
 * 判定 (練習・大会記録の保存後、目標タブを開いたとき等) のたびに goalKeys.all が
 * invalidate されて候補を取り直すので、どの画面にいても出る。画面は描かない (null を返す)。
 */
export function MilestoneAchievementPrompter(): null {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const queryClient = useQueryClient();
  const summarize = useMilestoneSummary();
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  // 表示中のダイアログの milestone id。Alert は重ねると前のものが消えるので、答えるまで次を出さない
  const showingRef = useRef<string | null>(null);

  const { data: pending } = useQuery({
    queryKey: goalKeys.pendingAchievements(),
    queryFn: () => goalAPI.getPendingAchievementMilestones(),
    enabled: !!user,
  });

  useEffect(() => {
    if (showingRef.current !== null) return;
    const milestone = pending?.[0];
    if (!milestone) return;
    showingRef.current = milestone.id;

    const answer = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        console.error("Failed to answer milestone achievement prompt:", error);
        Alert.alert(t("common.alertErrorTitle"), t("goals.milestone.completionFailed"));
      } finally {
        showingRef.current = null;
        // 一覧・詳細の状態と、残りの候補 (次のダイアログ) を取り直す
        await queryClient.invalidateQueries({ queryKey: goalKeys.all });
      }
    };

    const lines = [milestone.title];
    if (milestone.type !== "other") {
      const summary = summarize(milestone);
      if (summary !== milestone.title) lines.push(summary);
    }
    const evidence = evidenceKey(milestone);
    if (evidence) {
      lines.push(t(`goals.achievementPrompt.${evidence.key}`, { time: formatTimeBest(evidence.time) }));
    }

    Alert.alert(
      t("goals.achievementPrompt.title"),
      lines.join("\n"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
          onPress: () => void answer(() => goalAPI.dismissMilestoneCandidate(milestone)),
        },
        {
          text: t("goals.achievementPrompt.confirm"),
          onPress: () => void answer(() => goalAPI.confirmMilestoneAchievement(milestone)),
        },
      ],
      // Android で枠外タップで閉じると、どちらにも答えないまま次の判定まで出なくなるので閉じさせない
      { cancelable: false },
    );
  }, [pending, goalAPI, queryClient, summarize, t]);

  return null;
}
