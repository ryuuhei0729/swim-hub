"use client";

import React, { useMemo } from "react";
import Input from "@/components/ui/Input";
import DatePicker from "@/components/ui/DatePicker";
import StyleChipSelector from "@/components/forms/StyleChipSelector";
import TimeSecondsInput from "../shared/TimeSecondsInput";
import { parseISO, startOfDay } from "date-fns";
import type { Style, Competition } from "@apps/shared/types";
import { useAuth } from "@/contexts";
import { formatTimeBest } from "@/utils/formatters";
import { getBestTimeForEntry } from "@/utils/bestTimeForEntry";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { POOL_TYPES } from "../constants";
import { useLocale, useTranslations } from "next-intl";

export interface NewCompetitionInput {
  title: string;
  /** 開始日 (yyyy-MM-dd) */
  date: string;
  /** 終了日 (yyyy-MM-dd)。空文字は単日開催 */
  endDate: string;
  place: string;
  poolType: number;
}

interface GoalFormProps {
  // 大会選択
  competitionMode: "existing" | "new";
  onCompetitionModeChange: (mode: "existing" | "new") => void;
  competitions: Competition[];
  /** team_id -> チーム名。個人大会 (team_id なし) 以外の optgroup ラベルに使う */
  teamNames?: Record<string, string>;
  selectedCompetitionId: string;
  onSelectedCompetitionIdChange: (id: string) => void;
  newCompetition: NewCompetitionInput;
  onNewCompetitionChange: (competition: NewCompetitionInput) => void;
  // 種目選択
  styles: Style[];
  styleId: string;
  onStyleIdChange: (id: string) => void;
  // タイム入力 (秒数。null は未入力)
  targetTime: number | null;
  onTargetTimeChange: (seconds: number | null) => void;
}

/**
 * 目標タイム欄の右に出すベストタイムラベル。エントリー・大会記録入力と同じ出し方
 * (getBestTimeForEntry をリレー OFF で呼ぶ: 同じ水路の自己記録 → 別の水路の自己記録の順で、
 * 出どころをラベルに書く。引継だけの記録は出さない)。
 * ベストが無い・取得中・取得失敗のときは出さない。
 */
function GoalBestTimeLabel({
  styleName,
  poolType,
}: {
  styleName: string | null;
  poolType: number | null;
}) {
  const tRecord = useTranslations("forms.recordLog");
  const { supabase } = useAuth();
  const { data: bestTimes } = useBestTimesQuery(supabase);

  if (!styleName || poolType === null || !bestTimes) return null;
  const best = getBestTimeForEntry(styleName, poolType, false, bestTimes);
  if (!best) return null;

  return (
    <div
      data-testid="goal-best-time-label"
      className="shrink-0 self-center text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full inline-flex items-center gap-2"
    >
      <span className="text-green-700">
        {tRecord(best.labelKey)}: {formatTimeBest(best.time)}
      </span>
    </div>
  );
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
}: GoalFormProps) {
  const t = useTranslations("goals");
  const tCompetition = useTranslations("forms.competition");
  const locale = useLocale() as SupportedLocale;

  // 種目チップ選択(StyleChipSelector)向けにid/nameJp/distanceの形へ変換
  const styleOptions = useMemo(
    () => styles.map((s) => ({ id: s.id, nameJp: s.name_jp, distance: s.distance })),
    [styles],
  );

  // 対象大会の水路 (0: 短水路, 1: 長水路)。新規大会は入力値、既存大会は選択した大会の値 (未選択なら未確定)
  const poolType =
    competitionMode === "new"
      ? newCompetition.poolType
      : (competitions.find((c) => c.id === selectedCompetitionId)?.pool_type ?? null);

  const styleName = styles.find((s) => String(s.id) === styleId)?.name_jp ?? null;

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
                    {formatDate(comp.date, "numeric", locale)}{" "}
                    {comp.title || t("form.competitionFallback")}
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
                    {formatDate(comp.date, "numeric", locale)}{" "}
                    {comp.title || t("form.competitionFallback")}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          // 大会記録の登録 (CompetitionTabModal の大会タブ) と同じ並び。場所と水路は同じ行
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <DatePicker
                label={tCompetition("start_date_label")}
                value={newCompetition.date}
                onChange={(date) => onNewCompetitionChange({ ...newCompetition, date })}
                minDate={startOfDay(new Date())}
                required
                placeholder={tCompetition("start_date_label")}
                data-testid="goal-new-competition-date"
              />
              <DatePicker
                label={tCompetition("end_date_label")}
                value={newCompetition.endDate}
                onChange={(endDate) => onNewCompetitionChange({ ...newCompetition, endDate })}
                minDate={newCompetition.date ? parseISO(newCompetition.date) : startOfDay(new Date())}
                placeholder=""
                popupAlign="right"
                data-testid="goal-new-competition-end-date"
              />
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 sm:gap-x-4 gap-y-1.5 sm:gap-y-4 items-center">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                {tCompetition("name_label")}
              </label>
              <Input
                type="text"
                placeholder={t("form.competitionNamePlaceholder")}
                value={newCompetition.title}
                onChange={(e) => onNewCompetitionChange({ ...newCompetition, title: e.target.value })}
                required
              />

              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                {tCompetition("place_label")}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    type="text"
                    placeholder={t("form.competitionPlacePlaceholder")}
                    value={newCompetition.place}
                    onChange={(e) => onNewCompetitionChange({ ...newCompetition, place: e.target.value })}
                  />
                </div>
                <div
                  className="flex shrink-0"
                  role="group"
                  aria-label={tCompetition("pool_type_label")}
                  data-testid="goal-new-competition-pool-type"
                >
                  {POOL_TYPES.map((type, idx) => {
                    const isActive = newCompetition.poolType === type.value;
                    const isFirst = idx === 0;
                    const isLast = idx === POOL_TYPES.length - 1;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => onNewCompetitionChange({ ...newCompetition, poolType: type.value })}
                        aria-pressed={isActive}
                        className={`h-8 sm:h-10 px-3 border text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isFirst ? "rounded-l-md" : ""
                        } ${isLast ? "rounded-r-md" : ""} ${!isFirst ? "-ml-px" : ""} ${
                          isActive
                            ? "relative z-10 bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                        data-testid={`goal-new-competition-pool-type-${type.value}`}
                      >
                        {/* 狭幅では略称、sm 以上はフル表記 (大会記録の登録と同じ) */}
                        <span className="sm:hidden">
                          {type.value === 0 ? tCompetition("pool_short_abbrev") : tCompetition("pool_long_abbrev")}
                        </span>
                        <span className="hidden sm:inline">
                          {type.value === 0 ? tCompetition("pool_short") : tCompetition("pool_long")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
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
        {/* 狭い幅でベストタイムラベルが並び切らなければ、入力欄の下に回る */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-[10rem] flex-1">
            <TimeSecondsInput
              value={targetTime}
              onChange={onTargetTimeChange}
              placeholder={t("form.targetTimePlaceholder")}
              required
              requiredErrorMessage={t("paramsForm.timeRequired")}
              invalidErrorMessage={t("paramsForm.timeInvalid")}
            />
          </div>
          <GoalBestTimeLabel styleName={styleName} poolType={poolType} />
        </div>
      </div>
    </div>
  );
}
