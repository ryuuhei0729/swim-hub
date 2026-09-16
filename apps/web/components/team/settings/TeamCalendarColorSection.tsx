"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks";
import { type TagColor } from "@apps/shared/constants/tagColors";
import {
  DEFAULT_PRACTICE_COLOR,
  DEFAULT_COMPETITION_COLOR,
} from "@apps/shared/utils/calendarColorResolver";
import { ColorSwatchRow } from "@/components/settings/CalendarColorSettings";

export interface TeamCalendarColorSectionProps {
  teamId: string;
}

/**
 * チーム設定タブの「このチームの記録色」セクション。
 *
 * スウォッチ UI は設定画面と共通の `ColorSwatchRow` を再利用する (再実装しない)。
 * 表示するのは **このチームの色だけ**。全チーム分の一覧は設定画面から撤去した。
 *
 * 既定色は個人設定の色。個人設定が未設定ならアプリ既定色になるので、
 * 「リセット」でどの色に戻るかがスウォッチの選択状態と一致する。
 */
export default function TeamCalendarColorSection({ teamId }: TeamCalendarColorSectionProps) {
  const t = useTranslations("settings.calendarColors");
  const tCommon = useTranslations("common");
  const { supabase, user } = useAuth();
  const { settings, isLoading, isError, upsertTeamColors } = useCalendarColorSettingsQuery(
    supabase,
    user?.id,
  );

  const teamColors = settings.byTeam[teamId] ?? { practice_color: null, competition_color: null };

  // 個人設定は DB 上 nullable。null は「アプリ既定色を使う」の意味なので、
  // ここでの ?? は「未設定」と業務的な値が衝突しない (色が1つ決まるだけ)。
  const effectivePersonalPractice = settings.personal.practice_color ?? DEFAULT_PRACTICE_COLOR;
  const effectivePersonalCompetition =
    settings.personal.competition_color ?? DEFAULT_COMPETITION_COLOR;

  const handleChange = (field: "practice_color" | "competition_color", color: TagColor | null) => {
    upsertTeamColors.mutate({
      teamId,
      practice_color:
        field === "practice_color" ? color : (teamColors.practice_color as TagColor | null),
      competition_color:
        field === "competition_color" ? color : (teamColors.competition_color as TagColor | null),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="team-calendar-color-loading">
        <div className="h-8 bg-gray-100 rounded animate-pulse" />
        <div className="h-8 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-red-700" data-testid="team-calendar-color-error">
        {tCommon("error")}
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="team-calendar-color-section">
      <ColorSwatchRow
        label={t("practiceLabel")}
        testKey="practice"
        value={teamColors.practice_color as TagColor | null}
        defaultColor={effectivePersonalPractice as TagColor}
        onChange={(color) => handleChange("practice_color", color)}
        onReset={() => handleChange("practice_color", null)}
        disabled={upsertTeamColors.isPending}
      />
      <ColorSwatchRow
        label={t("competitionLabel")}
        testKey="competition"
        value={teamColors.competition_color as TagColor | null}
        defaultColor={effectivePersonalCompetition as TagColor}
        onChange={(color) => handleChange("competition_color", color)}
        onReset={() => handleChange("competition_color", null)}
        disabled={upsertTeamColors.isPending}
      />
    </div>
  );
}
