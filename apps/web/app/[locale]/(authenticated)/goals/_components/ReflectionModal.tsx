"use client";

import React, { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useTranslations } from "next-intl";
import type {
  Milestone,
  MilestoneTimeParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  UpdateMilestoneInput,
} from "@apps/shared/types";
import {
  isMilestoneTimeParams,
  isMilestoneRepsTimeParams,
  isMilestoneSetParams,
} from "@apps/shared/types/goals";

interface ReflectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone: Milestone;
  onSave: () => Promise<void>;
}

/**
 * 期限切れ内省モーダル
 */
export default function ReflectionModal({
  isOpen,
  onClose,
  milestone,
  onSave,
}: ReflectionModalProps) {
  const t = useTranslations("goals");
  const REFLECTION_OPTIONS = [
    { id: "goal_too_high", label: t("reflection.options.goalTooHigh") },
    { id: "period_too_short", label: t("reflection.options.periodTooShort") },
    { id: "practice_insufficient", label: t("reflection.options.practiceInsufficient") },
    { id: "condition_poor", label: t("reflection.options.conditionPoor") },
    { id: "other", label: t("reflection.options.other") },
  ];
  const { supabase } = useAuth();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const goalAPI = new GoalAPI(supabase);

  const formatMilestoneTitle = (): string => {
    const params = milestone.params;
    if (isMilestoneTimeParams(params)) {
      const p = params as MilestoneTimeParams;
      return `${p.distance}m × 1本: ${p.target_time}秒`;
    } else if (isMilestoneRepsTimeParams(params)) {
      const p = params as MilestoneRepsTimeParams;
      return `${p.distance}m × ${p.reps}本 @${p.target_average_time}秒 平均`;
    } else if (isMilestoneSetParams(params)) {
      const p = params as MilestoneSetParams;
      return `${p.distance}m × ${p.reps}本 × ${p.sets}セット (@${p.circle}秒サークル) 完遂`;
    }
    return milestone.title;
  };

  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      } else {
        return [...prev, optionId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    try {
      // 内省メモを構築
      const reflectionNote = [
        ...selectedOptions.map((id) => {
          const option = REFLECTION_OPTIONS.find((o) => o.id === id);
          return option?.label || id;
        }),
        otherNote ? t("reflection.otherPrefix", { note: otherNote }) : "",
      ]
        .filter(Boolean)
        .join("\n");

      await goalAPI.updateMilestone(milestone.id, {
        reflectionNote: reflectionNote || null,
      } as Omit<UpdateMilestoneInput, "id">);

      await onSave();
      handleClose();
    } catch (error) {
      console.error("内省メモ保存エラー:", error);
      alert(t("reflection.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async () => {
    setIsLoading(true);

    try {
      // 内省メモを構築して保存
      const reflectionNote = [
        ...selectedOptions.map((id) => {
          const option = REFLECTION_OPTIONS.find((o) => o.id === id);
          return option?.label || id;
        }),
        otherNote ? t("reflection.otherPrefix", { note: otherNote }) : "",
      ]
        .filter(Boolean)
        .join("\n");

      await goalAPI.updateMilestone(milestone.id, {
        reflectionNote: reflectionNote || null,
      } as Omit<UpdateMilestoneInput, "id">);

      // 新しいマイルストーンを作成 → 振り返りを保存してモーダルを閉じる
      await onSave();
      handleClose();
    } catch (error) {
      console.error("アクション実行エラー:", error);
      alert(t("reflection.actionFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedOptions([]);
    setOtherNote("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t("reflection.title")}</h3>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{t("reflection.expiredDesc")}</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-900">{milestone.title}</p>
                <p className="text-sm text-gray-600 mt-1">{formatMilestoneTitle()}</p>
                {milestone.deadline && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("reflection.deadlineLabel")} {format(new Date(milestone.deadline), "yyyy年M月d日", { locale: ja })}
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 振り返り選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("reflection.reflectionLabel")}
                </label>
                <div className="space-y-2">
                  {REFLECTION_OPTIONS.map((option) => (
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
                    {t("reflection.otherLabel")}
                  </label>
                  <Input
                    type="text"
                    value={otherNote}
                    onChange={(e) => setOtherNote(e.target.value)}
                    placeholder={t("reflection.otherPlaceholder")}
                  />
                </div>
              )}

              {/* 次のアクション */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">{t("reflection.nextActionLabel")}</p>
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={handleAction}
                  >
                    {t("reflection.createMilestoneButton")}
                  </Button>
                </div>
              </div>

              {/* ボタン */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                  {t("reflection.skipButton")}
                </Button>
                <Button type="submit" loading={isLoading}>
                  {t("reflection.saveButton")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
