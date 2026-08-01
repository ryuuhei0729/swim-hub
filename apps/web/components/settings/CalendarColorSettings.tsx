"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useTeamsQuery, useCalendarColorSettingsQuery } from "@apps/shared/hooks";
import { TAG_COLORS, type TagColor } from "@apps/shared/constants/tagColors";
import {
  DEFAULT_PRACTICE_COLOR,
  DEFAULT_COMPETITION_COLOR,
} from "@apps/shared/utils/calendarColorResolver";

type ColorField = "practice_color" | "competition_color";

// data-testid はロケール依存の表示ラベルと分離した固定キー(E2Eが非デフォルトロケールで壊れないようにする)
type ColorFieldTestKey = "practice" | "competition";

interface ColorSwatchRowProps {
  label: string;
  testKey: ColorFieldTestKey;
  value: TagColor | null;
  defaultColor: TagColor;
  onChange: (color: TagColor) => void;
  onReset: () => void;
  disabled?: boolean;
}

// スウォッチ選択UIは TagManagementModal.tsx の色選択グリッド(グリッド状の丸ボタン)を踏襲する
function ColorSwatchRow({
  label,
  testKey,
  value,
  defaultColor,
  onChange,
  onReset,
  disabled,
}: ColorSwatchRowProps) {
  const t = useTranslations("settings.calendarColors");
  const isCustom = value !== null;
  const activeColor = (value ?? defaultColor).toLowerCase();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {isCustom && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            data-testid={`calendar-color-reset-${testKey}`}
          >
            {t("resetToDefault")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {TAG_COLORS.map((color) => {
          const isSelected = activeColor === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              disabled={disabled}
              className={`w-8 h-8 rounded-full border-2 transition-all disabled:opacity-50 ${
                isSelected ? "border-gray-800 scale-110" : "border-gray-300 hover:border-gray-400"
              }`}
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`${label}: ${color}`}
              data-testid={`calendar-color-${testKey}-${color.replace("#", "")}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarColorSettings() {
  const t = useTranslations("settings.calendarColors");
  const { supabase, user } = useAuth();
  const { teams } = useTeamsQuery(supabase);
  const { settings, isLoading, updatePersonalColors, upsertTeamColors, deleteTeamColors } =
    useCalendarColorSettingsQuery(supabase, user?.id);

  // 承認待ち(pending)メンバーシップはチーム色設定の対象外
  const approvedTeams = teams.filter(
    (membership) => membership.status === "approved" && membership.is_active === true,
  );

  const isMutating =
    updatePersonalColors.isPending || upsertTeamColors.isPending || deleteTeamColors.isPending;

  // color は TAG_COLORS からのスウォッチ選択(TagColor)または null(デフォルトに戻す)のみが渡る。
  // Supabase への実書き込み前の権威的なバリデーションは useCalendarColorSettingsQuery 側の
  // mutationFn 内で CalendarColorInputSchema.parse() が行う(C3対応)。既存設定値(settings.*)は
  // DB 由来のため型上は string | null だが、実体は常にパレット内の値である前提でキャストする。
  const handlePersonalChange = (field: ColorField, color: TagColor | null) => {
    updatePersonalColors.mutate({
      practice_color:
        field === "practice_color" ? color : (settings.personal.practice_color as TagColor | null),
      competition_color:
        field === "competition_color"
          ? color
          : (settings.personal.competition_color as TagColor | null),
    });
  };

  const handleTeamChange = (teamId: string, field: ColorField, color: TagColor | null) => {
    const current = settings.byTeam[teamId] ?? { practice_color: null, competition_color: null };
    upsertTeamColors.mutate({
      teamId,
      practice_color:
        field === "practice_color" ? color : (current.practice_color as TagColor | null),
      competition_color:
        field === "competition_color" ? color : (current.competition_color as TagColor | null),
    });
  };

  const handleTeamResetAll = (teamId: string) => {
    deleteTeamColors.mutate(teamId);
  };

  const effectivePersonalPractice = settings.personal.practice_color ?? DEFAULT_PRACTICE_COLOR;
  const effectivePersonalCompetition = settings.personal.competition_color ?? DEFAULT_COMPETITION_COLOR;
  const showSameColorWarning =
    effectivePersonalPractice.toLowerCase() === effectivePersonalCompetition.toLowerCase();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="calendar-color-settings-loading">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="calendar-color-settings">
      <div className="pb-2 mb-4 border-b border-gray-200">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{t("title")}</h2>
        <p className="text-sm text-gray-600 mt-1">{t("description")}</p>
      </div>

      <div className="space-y-6">
        {/* 個人設定 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("personalSectionTitle")}</h3>
          <div className="space-y-4">
            <ColorSwatchRow
              label={t("practiceLabel")}
              testKey="practice"
              value={settings.personal.practice_color as TagColor | null}
              defaultColor={DEFAULT_PRACTICE_COLOR}
              onChange={(color) => handlePersonalChange("practice_color", color)}
              onReset={() => handlePersonalChange("practice_color", null)}
              disabled={isMutating}
            />
            <ColorSwatchRow
              label={t("competitionLabel")}
              testKey="competition"
              value={settings.personal.competition_color as TagColor | null}
              defaultColor={DEFAULT_COMPETITION_COLOR}
              onChange={(color) => handlePersonalChange("competition_color", color)}
              onReset={() => handlePersonalChange("competition_color", null)}
              disabled={isMutating}
            />
          </div>
          {showSameColorWarning && (
            <p className="text-xs text-amber-600 mt-2">{t("sameColorWarning")}</p>
          )}
        </div>

        {/* チーム別設定(承認済みメンバーシップのみ) */}
        {approvedTeams.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("teamSectionTitle")}</h3>
            <div className="space-y-3">
              {approvedTeams.map((membership) => {
                const teamColors = settings.byTeam[membership.team_id] ?? {
                  practice_color: null,
                  competition_color: null,
                };
                const hasCustom =
                  teamColors.practice_color !== null || teamColors.competition_color !== null;

                return (
                  <details
                    key={membership.team_id}
                    className="border border-gray-200 rounded-lg px-4 py-3"
                    data-testid={`calendar-color-team-${membership.team_id}`}
                  >
                    <summary className="cursor-pointer text-sm font-medium text-gray-800 flex items-center justify-between">
                      <span>{membership.teams.name}</span>
                      {hasCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTeamResetAll(membership.team_id);
                          }}
                          disabled={isMutating}
                          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          {t("resetTeamToDefault")}
                        </button>
                      )}
                    </summary>
                    <div className="mt-3 space-y-4">
                      <ColorSwatchRow
                        label={t("practiceLabel")}
                        testKey="practice"
                        value={teamColors.practice_color as TagColor | null}
                        defaultColor={effectivePersonalPractice as TagColor}
                        onChange={(color) => handleTeamChange(membership.team_id, "practice_color", color)}
                        onReset={() => handleTeamChange(membership.team_id, "practice_color", null)}
                        disabled={isMutating}
                      />
                      <ColorSwatchRow
                        label={t("competitionLabel")}
                        testKey="competition"
                        value={teamColors.competition_color as TagColor | null}
                        defaultColor={effectivePersonalCompetition as TagColor}
                        onChange={(color) => handleTeamChange(membership.team_id, "competition_color", color)}
                        onReset={() => handleTeamChange(membership.team_id, "competition_color", null)}
                        disabled={isMutating}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
