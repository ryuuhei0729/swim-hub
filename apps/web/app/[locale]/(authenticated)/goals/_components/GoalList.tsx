"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { TrashIcon, PencilIcon } from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import type { Goal } from "@apps/shared/types";
import ProgressBar from "./ProgressBar";

interface GoalListProps {
  goals: (Goal & {
    // null = 大会情報なし (個人大会削除・チーム退会)。呼び出し元 (useGoalsQuery の select)
    // が必ず null に正規化して渡すため undefined は来ない (GoalsClient.tsx の1箇所のみから
    // 渡される)。判定は === null の1本のまま緩めない
    competition?: { title: string | null } | null;
    style?: { name_jp: string };
  })[];
  selectedGoalId: string | null;
  onSelectGoal: (goalId: string) => void;
  onDeleteGoal: () => Promise<void>;
  onEditGoal: (goalId: string) => void;
}

/**
 * 大会目標リストコンポーネント
 */
export default function GoalList({
  goals,
  selectedGoalId,
  onSelectGoal,
  onDeleteGoal,
  onEditGoal,
}: GoalListProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  // null = 計算不能 (水路が分からない。大会情報なしの目標)
  const [progressMap, setProgressMap] = useState<Record<string, number | null>>({});
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);

  // 各目標の達成率を計算
  useEffect(() => {
    const calculateProgresses = async () => {
      const newProgressMap: Record<string, number | null> = {};
      for (const goal of goals) {
        try {
          const progress = await goalAPI.calculateGoalProgress(goal.id);
          newProgressMap[goal.id] = progress;
        } catch (error) {
          console.error(`目標 ${goal.id} の達成率計算エラー:`, error);
          newProgressMap[goal.id] = 0;
        }
      }
      setProgressMap(newProgressMap);
    };

    if (goals.length > 0) {
      calculateProgresses();
    }
  }, [goals, supabase, goalAPI]);

  const handleDelete = async (e: React.MouseEvent, goalId: string) => {
    e.stopPropagation();
    if (confirm(t("list.deleteConfirm"))) {
      try {
        await goalAPI.deleteGoal(goalId);
        await onDeleteGoal();
      } catch (error) {
        console.error("目標削除エラー:", error);
        alert(t("list.deleteFailed"));
      }
    }
  };

  const handleEdit = (e: React.MouseEvent, goalId: string) => {
    e.stopPropagation();
    onEditGoal(goalId);
  };

  // 判定条件は goal.competition === null の1つに統一する。
  // competitionFallback は competition はあるが title が空のときだけ使う。
  const getCompetitionName = (goal: {
    competition?: { title: string | null } | null;
  }): string => {
    if (goal.competition === null) return t("list.competitionInfoUnavailable");
    return goal.competition?.title || t("list.competitionFallback");
  };

  const getStyleName = (goal: Goal & { style?: { name_jp: string } }): string => {
    return goal.style?.name_jp || t("list.styleFallback");
  };

  if (goals.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <p className="text-gray-500 text-center py-4 sm:py-8 text-xs sm:text-base">
          {t("list.empty")}
          <br />
          {t("list.emptyDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => {
        // progressMap[goal.id] は 計算中 (undefined) と 計算不能 (null) をどちらも
        // 「達成率を表示できない」として扱う。ProgressBar には number しか渡せないため
        // (?? 0 で誤魔化すと計算不能なのに 0% のバーが出てしまう)、どちらの場合も
        // バー自体を描画しない
        const progress = progressMap[goal.id];
        const isSelected = selectedGoalId === goal.id;
        const isAchieved = goal.status === "achieved";
        // 大会情報が無い目標 (大会削除後・チーム退会後) は閲覧・削除のみ。編集導線を出さない
        const competitionUnavailable = goal.competition === null;

        return (
          <div
            key={goal.id}
            onClick={() => onSelectGoal(goal.id)}
            className={`
              rounded-lg shadow p-4 cursor-pointer transition-all
              ${isSelected ? "ring-2 ring-blue-500" : "hover:shadow-md"}
              ${isAchieved ? "bg-green-50 border border-green-200" : "bg-white"}
            `}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">
                    {getCompetitionName(goal)}
                  </h3>
                  {isAchieved && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {t("list.achievedBadge")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">{getStyleName(goal)}</p>
                {competitionUnavailable && (
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {t("list.editUnavailableReason")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!competitionUnavailable && (
                  <button
                    onClick={(e) => handleEdit(e, goal.id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                    title={t("list.edit")}
                    aria-label={t("list.edit")}
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={(e) => handleDelete(e, goal.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title={t("list.delete")}
                  aria-label={t("list.delete")}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>{t("list.targetTimePrefix")} {formatTimeBest(goal.target_time)}</span>
                <span>
                  {progress != null ? `${progress.toFixed(0)}%` : t("detail.notSet")}
                </span>
              </div>
              {progress != null && <ProgressBar progress={progress} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
