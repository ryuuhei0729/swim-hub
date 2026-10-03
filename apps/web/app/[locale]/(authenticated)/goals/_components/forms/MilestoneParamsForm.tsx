"use client";

import React from "react";
import NumberStepper from "@/components/ui/NumberStepper";
import { DistanceInput } from "@/components/forms/practice-log/components";
import type {
  MilestoneTimeParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
} from "@apps/shared/types";
import StyleSelector from "../shared/StyleSelector";
import SwimCategorySelector from "../shared/SwimCategorySelector";
import TimeSecondsInput from "../shared/TimeSecondsInput";
import { useTranslations } from "next-intl";

interface TimeParamsFormProps {
  params: MilestoneTimeParams;
  onChange: (params: MilestoneTimeParams) => void;
  /** target_time が保存できない値 (0以下) のまま submit された場合に true にする */
  targetTimeInvalid?: boolean;
}

export function TimeParamsForm({ params, onChange, targetTimeInvalid = false }: TimeParamsFormProps) {
  const t = useTranslations("goals");
  const tPracticeMenu = useTranslations("forms.practiceMenu");

  return (
    <div className="space-y-3">
      <DistanceInput
        value={params.distance}
        onChange={(value) => onChange({ ...params, distance: value === "" ? 0 : Number(value) })}
        label={t("paramsForm.distanceLabel")}
        otherLabel={tPracticeMenu("distanceOther")}
        testIdPrefix="goal-milestone-time-distance"
        autoFocusCustomInput={false}
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.styleLabel")}</label>
          <StyleSelector
            value={params.style}
            onChange={(value) => onChange({ ...params, style: value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.swimCategoryLabel")}</label>
          <SwimCategorySelector
            value={params.swim_category}
            onChange={(value) => onChange({ ...params, swim_category: value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.targetTimeLabel")}</label>
          <TimeSecondsInput
            value={params.target_time}
            onChange={(seconds) => onChange({ ...params, target_time: seconds ?? 0 })}
            required
            requiredErrorMessage={t("paramsForm.timeRequired")}
            invalidErrorMessage={t("paramsForm.timeInvalid")}
            forceInvalid={targetTimeInvalid}
          />
        </div>
      </div>
    </div>
  );
}

interface RepsTimeParamsFormProps {
  params: MilestoneRepsTimeParams;
  onChange: (params: MilestoneRepsTimeParams) => void;
  /** target_average_time が保存できない値 (0以下) のまま submit された場合に true にする */
  targetAverageTimeInvalid?: boolean;
}

export function RepsTimeParamsForm({
  params,
  onChange,
  targetAverageTimeInvalid = false,
}: RepsTimeParamsFormProps) {
  const t = useTranslations("goals");
  const tPracticeMenu = useTranslations("forms.practiceMenu");

  const circleMin = params.circle > 0 ? Math.floor(params.circle / 60) : "";
  const circleSec = params.circle > 0 ? params.circle % 60 : "";

  const handleCircleMinChange = (value: string) => {
    const min = value === "" ? 0 : parseInt(value, 10);
    const sec = typeof circleSec === "number" ? circleSec : 0;
    onChange({ ...params, circle: (Number.isFinite(min) ? min : 0) * 60 + sec });
  };

  const handleCircleSecChange = (value: string) => {
    const parsedSec = value === "" ? 0 : parseInt(value, 10);
    const clampedSec = Number.isFinite(parsedSec) ? Math.max(0, Math.min(parsedSec, 59)) : 0;
    const min = typeof circleMin === "number" ? circleMin : 0;
    onChange({ ...params, circle: min * 60 + clampedSec });
  };

  return (
    <div className="space-y-3">
      <DistanceInput
        value={params.distance}
        onChange={(value) => onChange({ ...params, distance: value === "" ? 0 : Number(value) })}
        label={t("paramsForm.distanceLabel")}
        otherLabel={tPracticeMenu("distanceOther")}
        testIdPrefix="goal-milestone-repstime-distance"
        autoFocusCustomInput={false}
      />

      {/* 本数・セット数・平均目標タイム */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.repsLabel")}</label>
          <NumberStepper
            value={params.reps > 0 ? params.reps : ""}
            onChange={(v) => onChange({ ...params, reps: v === "" ? 0 : Number(v) })}
            min={1}
            placeholder="4"
            ariaLabel={t("paramsForm.repsLabel")}
            fieldLabel={t("paramsForm.repsLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-repstime-reps"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.setsLabel")}</label>
          <NumberStepper
            value={params.sets > 0 ? params.sets : ""}
            onChange={(v) => onChange({ ...params, sets: v === "" ? 0 : Number(v) })}
            min={1}
            placeholder="1"
            ariaLabel={t("paramsForm.setsLabel")}
            fieldLabel={t("paramsForm.setsLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-repstime-sets"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.averageTimeLabel")}</label>
          <TimeSecondsInput
            value={params.target_average_time}
            onChange={(seconds) => onChange({ ...params, target_average_time: seconds ?? 0 })}
            required
            requiredErrorMessage={t("paramsForm.averageTimeRequired")}
            invalidErrorMessage={t("paramsForm.timeInvalid")}
            forceInvalid={targetAverageTimeInvalid}
          />
        </div>
      </div>

      {/* 種目、Swim/Pull/Kick、サークル（分・秒） */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.styleLabel")}</label>
          <StyleSelector
            value={params.style}
            onChange={(value) => onChange({ ...params, style: value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.swimCategoryLabel")}</label>
          <SwimCategorySelector
            value={params.swim_category}
            onChange={(value) => onChange({ ...params, swim_category: value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.circleMinLabel")}</label>
          <NumberStepper
            value={circleMin}
            onChange={handleCircleMinChange}
            min={0}
            placeholder="1"
            ariaLabel={t("paramsForm.circleMinLabel")}
            fieldLabel={t("paramsForm.circleMinLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-repstime-circle-min"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.circleSecLabel")}</label>
          <NumberStepper
            value={circleSec}
            onChange={handleCircleSecChange}
            min={0}
            max={59}
            step={10}
            placeholder="30"
            ariaLabel={t("paramsForm.circleSecLabel")}
            fieldLabel={t("paramsForm.circleSecLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-repstime-circle-sec"
          />
        </div>
      </div>
    </div>
  );
}

interface SetParamsFormProps {
  params: MilestoneSetParams;
  onChange: (params: MilestoneSetParams) => void;
}

export function SetParamsForm({ params, onChange }: SetParamsFormProps) {
  const t = useTranslations("goals");
  const tPracticeMenu = useTranslations("forms.practiceMenu");

  const circleMin = params.circle > 0 ? Math.floor(params.circle / 60) : "";
  const circleSec = params.circle > 0 ? params.circle % 60 : "";

  const handleCircleMinChange = (value: string) => {
    const min = value === "" ? 0 : parseInt(value, 10);
    const sec = typeof circleSec === "number" ? circleSec : 0;
    onChange({ ...params, circle: (Number.isFinite(min) ? min : 0) * 60 + sec });
  };

  const handleCircleSecChange = (value: string) => {
    const parsedSec = value === "" ? 0 : parseInt(value, 10);
    const clampedSec = Number.isFinite(parsedSec) ? Math.max(0, Math.min(parsedSec, 59)) : 0;
    const min = typeof circleMin === "number" ? circleMin : 0;
    onChange({ ...params, circle: min * 60 + clampedSec });
  };

  return (
    <div className="space-y-3">
      <DistanceInput
        value={params.distance}
        onChange={(value) => onChange({ ...params, distance: value === "" ? 0 : Number(value) })}
        label={t("paramsForm.distanceLabel")}
        otherLabel={tPracticeMenu("distanceOther")}
        testIdPrefix="goal-milestone-set-distance"
        autoFocusCustomInput={false}
      />

      {/* 本数、セット数 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.repsLabel")}</label>
          <NumberStepper
            value={params.reps > 0 ? params.reps : ""}
            onChange={(v) => onChange({ ...params, reps: v === "" ? 0 : Number(v) })}
            min={1}
            placeholder="4"
            ariaLabel={t("paramsForm.repsLabel")}
            fieldLabel={t("paramsForm.repsLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-set-reps"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.setsLabel")}</label>
          <NumberStepper
            value={params.sets > 0 ? params.sets : ""}
            onChange={(v) => onChange({ ...params, sets: v === "" ? 0 : Number(v) })}
            min={1}
            placeholder="1"
            ariaLabel={t("paramsForm.setsLabel")}
            fieldLabel={t("paramsForm.setsLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-set-sets"
          />
        </div>
      </div>

      {/* 種目、S/P/K、サークル（分・秒） */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.styleLabel")}</label>
          <StyleSelector
            value={params.style}
            onChange={(value) => onChange({ ...params, style: value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.swimCategoryLabel")}</label>
          <SwimCategorySelector
            value={params.swim_category}
            onChange={(value) => onChange({ ...params, swim_category: value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.circleMinLabel")}</label>
          <NumberStepper
            value={circleMin}
            onChange={handleCircleMinChange}
            min={0}
            placeholder="1"
            ariaLabel={t("paramsForm.circleMinLabel")}
            fieldLabel={t("paramsForm.circleMinLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-set-circle-min"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t("paramsForm.circleSecLabel")}</label>
          <NumberStepper
            value={circleSec}
            onChange={handleCircleSecChange}
            min={0}
            max={59}
            step={10}
            placeholder="30"
            ariaLabel={t("paramsForm.circleSecLabel")}
            fieldLabel={t("paramsForm.circleSecLabel")}
            decreaseLabel={tPracticeMenu("decrease")}
            increaseLabel={tPracticeMenu("increase")}
            data-testid="goal-milestone-set-circle-sec"
          />
        </div>
      </div>
    </div>
  );
}
