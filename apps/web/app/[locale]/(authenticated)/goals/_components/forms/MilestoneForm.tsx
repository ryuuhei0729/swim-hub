"use client";

import React from "react";
import Input from "@/components/ui/Input";
import { isMilestoneRepsTimeParams, isMilestoneSetParams } from "@apps/shared/types/goals";
import { PracticeTimeParamsForm, SetParamsForm } from "./MilestoneParamsForm";
import DeadlineInput from "../shared/DeadlineInput";
import { MILESTONE_TEMPLATES, type MilestoneTemplate } from "../templates/milestoneTemplates";
import type { MilestoneFormParams, MilestoneFormTab } from "./milestoneFormModel";
import { useTranslations } from "next-intl";

interface MilestoneFormProps {
  tab: MilestoneFormTab;
  onTabChange: (tab: MilestoneFormTab) => void;
  title: string;
  onTitleChange: (title: string) => void;
  params: MilestoneFormParams;
  onParamsChange: (params: MilestoneFormParams) => void;
  deadline: string;
  onDeadlineChange: (deadline: string) => void;
  goalCompetitionDate: string;
  /** 目標タイム欄 (target_average_time) が保存できない値のまま submit された場合に true */
  timeFieldInvalid?: boolean;
  /** その他タブで内容 (title) が空のまま submit された場合に true */
  otherContentInvalid?: boolean;
  showTemplateSelector?: boolean;
  selectedTemplate?: string;
  onTemplateSelect?: (templateId: string) => void;
  availableTemplates?: MilestoneTemplate[];
}

/**
 * マイルストーンフォーム共通コンポーネント (作成・編集)。
 * タブ (練習タイム目標 / サークルイン目標 / その他) は mobile の MilestoneFormScreen と同じ。
 */
export default function MilestoneForm({
  tab,
  onTabChange,
  title,
  onTitleChange,
  params,
  onParamsChange,
  deadline,
  onDeadlineChange,
  goalCompetitionDate,
  timeFieldInvalid = false,
  otherContentInvalid = false,
  showTemplateSelector = false,
  selectedTemplate = "",
  onTemplateSelect,
  availableTemplates = MILESTONE_TEMPLATES,
}: MilestoneFormProps) {
  const t = useTranslations("goals");

  const tabOptions: Array<{ value: MilestoneFormTab; label: string; description: string }> = [
    {
      value: "practice_time",
      label: t("milestoneForm.type.practiceTime.label"),
      description: t("milestoneForm.type.practiceTime.description"),
    },
    {
      value: "set",
      label: t("milestoneForm.type.set.label"),
      description: t("milestoneForm.type.set.description"),
    },
    {
      value: "other",
      label: t("milestoneForm.type.other.label"),
      description: t("milestoneForm.type.other.description"),
    },
  ];
  const activeDescription = tabOptions.find((o) => o.value === tab)?.description;
  const isOther = tab === "other";

  return (
    <div className="space-y-4">
      {/* テンプレート選択（Create時のみ） */}
      {showTemplateSelector && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("milestoneForm.templateLabel")}
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => {
              if (onTemplateSelect) {
                onTemplateSelect(e.target.value);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">{t("milestoneForm.templatePlaceholder")}</option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {t(`template.${template.nameKey}`)} - {t(`template.${template.descriptionKey}`)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* タイプ選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("milestoneForm.typeLabel")}</label>
        <div role="radiogroup" aria-label={t("milestoneForm.typeAriaLabel")} className="flex gap-3">
          {tabOptions.map((option) => (
            <label
              key={option.value}
              className={`
                flex-1 flex items-center justify-center px-4 py-3 border-2 rounded-md cursor-pointer transition-all
                ${
                  tab === option.value
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                }
                ${selectedTemplate ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              <input
                type="radio"
                name="milestone-type"
                value={option.value}
                checked={tab === option.value}
                onChange={() => {
                  if (!selectedTemplate) onTabChange(option.value);
                }}
                disabled={!!selectedTemplate}
                required
                className="sr-only"
                aria-describedby="milestone-type-description"
              />
              <span className="text-sm font-medium text-center">{option.label}</span>
            </label>
          ))}
        </div>
        {/* 説明はホバーではなく常に表示する (タッチ端末でも読めるように) */}
        {activeDescription && (
          <p id="milestone-type-description" className="text-xs text-gray-500 mt-2">
            {activeDescription}
          </p>
        )}
        {selectedTemplate && (
          <p className="text-xs text-gray-500 mt-1">{t("milestoneForm.templateAppliedNote")}</p>
        )}
      </div>

      {/* タイトル (その他タブでは目標の内容そのもの。必須) */}
      {isOther ? (
        <div>
          <label htmlFor="milestone-other-content" className="block text-sm font-medium text-gray-700 mb-2">
            {t("milestoneForm.otherContentLabel")}
          </label>
          <textarea
            id="milestone-other-content"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t("milestoneForm.otherContentPlaceholder")}
            rows={3}
            aria-invalid={otherContentInvalid}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              otherContentInvalid ? "border-red-500" : "border-gray-300"
            }`}
          />
          {otherContentInvalid && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {t("milestoneForm.otherContentRequired")}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("milestoneForm.titleLabel")}
          </label>
          <Input type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} />
        </div>
      )}

      {/* パラメータフォーム */}
      {tab === "practice_time" && isMilestoneRepsTimeParams(params) && (
        <PracticeTimeParamsForm
          params={params}
          onChange={(p) => onParamsChange(p)}
          targetAverageTimeInvalid={timeFieldInvalid}
        />
      )}

      {tab === "set" && isMilestoneSetParams(params) && (
        <SetParamsForm params={params} onChange={(p) => onParamsChange(p)} />
      )}

      {/* 期限日 */}
      <DeadlineInput
        value={deadline}
        onChange={onDeadlineChange}
        goalCompetitionDate={goalCompetitionDate}
      />
    </div>
  );
}
