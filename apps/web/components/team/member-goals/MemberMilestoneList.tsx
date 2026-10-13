"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMilestoneSummary } from "@apps/shared/utils/milestoneSummary";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { MILESTONE_STATUS_DISPLAY } from "@apps/shared/utils/goalStatusDisplay";
import type { TeamMemberMilestone } from "@apps/shared/types/teamMemberGoals";
import { STATUS_BADGE_CLASS } from "./statusTone";

interface MemberMilestoneListProps {
  milestones: TeamMemberMilestone[];
}

/** マイルストーンの読み取り専用一覧。編集・削除・振り返りの導線は持たない。 */
export default function MemberMilestoneList({ milestones }: MemberMilestoneListProps) {
  const tGoals = useTranslations("goals");
  const tMember = useTranslations("teamMemberGoals");
  const locale = useLocale() as SupportedLocale;

  if (milestones.length === 0) {
    return <p className="text-xs text-gray-500">{tGoals("milestone.empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {milestones.map((milestone) => {
        const display = MILESTONE_STATUS_DISPLAY[milestone.status];
        const isAchieved = milestone.status === "achieved";
        return (
          <li
            key={milestone.id}
            className={`rounded-md border p-3 ${
              isAchieved ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="min-w-0 text-sm font-medium text-gray-900 wrap-break-word">
                {milestone.title}
              </h4>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[display.tone]}`}
              >
                {tMember(display.labelKey)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-600 wrap-break-word">
              {formatMilestoneSummary(milestone, (key, values) => tGoals(key, values))}
            </p>
            {milestone.deadline && (
              <p className="mt-1 text-xs text-gray-500">
                {tGoals("milestone.deadlineLabel")} {formatDate(milestone.deadline, "long", locale)}
              </p>
            )}
            {isAchieved && milestone.achieved_at && (
              <p className="mt-1 text-xs text-green-700">
                {tGoals("milestone.achievedDateLabel")}{" "}
                {formatDate(milestone.achieved_at, "long", locale)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
