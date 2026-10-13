"use client";

import React, { useState, useMemo } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { PracticeLogTemplateAPI } from "@swim-hub/shared/api";
import { toStyleCode } from "@apps/shared/utils/swimStyles";
import { isMilestoneParamsSavable, isMilestoneTimeValueValid } from "@apps/shared/types/goals";
import { useTranslations } from "next-intl";
import { formatMilestoneSummary } from "@apps/shared/utils/milestoneSummary";
import type {
  GoalWithMilestones,
  Style,
  MilestoneParams,
  MilestoneTimeParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  MilestoneGoalSetParams,
} from "@apps/shared/types";
import { MILESTONE_TEMPLATES } from "./templates/milestoneTemplates";
import MilestoneForm from "./forms/MilestoneForm";
import GoalSetCalculatorModal from "./GoalSetCalculatorModal";
import { DEFAULT_TIME_PARAMS, DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS } from "./constants";

interface MilestoneCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  goalId: string;
  goal: GoalWithMilestones;
  styles: Style[];
  goalCompetitionDate: string;
}

/**
 * マイルストーン作成モーダル
 */
export default function MilestoneCreateModal({
  isOpen,
  onClose,
  onSuccess,
  goalId,
  goal,
  styles: _styles,
  goalCompetitionDate,
}: MilestoneCreateModalProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const [type, setType] = useState<"time" | "reps_time" | "set">("time");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [params, setParams] = useState<MilestoneParams>(DEFAULT_TIME_PARAMS);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoalSetModalOpen, setIsGoalSetModalOpen] = useState(false);
  const [addToTemplate, setAddToTemplate] = useState(false);
  // 目標タイム欄 (target_time/target_average_time) が 0以下のまま submit されたときに true。
  // ユーザーが再入力すると (handleParamsChange 発火時に) false に戻す
  const [timeFieldInvalid, setTimeFieldInvalid] = useState(false);
  const [paramsInvalid, setParamsInvalid] = useState(false);

  const handleParamsChange = (newParams: MilestoneParams) => {
    setParams(newParams);
    if (timeFieldInvalid) setTimeFieldInvalid(false);
    if (paramsInvalid) setParamsInvalid(false);
  };

  const goalAPI = new GoalAPI(supabase);
  const templateAPI = new PracticeLogTemplateAPI(supabase);

  // Goalが100m種目かどうかをチェック
  const is100mGoal = useMemo(() => {
    return goal.style.distance === 100;
  }, [goal.style.distance]);

  // 100m種目の場合のみゴールセットテンプレートを表示
  const availableTemplates = useMemo(() => {
    if (is100mGoal) {
      return MILESTONE_TEMPLATES;
    }
    return MILESTONE_TEMPLATES.filter((t) => t.id !== "goalset_50m_6x3");
  }, [is100mGoal]);

  // テンプレート適用
  const handleTemplateSelect = (templateId: string) => {
    const template = availableTemplates.find((t) => t.id === templateId);
    if (!template) {
      setSelectedTemplate("");
      return;
    }

    // ゴールセットテンプレートが選択された場合、計算モーダルを表示
    if (templateId === "goalset_50m_6x3") {
      setIsGoalSetModalOpen(true);
      return;
    }

    // タイムトライアルテンプレートが選択された場合、goalから値を取得
    if (templateId === "time_trial") {
      // goal.style.style は canonical な SwimStyle ("Fr"/"Br"/"Ba"/"Fly"/"IM") であり、
      // StyleSelector (constants.ts の SWIM_STYLES) が要求する値と同じ形式なのでそのまま使える。
      // styles.style は DB CHECK 制約により5値以外を取り得ないため toStyleCode() は理論上
      // 必ず非 null を返すが、フォールバックは「自由形」ではなく元の値を使う
      // (practice_logs.style の教訓: 想定外時に別種目へ静かに化けるのを避ける)。
      const styleValue = toStyleCode(goal.style.style) ?? goal.style.style;

      const timeTrialParams: MilestoneTimeParams = {
        distance: goal.style.distance,
        target_time: Math.round(goal.target_time * 1.01 * 100) / 100,
        style: styleValue,
        swim_category: "Swim",
      };

      setType("time");
      setSelectedTemplate("time_trial");
      setParams(timeTrialParams);
      setTitle(t(`template.${template.nameKey}`)); // タイトルを自動設定
      setTimeFieldInvalid(false);
      setParamsInvalid(false);
      return;
    }

    setType(template.type);
    setSelectedTemplate(templateId);
    setParams(template.defaultParams);
    setTitle(t(`template.${template.nameKey}`)); // タイトルを自動設定
    setTimeFieldInvalid(false);
    setParamsInvalid(false);
  };

  // ゴールセット計算結果を適用
  const handleGoalSetConfirm = (targetAverageTime: number, practicePoolType: number) => {
    // goal.style.style は canonical な SwimStyle ("Fr"/"Br"/"Ba"/"Fly"/"IM") であり、
    // StyleSelector (constants.ts の SWIM_STYLES) が要求する値と同じ形式なのでそのまま使える。
    // styles.style は DB CHECK 制約により5値以外を取り得ないため toStyleCode() は理論上
    // 必ず非 null を返すが、フォールバックは「自由形」ではなく元の値を使う
    // (practice_logs.style の教訓: 想定外時に別種目へ静かに化けるのを避ける)。
    const styleValue = toStyleCode(goal.style.style) ?? goal.style.style;

    const goalSetTemplate = MILESTONE_TEMPLATES.find((tpl) => tpl.id === "goalset_50m_6x3");
    if (!goalSetTemplate) return;

    const goalSetParams: MilestoneGoalSetParams = {
      ...(goalSetTemplate.defaultParams as MilestoneGoalSetParams),
      target_average_time: targetAverageTime,
      style: styleValue,
      practice_pool_type: practicePoolType,
    };

    setType("reps_time");
    setSelectedTemplate("goalset_50m_6x3");
    setParams(goalSetParams);
    setTitle(t("milestoneCreate.goalSetDefaultTitle")); // タイトルを自動設定
    setTimeFieldInvalid(false);
    setParamsInvalid(false);
    setIsGoalSetModalOpen(false);
  };

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
      await goalAPI.createMilestone({
        goalId,
        title: title || getDefaultTitle(params),
        type,
        params,
        deadline: deadline || null,
      });

      // テンプレートにも追加する場合
      if (addToTemplate && (type === "reps_time" || type === "set")) {
        const milestoneTitle = title || getDefaultTitle(params);
        const p = params as MilestoneRepsTimeParams | MilestoneSetParams;

        await templateAPI.createTemplate({
          name: milestoneTitle,
          style: p.style || "Fr",
          swim_category: (p.swim_category as "Swim" | "Pull" | "Kick") || "Swim",
          distance: p.distance,
          rep_count: p.reps,
          set_count: "sets" in p ? p.sets : 1,
          circle: p.circle || null,
        });
      }

      await onSuccess();
      handleClose();
    } catch (error) {
      console.error("マイルストーン作成エラー:", error);
      alert(t("milestoneCreate.createFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const getDefaultTitle = (params: MilestoneParams): string =>
    formatMilestoneSummary({ params, title: "" }, t);

  const handleClose = () => {
    setType("time");
    setTitle("");
    setDeadline("");
    setSelectedTemplate("");
    setParams(DEFAULT_TIME_PARAMS);
    setAddToTemplate(false);
    setTimeFieldInvalid(false);
    setParamsInvalid(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t("milestoneCreate.title")}</h3>
              <button
                onClick={handleClose}
                aria-label={t("milestoneCreate.closeAriaLabel")}
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
                showTemplateSelector={true}
                selectedTemplate={selectedTemplate}
                onTemplateSelect={handleTemplateSelect}
                availableTemplates={availableTemplates}
              />
              {paramsInvalid && (
                <p role="alert" className="text-sm text-red-600">
                  {t("paramsForm.paramsInvalid")}
                </p>
              )}

              {/* ボタン行（チェックボックス含む） */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                {/* テンプレートにも追加するチェックボックス（reps_timeまたはsetタイプの場合のみ） */}
                {type === "reps_time" || type === "set" ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addToTemplate}
                      onChange={(e) => setAddToTemplate(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {t("milestoneCreate.addToTemplateLabel")}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">{t("milestoneCreate.addToTemplateSubtext")}</span>
                    </div>
                  </label>
                ) : (
                  <div />
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isLoading}
                  >
                    {t("milestoneCreate.cancelButton")}
                  </Button>
                  <Button type="submit" loading={isLoading}>
                    {t("milestoneCreate.submitButton")}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ゴールセット計算モーダル */}
      <GoalSetCalculatorModal
        isOpen={isGoalSetModalOpen}
        onClose={() => setIsGoalSetModalOpen(false)}
        onConfirm={handleGoalSetConfirm}
        goal={goal}
        style={goal.style}
      />
    </div>
  );
}
