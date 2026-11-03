"use client";

import React, { useState } from "react";
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(null);
  const [uncompletingMilestone, setUncompletingMilestone] = useState<Milestone | null>(null);
  const [busyMilestoneId, setBusyMilestoneId] = useState<string | null>(null);
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

  const handleDelete = async (milestone: Milestone) => {
    setDeletingMilestone(null);
    try {
      await goalAPI.deleteMilestone(milestone.id);
      await onUpdate();
    } catch (error) {
      console.error("マイルストーン削除エラー:", error);
      alert(t("milestone.deleteFailed"));
    }
  };

  /**
   * 手動で完了にする / 未完了に戻す (mobile と同じ)。完了はワンクリック、
   * 未完了に戻すのは確認してから (戻した時点より前の記録では自動判定で再び達成候補にしない)
   */
  const handleSetCompletion = async (milestone: Milestone, completed: boolean) => {
    if (busyMilestoneId) return;
    setUncompletingMilestone(null);
    setBusyMilestoneId(milestone.id);
    try {
      await goalAPI.setMilestoneCompletion(milestone, completed);
      await onUpdate();
    } catch (error) {
      console.error("マイルストーン完了状態の更新エラー:", error);
      alert(t("milestone.completionFailed"));
    } finally {
      setBusyMilestoneId(null);
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
                {milestone.type !== "other" && (
                  <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">
                    {formatMilestoneSummary(milestone, t)}
                  </p>
                )}
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
                  type="button"
                  onClick={() => handleEdit(milestone)}
                  className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                  title={t("milestone.edit")}
                  aria-label={t("milestone.edit")}
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingMilestone(milestone)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title={t("milestone.delete")}
                  aria-label={t("milestone.delete")}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* 手動で完了にする / 未完了に戻す */}
            <div className="mt-3 flex justify-end">
              {isAchieved ? (
                <button
                  type="button"
                  onClick={() => setUncompletingMilestone(milestone)}
                  disabled={busyMilestoneId === milestone.id}
                  data-testid="milestone-mark-incomplete"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                  {t("milestone.markIncomplete")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSetCompletion(milestone, true)}
                  disabled={busyMilestoneId === milestone.id}
                  data-testid="milestone-mark-complete"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300 rounded-md bg-white hover:bg-green-50 disabled:opacity-50 transition-colors"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  {t("milestone.markComplete")}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        isOpen={deletingMilestone !== null}
        onConfirm={() => {
          if (deletingMilestone) void handleDelete(deletingMilestone);
        }}
        onCancel={() => setDeletingMilestone(null)}
        title={t("milestone.delete")}
        message={t("milestone.deleteConfirm")}
        confirmLabel={t("milestone.delete")}
        variant="danger"
      />
      <ConfirmDialog
        isOpen={uncompletingMilestone !== null}
        onConfirm={() => {
          if (uncompletingMilestone) void handleSetCompletion(uncompletingMilestone, false);
        }}
        onCancel={() => setUncompletingMilestone(null)}
        title={t("milestone.markIncomplete")}
        message={t("milestone.markIncompleteConfirm")}
        confirmLabel={t("milestone.markIncomplete")}
        variant="info"
      />

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
