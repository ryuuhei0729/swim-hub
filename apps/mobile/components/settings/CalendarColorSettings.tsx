/**
 * ダッシュボード記録色カスタマイズ設定コンポーネント
 * 個人の練習/大会色と、所属チームごとの練習/大会色を設定する。
 * Web版 (apps/web/components/settings/CalendarColorSettings.tsx) とロジックを揃えている。
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks/queries/calendarColors";
import { TAG_COLORS } from "@apps/shared/constants/tagColors";
import { DEFAULT_PRACTICE_COLOR, DEFAULT_COMPETITION_COLOR } from "@apps/shared/utils/calendarColorResolver";

type ColorField = "practice_color" | "competition_color";
// mutate() の入力は Zod (z.enum(TAG_COLORS)) 由来のパレット内リテラル型を要求する。
// settings 側の型は汎用 string | null で保持しているため、ここで明示的にキャストする
// (実行時の値は常にパレット内 or null であることを resolver/DB 制約側が保証している)。
type PaletteColor = (typeof TAG_COLORS)[number];

interface ColorSwatchRowProps {
  label: string;
  value: string | null;
  defaultColor: string;
  onChange: (color: string) => void;
  onReset: () => void;
  disabled?: boolean;
  resetLabel: string;
}

// スウォッチ選択UIは TagManageModal のパレット選択(グリッド状の丸ボタン)を踏襲する
const ColorSwatchRow: React.FC<ColorSwatchRowProps> = ({
  label,
  value,
  defaultColor,
  onChange,
  onReset,
  disabled,
  resetLabel,
}) => {
  const isCustom = value !== null;
  const activeColor = (value ?? defaultColor).toLowerCase();

  return (
    <View style={styles.colorRow}>
      <View style={styles.colorRowHeader}>
        <Text style={styles.settingLabel}>{label}</Text>
        {isCustom && (
          <Pressable onPress={onReset} disabled={disabled} accessibilityRole="button" accessibilityLabel={resetLabel}>
            <Text style={styles.resetLink}>{resetLabel}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.colorGrid}>
        {TAG_COLORS.map((color) => {
          const isSelected = activeColor === color.toLowerCase();
          return (
            <Pressable
              key={color}
              style={[styles.colorOption, { backgroundColor: color }, isSelected && styles.colorOptionSelected]}
              onPress={() => onChange(color)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${color}`}
            >
              {isSelected && <Feather name="check" size={16} color="#374151" />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const CalendarColorSettings: React.FC = () => {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();

  const { teams = [] } = useTeamsQuery(supabase, { enableRealtime: false });
  const { settings, isLoading, updatePersonalColors, upsertTeamColors, deleteTeamColors } =
    useCalendarColorSettingsQuery(supabase, user?.id);

  // 承認待ち(pending)メンバーシップはチーム色設定の対象外
  const approvedTeams = teams.filter((membership) => membership.status === "approved" && membership.is_active === true);

  const isMutating = updatePersonalColors.isPending || upsertTeamColors.isPending || deleteTeamColors.isPending;

  const handlePersonalChange = (field: ColorField, color: string | null) => {
    updatePersonalColors.mutate({
      practice_color: (field === "practice_color" ? color : settings.personal.practice_color) as PaletteColor | null,
      competition_color: (field === "competition_color"
        ? color
        : settings.personal.competition_color) as PaletteColor | null,
    });
  };

  const handleTeamChange = (teamId: string, field: ColorField, color: string | null) => {
    const current = settings.byTeam[teamId] ?? { practice_color: null, competition_color: null };
    upsertTeamColors.mutate({
      teamId,
      practice_color: (field === "practice_color" ? color : current.practice_color) as PaletteColor | null,
      competition_color: (field === "competition_color"
        ? color
        : current.competition_color) as PaletteColor | null,
    });
  };

  const handleTeamResetAll = (teamId: string) => {
    deleteTeamColors.mutate(teamId);
  };

  const effectivePersonalPractice = settings.personal.practice_color ?? DEFAULT_PRACTICE_COLOR;
  const effectivePersonalCompetition = settings.personal.competition_color ?? DEFAULT_COMPETITION_COLOR;
  const showSameColorWarning = effectivePersonalPractice.toLowerCase() === effectivePersonalCompetition.toLowerCase();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#2563EB" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("settings.calendarColors.title")}</Text>
        <Text style={styles.description}>{t("settings.calendarColors.description")}</Text>
      </View>

      {/* 個人設定 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.calendarColors.personalSectionTitle")}</Text>
        <ColorSwatchRow
          label={t("settings.calendarColors.practiceLabel")}
          value={settings.personal.practice_color}
          defaultColor={DEFAULT_PRACTICE_COLOR}
          onChange={(color) => handlePersonalChange("practice_color", color)}
          onReset={() => handlePersonalChange("practice_color", null)}
          disabled={isMutating}
          resetLabel={t("settings.calendarColors.resetToDefault")}
        />
        <ColorSwatchRow
          label={t("settings.calendarColors.competitionLabel")}
          value={settings.personal.competition_color}
          defaultColor={DEFAULT_COMPETITION_COLOR}
          onChange={(color) => handlePersonalChange("competition_color", color)}
          onReset={() => handlePersonalChange("competition_color", null)}
          disabled={isMutating}
          resetLabel={t("settings.calendarColors.resetToDefault")}
        />
        {showSameColorWarning && (
          <Text style={styles.warningText}>{t("settings.calendarColors.sameColorWarning")}</Text>
        )}
      </View>

      {/* チーム別設定 (承認済みメンバーシップのみ) */}
      {approvedTeams.length > 0 && (
        <View style={[styles.section, styles.borderTop]}>
          <Text style={styles.sectionTitle}>{t("settings.calendarColors.teamSectionTitle")}</Text>
          {approvedTeams.map((membership) => {
            const teamColors = settings.byTeam[membership.team_id] ?? {
              practice_color: null,
              competition_color: null,
            };
            const hasCustom = teamColors.practice_color !== null || teamColors.competition_color !== null;

            return (
              <View key={membership.team_id} style={styles.teamBlock}>
                <View style={styles.teamHeaderRow}>
                  <Text style={styles.teamName}>{membership.teams.name}</Text>
                  {hasCustom && (
                    <Pressable
                      onPress={() => handleTeamResetAll(membership.team_id)}
                      disabled={isMutating}
                      accessibilityRole="button"
                      accessibilityLabel={t("settings.calendarColors.resetTeamToDefault")}
                    >
                      <Text style={styles.resetLink}>{t("settings.calendarColors.resetTeamToDefault")}</Text>
                    </Pressable>
                  )}
                </View>
                <ColorSwatchRow
                  label={t("settings.calendarColors.practiceLabel")}
                  value={teamColors.practice_color}
                  defaultColor={effectivePersonalPractice}
                  onChange={(color) => handleTeamChange(membership.team_id, "practice_color", color)}
                  onReset={() => handleTeamChange(membership.team_id, "practice_color", null)}
                  disabled={isMutating}
                  resetLabel={t("settings.calendarColors.resetToDefault")}
                />
                <ColorSwatchRow
                  label={t("settings.calendarColors.competitionLabel")}
                  value={teamColors.competition_color}
                  defaultColor={effectivePersonalCompetition}
                  onChange={(color) => handleTeamChange(membership.team_id, "competition_color", color)}
                  onReset={() => handleTeamChange(membership.team_id, "competition_color", null)}
                  disabled={isMutating}
                  resetLabel={t("settings.calendarColors.resetToDefault")}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  description: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  section: {
    gap: 16,
  },
  borderTop: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  teamBlock: {
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
  },
  teamHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  resetLink: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "500",
  },
  colorRow: {
    gap: 8,
  },
  colorRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingLabel: {
    fontSize: 14,
    color: "#374151",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#374151",
  },
  warningText: {
    fontSize: 12,
    color: "#D97706",
  },
});

export default CalendarColorSettings;
