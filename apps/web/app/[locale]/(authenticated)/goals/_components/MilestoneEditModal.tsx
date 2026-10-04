"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { isMilestoneParamsSavable, isMilestoneTimeValueValid } from "@apps/shared/types/goals";
import { useTranslations } from "next-intl";
import { formatMilestoneSummary } from "@apps/shared/utils/milestoneSummary";
import { parseISO, isValid, format } from "date-fns";
import type {
  Style,
  Milestone,
  MilestoneParams,
  UpdateMilestoneInput,
} from "@apps/shared/types";
import MilestoneForm from "./forms/MilestoneForm";
import { DEFAULT_TIME_PARAMS, DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS } from "./constants";

interface MilestoneEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  milestone: Milestone;
  styles: Style[];
  goalCompetitionDate: string;
}

/**
 * マイルストーン編集モーダル
 */
export default function MilestoneEditModal({
  isOpen,
  onClose,
  onSuccess,
  milestone,
  styles: _styles,
  goalCompetitionDate,
}: MilestoneEditModalProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const [type, setType] = useState<"time" | "reps_time" | "set">("time");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [params, setParams] = useState<MilestoneParams>(DEFAULT_TIME_PARAMS);
  const [isLoading, setIsLoading] = useState(false);
  // 目標タイム欄 (target_time/target_average_time) が 0以下のまま submit されたときに true。
  // ユーザーが再入力すると (handleParamsChange 発火時に) false に戻す
  const [timeFieldInvalid, setTimeFieldInvalid] = useState(false);
  const [paramsInvalid, setParamsInvalid] = useState(false);

  const goalAPI = new GoalAPI(supabase);

  const handleParamsChange = (newParams: MilestoneParams) => {
    setParams(newParams);
    if (timeFieldInvalid) setTimeFieldInvalid(false);
    if (paramsInvalid) setParamsInvalid(false);
  };

  // 既存のマイルストーンデータでフォームを初期化
  useEffect(() => {
    if (isOpen && milestone) {
      setType(milestone.type);
      setTitle(milestone.title);
      // タイムゾーンシフトを避けるため、YYYY-MM-DD形式の文字列はそのまま使用
      // それ以外の形式の場合はparseISOで安全にパース
      if (milestone.deadline) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(milestone.deadline)) {
          setDeadline(milestone.deadline);
        } else {
          const parsedDate = parseISO(milestone.deadline);
          setDeadline(isValid(parsedDate) ? format(parsedDate, "yyyy-MM-dd") : "");
        }
      } else {
        setDeadline("");
      }
      setParams(milestone.params);
      setTimeFieldInvalid(false);
      setParamsInvalid(false);
    }
  }, [isOpen, milestone]);

  // タイプ変更時にパラメータをリセット
  const handleTypeChange = (newType: "time" | "reps_time" | "set") => {
    setType(newType);
    if (newType === "time") {
      setParams(DEFAULT_TIME_PARAMS);
    } else if (newType === "reps_time") {
      setParams(DEFAULT_REPS_TIME_PARAMS);
    } else {
      setParams(DEFAULT_SET_PARAMS);
    }
    setTimeFieldInvalid(false);
    setParamsInvalid(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 距離・本数・セット数・サークル・タイムのいずれかが 0 や空欄のままだと達成判定が成立しない。
    // タイム欄だけの不正は欄内エラー、それ以外は全体エラーで知らせる
    if (!isMilestoneParamsSavable(type, params)) {
      if (!isMilestoneTimeValueValid(params)) {
        setTimeFieldInvalid(true);
      } else {
        setParamsInvalid(true);
      }
      return;
    }

    setIsLoading(true);
    try {
      await goalAPI.updateMilestone(milestone.id, {
        type,
        title: title || getDefaultTitle(params),
        params,
        deadline: deadline || null,
      } as Omit<UpdateMilestoneInput, "id">);

      await onSuccess();
    } catch (error) {
      console.error("マイルストーン更新エラー:", error);
      alert(t("milestoneEdit.updateFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const getDefaultTitle = (params: MilestoneParams): string =>
    formatMilestoneSummary({ params, title: "" }, t);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t("milestoneEdit.title")}</h3>
              <button
                onClick={onClose}
                aria-label={t("milestoneEdit.closeAriaLabel")}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <MilestoneForm
                type={type}
                onTypeChange={handleTypeChange}
                title={title}
                onTitleChange={setTitle}
                params={params}
                onParamsChange={handleParamsChange}
                deadline={deadline}
                onDeadlineChange={setDeadline}
                goalCompetitionDate={goalCompetitionDate}
                timeFieldInvalid={timeFieldInvalid}
                showTemplateSelector={false}
              />
              {paramsInvalid && (
                <p role="alert" className="text-sm text-red-600">
                  {t("paramsForm.paramsInvalid")}
                </p>
              )}

              {/* ボタン */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  {t("milestoneEdit.cancelButton")}
                </Button>
                <Button type="submit" loading={isLoading}>
                  {t("milestoneEdit.submitButton")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
