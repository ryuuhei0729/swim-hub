"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks";
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
// チーム設定タブ (components/team/settings/TeamCalendarColorSection.tsx) も
// このコンポーネントを再利用する。スウォッチ UI をもう一度書かないこと。
export function ColorSwatchRow({
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
      {/* 8色を1行に収める (10色時代は grid-cols-5 で狭い幅だと2行になっていた)。
          スウォッチは w-8 (32px) + gap-2 (8px) なので 8列 = 312px。
          カード内側の実幅が狭い端末でも折り返さないよう sm 未満は4列にする。 */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
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
  const { settings, isLoading, updatePersonalColors } = useCalendarColorSettingsQuery(
    supabase,
    user?.id,
  );

  const isMutating = updatePersonalColors.isPending;

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

  const effectivePersonalPractice = settings.personal.practice_color ?? DEFAULT_PRACTICE_COLOR;
  const effectivePersonalCompetition =
    settings.personal.competition_color ?? DEFAULT_COMPETITION_COLOR;
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

      {/* 個人設定のみ。チーム別の色はチーム詳細の「設定」タブ
          (components/team/settings/TeamCalendarColorSection.tsx) へ移設した。
          所属チームが増えるほどこの画面が縦に伸び、どのチームの色かも分かりにくかったため。 */}
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
    </div>
  );
}
