"use client";

import React, { useState } from "react";
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import type { Milestone, Style } from "@apps/shared/types";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatMilestoneSummary } from "@apps/shared/utils/milestoneSummary";
import MilestoneEditModal from "./MilestoneEditModal";
import { useLocale, useTranslations } from "next-intl";

interface MilestoneListProps {
  milestones: Milestone[];
  styles: Style[];
  goalCompetitionDate: string;
  onUpdate: () => Promise<void>;
}

/**
 * マイルストーン一覧コンポーネント
 */
export default function MilestoneList({
  milestones,
  styles,
  goalCompetitionDate,
  onUpdate,
}: MilestoneListProps) {
  const t = useTranslations("goals");
  const locale = useLocale() as SupportedLocale;
  const { supabase } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const goalAPI = new GoalAPI(supabase);
  const getStatusIcon = (status: Milestone["status"]) => {
    switch (status) {
      case "achieved":
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case "in_progress":
        return <ClockIcon className="w-5 h-5 text-blue-600" />;
      case "expired":
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const handleEdit = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (milestoneId: string) => {
    if (confirm(t("milestone.deleteConfirm"))) {
      try {
        await goalAPI.deleteMilestone(milestoneId);
        await onUpdate();
      } catch (error) {
        console.error("マイルストーン削除エラー:", error);
        alert(t("milestone.deleteFailed"));
      }
    }
  };

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{t("milestone.empty")}</p>
        <p className="text-sm mt-1">{t("milestone.emptyDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {milestones.map((milestone) => {
        const isAchieved = milestone.status === "achieved";

        return (
          <div
            key={milestone.id}
            className={`
              border rounded-lg p-4 transition-colors
              ${
                isAchieved
                  ? "border-green-300 bg-green-50 ring-2 ring-green-200"
                  : "border-gray-200 hover:bg-gray-50"
              }
            `}
          >
            <div className="flex items-start gap-3">
              {getStatusIcon(milestone.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900">{milestone.title}</h4>
                  {isAchieved && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {t("milestone.achievedBadge")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">
                  {formatMilestoneSummary(milestone, t)}
                </p>
                {(milestone.deadline || (isAchieved && milestone.achieved_at)) && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                    {milestone.deadline && (
                      <span className="text-gray-500">
                        {t("milestone.deadlineLabel")} {formatDate(milestone.deadline, "long", locale)}
                      </span>
                    )}
                    {isAchieved && milestone.achieved_at && (
                      <span className="text-green-600">
                        {t("milestone.achievedDateLabel")}{" "}
                        {formatDate(milestone.achieved_at, "long", locale)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(milestone)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                  title={t("milestone.edit")}
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(milestone.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title={t("milestone.delete")}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* マイルストーン編集モーダル */}
      {editingMilestone && (
        <MilestoneEditModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingMilestone(null);
          }}
          onSuccess={async () => {
            await onUpdate();
            setIsEditModalOpen(false);
            setEditingMilestone(null);
          }}
          milestone={editingMilestone}
          styles={styles}
          goalCompetitionDate={goalCompetitionDate}
        />
      )}
    </div>
  );
}
