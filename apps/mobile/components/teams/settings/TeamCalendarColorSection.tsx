/**
 * チーム詳細「設定」タブの記録色セクション。
 * ダッシュボードのカレンダーで、このチームの練習/大会をどの色で出すかを設定する。
 *
 * 設定画面 (components/settings/CalendarColorSettings.tsx) のチーム別セクションを
 * 「今見ているチームだけ」に絞ったもの。スウォッチ UI は向こうの ColorSwatchRow を
 * そのまま使い、書き込みは共通フックの upsertTeamColors に任せる (ロジックは再実装しない)。
 */
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks/queries/calendarColors";
import {
  DEFAULT_PRACTICE_COLOR,
  DEFAULT_COMPETITION_COLOR,
} from "@apps/shared/utils/calendarColorResolver";
import { STORABLE_TAG_COLORS } from "@apps/shared/constants/tagColors";
import { ColorSwatchRow } from "@/components/settings/CalendarColorSettings";

// mutate() の入力の検証対象は Zod の z.enum(STORABLE_TAG_COLORS) = 選択肢8色 + 旧色。
// 設定画面側と同じ理由で、ここでも保持している汎用 string を明示的にキャストする
// (変更しない側の色を既存値のまま再送するため、旧色がそのまま流れうる)。
type PaletteColor = (typeof STORABLE_TAG_COLORS)[number];
type ColorField = "practice_color" | "competition_color";

export interface TeamCalendarColorSectionProps {
  teamId: string;
}

export const TeamCalendarColorSection: React.FC<TeamCalendarColorSectionProps> = ({ teamId }) => {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const { settings, isLoading, isError, upsertTeamColors } = useCalendarColorSettingsQuery(
    supabase,
    user?.id,
  );

  // 行が無い = このチームに上書きが無い。個人設定の色をそのまま使う
  const teamColors = settings.byTeam[teamId] ?? {
    practice_color: null,
    competition_color: null,
  };
  const effectivePersonalPractice = settings.personal.practice_color ?? DEFAULT_PRACTICE_COLOR;
  const effectivePersonalCompetition =
    settings.personal.competition_color ?? DEFAULT_COMPETITION_COLOR;

  const handleChange = (field: ColorField, color: string | null) => {
    upsertTeamColors.mutate({
      teamId,
      practice_color: (field === "practice_color"
        ? color
        : teamColors.practice_color) as PaletteColor | null,
      competition_color: (field === "competition_color"
        ? color
        : teamColors.competition_color) as PaletteColor | null,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator size="small" color="#2563EB" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.errorText}>{t("common.error")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.description}>{t("teams.settingsTab.calendarColorDescription")}</Text>
      <ColorSwatchRow
        label={t("settings.calendarColors.practiceLabel")}
        value={teamColors.practice_color}
        defaultColor={effectivePersonalPractice}
        onChange={(color) => handleChange("practice_color", color)}
        onReset={() => handleChange("practice_color", null)}
        disabled={upsertTeamColors.isPending}
        resetLabel={t("settings.calendarColors.resetToDefault")}
      />
      <ColorSwatchRow
        label={t("settings.calendarColors.competitionLabel")}
        value={teamColors.competition_color}
        defaultColor={effectivePersonalCompetition}
        onChange={(color) => handleChange("competition_color", color)}
        onReset={() => handleChange("competition_color", null)}
        disabled={upsertTeamColors.isPending}
        resetLabel={t("settings.calendarColors.resetToDefault")}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  description: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
  },
  stateContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
  },
});
