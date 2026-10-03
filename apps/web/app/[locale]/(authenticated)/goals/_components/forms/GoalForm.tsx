"use client";

import React, { useMemo } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DatePicker from "@/components/ui/DatePicker";
import StyleChipSelector from "@/components/forms/StyleChipSelector";
import TimeSecondsInput from "../shared/TimeSecondsInput";
import { format } from "date-fns";
import type { Style, Competition } from "@apps/shared/types";
import { POOL_TYPES } from "../constants";
import { useTranslations } from "next-intl";

interface GoalFormProps {
  // 大会選択
  competitionMode: "existing" | "new";
  onCompetitionModeChange: (mode: "existing" | "new") => void;
  competitions: Competition[];
  /** team_id -> チーム名。個人大会 (team_id なし) 以外の optgroup ラベルに使う */
  teamNames?: Record<string, string>;
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
  // タイム入力 (秒数。null は未入力)
  targetTime: number | null;
  onTargetTimeChange: (seconds: number | null) => void;
  startTime: number | null;
  onStartTimeChange: (seconds: number | null) => void;
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
  teamNames = {},
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

  // 種目チップ選択(StyleChipSelector)向けにid/nameJp/distanceの形へ変換
  const styleOptions = useMemo(
    () => styles.map((s) => ({ id: s.id, nameJp: s.name_jp, distance: s.distance })),
    [styles],
  );

  // 大会一覧を「個人」/チームごとに分類 (U2: optgroup)
  const { personalCompetitions, teamCompetitionGroups } = useMemo(() => {
    const personal: Competition[] = [];
    const byTeam = new Map<string, Competition[]>();
    for (const comp of competitions) {
      if (!comp.team_id) {
        personal.push(comp);
        continue;
      }
      const list = byTeam.get(comp.team_id) ?? [];
      list.push(comp);
      byTeam.set(comp.team_id, list);
    }
    return { personalCompetitions: personal, teamCompetitionGroups: Array.from(byTeam.entries()) };
  }, [competitions]);

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
            {personalCompetitions.length > 0 && (
              <optgroup label={t("form.personalCompetitionGroup")}>
                {personalCompetitions.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.title || t("form.competitionFallback")} -{" "}
                    {format(new Date(comp.date), "yyyy/MM/dd")}
                  </option>
                ))}
              </optgroup>
            )}
            {teamCompetitionGroups.map(([teamId, comps]) => (
              <optgroup
                key={teamId}
                label={teamNames[teamId] ?? t("form.teamCompetitionGroupFallback")}
              >
                {comps.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.title || t("form.competitionFallback")} -{" "}
                    {format(new Date(comp.date), "yyyy/MM/dd")}
                  </option>
                ))}
              </optgroup>
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

      {/* 種目選択(大会記録入力と同じ StyleChipSelector) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.styleLabel")}</label>
        {styleOptions.length > 0 ? (
          <StyleChipSelector
            styles={styleOptions}
            value={styleId}
            onChange={onStyleIdChange}
            testIdPrefix="goal-style"
          />
        ) : (
          <p className="text-sm text-gray-500">{t("form.selectStylePlaceholder")}</p>
        )}
      </div>

      {/* 目標タイム */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.targetTimeLabel")}</label>
        <TimeSecondsInput
          value={targetTime}
          onChange={onTargetTimeChange}
          placeholder={t("form.targetTimePlaceholder")}
          required
          requiredErrorMessage={t("paramsForm.timeRequired")}
          invalidErrorMessage={t("paramsForm.timeInvalid")}
        />
      </div>

      {/* 初期タイム */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("form.startTimeLabel")}</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <TimeSecondsInput
              value={startTime}
              onChange={onStartTimeChange}
              placeholder={t("form.startTimePlaceholder")}
              disabled={useBestTime}
              invalidErrorMessage={t("paramsForm.timeInvalid")}
            />
          </div>
          <Button type="button" variant="outline" onClick={onGetBestTime} disabled={!styleId}>
            {t("form.getBestTimeButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
