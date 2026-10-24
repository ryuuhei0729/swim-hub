"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import type { GoalWithMilestones, Style } from "@apps/shared/types";
import { computeMilestoneRatio } from "@apps/shared/utils/milestoneRatio";
import ProgressBar from "./ProgressBar";
import MilestoneList from "./MilestoneList";
import MilestoneCreateModal from "./MilestoneCreateModal";
import GoalBeforeAfter from "./GoalBeforeAfter";

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
  const tCommon = useTranslations("common");
  const locale = useLocale() as SupportedLocale;
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);

  const milestoneProgress = computeMilestoneRatio(goal.milestones);

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
        <p className="flex items-center gap-2 text-sm">
          {competitionDate && (
            <span className="shrink-0 font-semibold text-gray-700 tabular-nums">
              {formatDate(competitionDate, "numeric", locale)}
            </span>
          )}
          {/* 1行に収める。大会名が長いときは … で省略する (日付・水路は縮めない) */}
          <span className="min-w-0 truncate text-gray-500">{competitionTitle}</span>
          {competition && (
            <span className="shrink-0 text-gray-500">
              ({competition.pool_type === 1 ? tCommon("poolTypeLong") : tCommon("poolTypeShort")})
            </span>
          )}
        </p>

        {/* 種目名 → 目標タイム ← 現在のベスト を横並び。狭いときはタイムの並びが種目名の下に回る */}
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <h2 className="text-2xl font-bold text-blue-700">
            {style?.name_jp || t("list.styleFallback")}
          </h2>
          <GoalBeforeAfter
            goalId={goal.id}
            targetTime={goal.target_time}
            competitionDate={competitionDate}
            competitionEndDate={competition?.end_date}
            competitionUnavailable={competitionUnavailable}
          />
        </div>

        {/* 大会情報が無い目標は編集できない理由を明示する */}
        {competitionUnavailable && (
          <p className="text-xs text-amber-600 mt-1">{t("list.editUnavailableReason")}</p>
        )}
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
            <span>
              {milestoneProgress === null ? t("detail.notSet") : `${milestoneProgress.toFixed(0)}%`}
            </span>
          </div>
          {milestoneProgress !== null && <ProgressBar progress={milestoneProgress} />}
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
