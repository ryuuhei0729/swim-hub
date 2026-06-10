"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon, TrophyIcon, FlagIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import { formatTimeBest } from "@/utils/formatters";
import type { GoalWithMilestones } from "@apps/shared/types";

interface GoalReflectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: GoalWithMilestones;
  onSave: () => Promise<void>;
}


/**
 * 目標期限切れ振り返りモーダル
 */
export default function GoalReflectionModal({
  isOpen,
  onClose,
  goal,
  onSave,
}: GoalReflectionModalProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReflectionOpen, setIsReflectionOpen] = useState(false);

  const goalAPI = new GoalAPI(supabase);

  const reflectionOptions = [
    { id: "goal_too_high", label: t("goalReflection.options.goalTooHigh") },
    { id: "period_too_short", label: t("goalReflection.options.periodTooShort") },
    { id: "practice_insufficient", label: t("goalReflection.options.practiceInsufficient") },
    { id: "condition_poor", label: t("goalReflection.options.conditionPoor") },
    { id: "other", label: t("goalReflection.options.other") },
  ];

  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      } else {
        return [...prev, optionId];
      }
    });
  };

  // 達成を記録
  const handleAchieved = async () => {
    setIsLoading(true);
    try {
      await goalAPI.updateGoal(goal.id, {
        status: "achieved",
      });
      await onSave();
      handleClose();
    } catch (error) {
      console.error("目標更新エラー:", error);
      alert(t("goalReflection.updateFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 未達成として保存（振り返りメモ付き）
  const handleNotAchieved = async () => {
    setIsLoading(true);
    try {
      // 振り返りメモを構築（将来的にDBに保存する際に使用）
      const optionLabels: Record<string, string> = {
        goal_too_high: t("goalReflection.options.goalTooHigh"),
        period_too_short: t("goalReflection.options.periodTooShort"),
        practice_insufficient: t("goalReflection.options.practiceInsufficient"),
        condition_poor: t("goalReflection.options.conditionPoor"),
        other: t("goalReflection.options.other"),
      };
      const _reflectionNote = [
        ...selectedOptions.map((id) => optionLabels[id] ?? id),
        otherNote ? t("goalReflection.otherPrefix", { note: otherNote }) : "",
      ]
        .filter(Boolean)
        .join("\n");

      // 目標をキャンセル状態に更新
      await goalAPI.updateGoal(goal.id, {
        status: "cancelled",
      });

      await onSave();
      handleClose();
    } catch (error) {
      console.error("目標更新エラー:", error);
      alert(t("goalReflection.updateFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedOptions([]);
    setOtherNote("");
    setIsReflectionOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  const achievedMilestones = goal.milestones.filter((m) => m.status === "achieved");
  const totalMilestones = goal.milestones.length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t("goalReflection.title")}</h3>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{t("goalReflection.expiredDesc")}</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-900">{goal.competition.title || t("goalReflection.competitionFallback")}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {goal.style?.name_jp || t("goalReflection.styleFallback")} | {t("goalReflection.targetLabel")} {formatTimeBest(goal.target_time)}
                </p>
                {goal.start_time && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("goalReflection.initialTimeLabel")} {formatTimeBest(goal.start_time)}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {t("goalReflection.competitionDateLabel")}{" "}
                  {goal.competition.date && isValid(new Date(goal.competition.date))
                    ? format(new Date(goal.competition.date), "yyyy年M月d日", { locale: ja })
                    : t("goalReflection.undecided")}
                </p>
                {totalMilestones > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("goalReflection.milestoneAchievedText", { achieved: achievedMilestones.length, total: totalMilestones })}
                  </p>
                )}
              </div>
            </div>

            {/* 達成したかどうかの選択 */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-3">{t("goalReflection.achievedQuestion")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={handleAchieved}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <TrophyIcon className="w-5 h-5" />
                  {t("goalReflection.achievedButton")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReflectionOpen(true)}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2"
                >
                  <FlagIcon className="w-5 h-5" />
                  {t("goalReflection.notAchievedButton")}
                </Button>
              </div>
            </div>

            {/* 振り返りセクション（未達成時に表示） */}
            {isReflectionOpen && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("goalReflection.reflectionLabel")}
                  </label>
                  <div className="space-y-2">
                    {reflectionOptions.map((option) => (
                      <label key={option.id} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedOptions.includes(option.id)}
                          onChange={() => handleOptionToggle(option.id)}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* その他（自由記述） */}
                {selectedOptions.includes("other") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t("goalReflection.otherLabel")}
                    </label>
                    <Input
                      type="text"
                      value={otherNote}
                      onChange={(e) => setOtherNote(e.target.value)}
                      placeholder={t("goalReflection.otherPlaceholder")}
                    />
                  </div>
                )}

                {/* 保存ボタン */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isLoading}
                  >
                    {t("goalReflection.skipButton")}
                  </Button>
                  <Button type="button" onClick={handleNotAchieved} loading={isLoading}>
                    {t("goalReflection.saveButton")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
