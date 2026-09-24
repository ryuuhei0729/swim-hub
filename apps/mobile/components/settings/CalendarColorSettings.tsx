/**
 * ダッシュボード記録色カスタマイズ設定コンポーネント
 * 個人の練習/大会色を設定する。
 * Web版 (apps/web/components/settings/CalendarColorSettings.tsx) とロジックを揃えている。
 *
 * チーム別の記録色はチーム詳細の設定タブ
 * (components/teams/settings/TeamCalendarColorSection.tsx) が
 * そのチームのぶんだけ出す。スウォッチ選択 UI (ColorSwatchRow) はこのファイルが
 * 唯一の定義元で、あちらは export したものを使う。
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks/queries/calendarColors";
import { TAG_COLORS, STORABLE_TAG_COLORS } from "@apps/shared/constants/tagColors";
import { DEFAULT_PRACTICE_COLOR, DEFAULT_COMPETITION_COLOR } from "@apps/shared/utils/calendarColorResolver";

type ColorField = "practice_color" | "competition_color";
// mutate() の入力の検証対象は Zod の z.enum(STORABLE_TAG_COLORS) = 選択肢8色 + 旧色。
// settings 側の型は汎用 string | null で保持しているため、ここで明示的にキャストする。
// ⚠️ TAG_COLORS (ピッカーに出す8色) ではなく STORABLE_TAG_COLORS から導出すること。
// この handleChange は「変更しない側の色を既存値のまま再送する」ため、旧色 (#7DD3FC 等) を
// 保存済みのユーザーではパレット外の値がそのまま流れる。8色に絞ると型が実態と食い違う。
type PaletteColor = (typeof STORABLE_TAG_COLORS)[number];

export interface ColorSwatchRowProps {
  label: string;
  value: string | null;
  defaultColor: string;
  onChange: (color: string) => void;
  onReset: () => void;
  disabled?: boolean;
  resetLabel: string;
}

// スウォッチ選択UIは TagManageModal のパレット選択(グリッド状の丸ボタン)を踏襲する
export const ColorSwatchRow: React.FC<ColorSwatchRowProps> = ({
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

  const { settings, isLoading, updatePersonalColors } = useCalendarColorSettingsQuery(
    supabase,
    user?.id,
  );

  const isMutating = updatePersonalColors.isPending;

  const handlePersonalChange = (field: ColorField, color: string | null) => {
    updatePersonalColors.mutate({
      practice_color: (field === "practice_color" ? color : settings.personal.practice_color) as PaletteColor | null,
      competition_color: (field === "competition_color"
        ? color
        : settings.personal.competition_color) as PaletteColor | null,
    });
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
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
  // パレットは必ず1行に収める。固定幅だと色数×幅+gap が画面幅を超えた時点で
  // 折り返して2行になるため、スウォッチ側を flex で分配する
  // (色数が変わっても端末幅が狭くても折り返さない)
  colorGrid: {
    flexDirection: "row",
    gap: 10,
  },
  colorOption: {
    flex: 1,
    aspectRatio: 1,
    // 幅が flex で決まるので固定値ではなく十分大きい値で円にする
    borderRadius: 999,
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
