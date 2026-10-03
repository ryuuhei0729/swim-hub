"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import type { GoalWithMilestones, Style } from "@apps/shared/types";
import ProgressBar from "./ProgressBar";
import MilestoneList from "./MilestoneList";
import MilestoneCreateModal from "./MilestoneCreateModal";

interface GoalDetailProps {
  goal: GoalWithMilestones;
  styles: Style[];
  onUpdate: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * 目標詳細コンポーネント
 */
export default function GoalDetail({
  goal,
  styles,
  onUpdate,
  onDelete: _onDelete,
}: GoalDetailProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);

  // null = 計算不能 (水路が分からない。大会情報なしの目標)
  const [progress, setProgress] = useState<number | null>(0);

  // 達成率を計算
  useEffect(() => {
    const calculateProgress = async () => {
      try {
        const goalAPI = new GoalAPI(supabase);
        const calculatedProgress = await goalAPI.calculateGoalProgress(goal.id);
        setProgress(calculatedProgress);
      } catch (error) {
        console.error("達成率計算エラー:", error);
        setProgress(0);
      }
    };

    calculateProgress();
  }, [goal.id, supabase]);
  const milestoneProgress =
    goal.milestones.length > 0
      ? (goal.milestones.filter((m) => m.status === "achieved").length / goal.milestones.length) *
        100
      : 0;

  const style = styles.find((s) => s.id === goal.style_id);
  // competition は null になりうる (個人大会削除・チーム退会によるRLS不可視化)。
  // 判定条件は goal.competition === null の1つに統一する。
  // competitionFallback は competition はあるが title が空のときだけ使う。
  const competition = goal.competition;
  const competitionUnavailable = competition === null;
  const competitionTitle =
    competition === null ? t("list.competitionInfoUnavailable") : competition.title || t("list.competitionFallback");
  const competitionDate = competition?.date;
  const goalCompetitionDate = competitionDate ?? "";

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{competitionTitle}</h2>
            <p className="text-gray-600 mt-1">
              {style?.name_jp || t("list.styleFallback")} |{" "}
              {competitionDate && isValid(new Date(competitionDate))
                ? format(new Date(competitionDate), "yyyy年M月d日", { locale: ja })
                : t("list.competitionInfoUnavailable")}
            </p>
            {/* 大会情報が無い目標は編集できない理由を明示する */}
            {competitionUnavailable && (
              <p className="text-xs text-amber-600 mt-1">{t("list.editUnavailableReason")}</p>
            )}
          </div>
        </div>

        {/* 目標タイム情報 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">{t("detail.targetTime")}</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatTimeBest(goal.target_time)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">{t("detail.initialTime")}</p>
            <p className="text-lg font-semibold text-gray-900">
              {goal.start_time ? formatTimeBest(goal.start_time) : t("detail.notSet")}
            </p>
          </div>
        </div>

        {/* 達成率。null = 計算不能 (水路が分からない) は既存の「未設定」表示パターンに合わせ、
            ProgressBar 自体を描画しない (0% と誤解させないため) */}
        <div>
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>{t("detail.achievement")}</span>
            <span>{progress !== null ? `${progress.toFixed(0)}%` : t("detail.notSet")}</span>
          </div>
          {progress !== null && <ProgressBar progress={progress} />}
        </div>
      </div>

      {/* マイルストーンセクション */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t("detail.milestoneSection")} ({goal.milestones.filter((m) => m.status === "achieved").length}/
            {goal.milestones.length})
          </h3>
          <button
            onClick={() => setIsMilestoneModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {t("detail.milestoneAdd")}
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>{t("detail.milestoneRatio")}</span>
            <span>{milestoneProgress.toFixed(0)}%</span>
          </div>
          <ProgressBar progress={milestoneProgress} />
        </div>

        <MilestoneList
          milestones={goal.milestones}
          styles={styles}
          goalCompetitionDate={goalCompetitionDate}
          onUpdate={onUpdate}
        />
      </div>

      {/* マイルストーン作成モーダル */}
      <MilestoneCreateModal
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        onSuccess={onUpdate}
        goalId={goal.id}
        goal={goal}
        styles={styles}
        goalCompetitionDate={goalCompetitionDate}
      />
    </div>
  );
}
