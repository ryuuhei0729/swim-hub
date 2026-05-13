"use client";

import React from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DatePicker from "@/components/ui/DatePicker";
import { format } from "date-fns";
import type { Style, Competition } from "@apps/shared/types";
import { POOL_TYPES } from "../constants";
import { useTranslations } from "next-intl";

interface GoalFormProps {
  // 大会選択
  competitionMode: "existing" | "new";
  onCompetitionModeChange: (mode: "existing" | "new") => void;
  competitions: Competition[];
  selectedCompetitionId: string;
  onSelectedCompetitionIdChange: (id: string) => void;
  newCompetition: {
    title: string;
    date: string;
    place: string;
    poolType: number;
  };
  onNewCompetitionChange: (competition: {
    title: string;
    date: string;
    place: string;
    poolType: number;
  }) => void;
  // 種目選択
  styles: Style[];
  styleId: string;
  onStyleIdChange: (id: string) => void;
  // タイム入力
  targetTime: string;
  onTargetTimeChange: (time: string) => void;
  startTime: string;
  onStartTimeChange: (time: string) => void;
  useBestTime: boolean;
  onGetBestTime: () => void;
}

/**
 * 目標フォーム共通コンポーネント
 */
export default function GoalForm({
  competitionMode,
  onCompetitionModeChange,
  competitions,
  selectedCompetitionId,
  onSelectedCompetitionIdChange,
  newCompetition,
  onNewCompetitionChange,
  styles,
  styleId,
  onStyleIdChange,
  targetTime,
  onTargetTimeChange,
  startTime,
  onStartTimeChange,
  useBestTime,
  onGetBestTime,
}: GoalFormProps) {
  const t = useTranslations("goals");
  const tCommon = useTranslations("common");
  return (
    <div className="space-y-4">
      {/* 大会選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.competitionLabel")}</label>
        <div className="flex gap-4 mb-2">
          <label className="flex items-center">
            <input
              type="radio"
              value="existing"
              checked={competitionMode === "existing"}
              onChange={(e) => onCompetitionModeChange(e.target.value as "existing" | "new")}
              className="mr-2"
            />
            {t("form.existingCompetitionRadio")}
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="new"
              checked={competitionMode === "new"}
              onChange={(e) => onCompetitionModeChange(e.target.value as "existing" | "new")}
              className="mr-2"
            />
            {t("form.newCompetitionRadio")}
          </label>
        </div>

        {competitionMode === "existing" ? (
          <select
            value={selectedCompetitionId}
            onChange={(e) => onSelectedCompetitionIdChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">{t("form.selectCompetitionPlaceholder")}</option>
            {competitions.map((comp) => (
              <option key={comp.id} value={comp.id}>
                {comp.title || t("form.competitionFallback")} - {format(new Date(comp.date), "yyyy/MM/dd")}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-3">
            <Input
              type="text"
              placeholder={t("form.competitionNamePlaceholder")}
              value={newCompetition.title}
              onChange={(e) => onNewCompetitionChange({ ...newCompetition, title: e.target.value })}
              required
            />
            <DatePicker
              label={t("form.competitionDateLabel")}
              value={newCompetition.date}
              onChange={(date) => onNewCompetitionChange({ ...newCompetition, date })}
              required
            />
            <Input
              type="text"
              placeholder={t("form.competitionPlacePlaceholder")}
              value={newCompetition.place}
              onChange={(e) => onNewCompetitionChange({ ...newCompetition, place: e.target.value })}
            />
            <select
              value={newCompetition.poolType}
              onChange={(e) =>
                onNewCompetitionChange({
                  ...newCompetition,
                  poolType: parseInt(e.target.value, 10),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              {POOL_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.value === 0 ? tCommon("poolTypeShort") : tCommon("poolTypeLong")}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 種目選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.styleLabel")}</label>
        <select
          value={styleId}
          onChange={(e) => onStyleIdChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          required
        >
          <option value="">{t("form.selectStylePlaceholder")}</option>
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name_jp}
            </option>
          ))}
        </select>
      </div>

      {/* 目標タイム */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.targetTimeLabel")}</label>
        <Input
          type="text"
          placeholder={t("form.targetTimePlaceholder")}
          value={targetTime}
          onChange={(e) => onTargetTimeChange(e.target.value)}
          required
        />
      </div>

      {/* 初期タイム */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.startTimeLabel")}</label>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={t("form.startTimePlaceholder")}
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            disabled={useBestTime}
          />
          <Button type="button" variant="outline" onClick={onGetBestTime} disabled={!styleId}>
            {t("form.getBestTimeButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
