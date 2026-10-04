"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { computeGoalProgress } from "@apps/shared/utils/goalProgress";
import { GOAL_STATUS_DISPLAY } from "@apps/shared/utils/goalStatusDisplay";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatTime } from "@apps/shared/utils/time";
import type { TeamMemberGoal } from "@apps/shared/types/teamMemberGoals";
import MemberMilestoneList from "./MemberMilestoneList";
import { STATUS_BADGE_CLASS } from "./statusTone";

interface MemberGoalCardProps {
  goal: TeamMemberGoal;
  /** 翻訳済みの種目名 (種目マスターが取れない場合のフォールバック込み) */
  styleLabel: string;
}

export default function MemberGoalCard({ goal, styleLabel }: MemberGoalCardProps) {
  const tGoals = useTranslations("goals");
  const tCommon = useTranslations("common");
  const tMember = useTranslations("teamMemberGoals");
  const locale = useLocale() as SupportedLocale;

  const display = GOAL_STATUS_DISPLAY[goal.status];
  const isAchieved = goal.status === "achieved";
  // 水路が分からない (大会 NULL) ときだけ「—」。0% とは区別する
  const progressUnavailable = goal.competition_pool_type === null;
  const progress = progressUnavailable
    ? null
    : computeGoalProgress({
        startTime: goal.start_time,
        targetTime: goal.target_time,
        currentBestTime: goal.current_best_time,
      });

  const hasCompetition = goal.competition_id !== null;
  const competitionName = hasCompetition
    ? goal.competition_title || tGoals("list.competitionFallback")
    : tGoals("list.competitionInfoUnavailable");

  return (
    <article
      className={`rounded-lg border p-3 sm:p-4 ${
        isAchieved ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 wrap-break-word">{competitionName}</h3>
          <p className="mt-0.5 text-xs text-gray-600">{styleLabel}</p>
          {goal.competition_date && (
            <p className="mt-0.5 text-xs text-gray-500">
              {tGoals("goalReflection.competitionDateLabel")}{" "}
              {formatDate(goal.competition_date, "long", locale)}
              {goal.competition_pool_type !== null && (
                <>
                  {" / "}
                  {goal.competition_pool_type === 1
                    ? tCommon("poolTypeLong")
                    : tCommon("poolTypeShort")}
                </>
              )}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[display.tone]}`}
        >
          {tMember(display.labelKey)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-gray-500">{tGoals("detail.targetTime")}</dt>
          <dd className="font-medium text-gray-900">{formatTime(goal.target_time)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{tGoals("detail.initialTime")}</dt>
          <dd className="font-medium text-gray-900">
            {goal.start_time === null ? tGoals("detail.notSet") : formatTime(goal.start_time)}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
          <span>{tGoals("detail.achievement")}</span>
          <span className="font-medium text-gray-900">
            {progress === null ? "—" : `${progress.toFixed(0)}%`}
          </span>
        </div>
        {progress === null ? (
          <p className="text-[11px] text-amber-600">{tMember("progressUnavailable")}</p>
        ) : (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={tGoals("detail.achievement")}
          >
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {isAchieved && goal.achieved_at && (
        <p className="mt-2 text-xs text-green-700">
          {tGoals("milestone.achievedDateLabel")} {formatDate(goal.achieved_at, "long", locale)}
        </p>
      )}

      <div className="mt-4">
        <h4 className="mb-2 text-xs font-semibold text-gray-700">
          {tGoals("detail.milestoneSection")}
        </h4>
        <MemberMilestoneList milestones={goal.milestones} />
      </div>
    </article>
  );
}
