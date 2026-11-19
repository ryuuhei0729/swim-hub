import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  MAX_COMPETITION_DAYS,
  MIN_COMPETITION_DAYS,
} from "@apps/shared/utils/competitionDays";

interface CompetitionDaysStepperProps {
  days: number;
  onChange: (days: number) => void;
  disabled?: boolean;
  /** −/＋ アイコンの色 (既定は大会系の青) */
  accentColor?: string;
}

/** 大会の開催日数の −/＋ ステッパー (「2日間」のように表示する) */
export function CompetitionDaysStepper({
  days,
  onChange,
  disabled = false,
  accentColor = "#2563EB",
}: CompetitionDaysStepperProps) {
  const { t } = useTranslation();
  const canDecrease = !disabled && days > MIN_COMPETITION_DAYS;
  const canIncrease = !disabled && days < MAX_COMPETITION_DAYS;

  return (
    <View style={[styles.stepper, disabled && styles.disabled]}>
      <Pressable
        style={styles.button}
        onPress={() => onChange(Math.max(MIN_COMPETITION_DAYS, days - 1))}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={t("competition.form.decreaseDays")}
        accessibilityState={{ disabled: !canDecrease }}
      >
        <Feather name="minus" size={16} color={canDecrease ? accentColor : "#D1D5DB"} />
      </Pressable>
      <Text style={styles.value}>{t("competition.form.daysValue", { count: days })}</Text>
      <Pressable
        style={styles.button}
        onPress={() => onChange(Math.min(MAX_COMPETITION_DAYS, days + 1))}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={t("competition.form.increaseDays")}
        accessibilityState={{ disabled: !canIncrease }}
      >
        <Feather name="plus" size={16} color={canIncrease ? accentColor : "#D1D5DB"} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    height: 42,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  disabled: {
    opacity: 0.5,
  },
  button: {
    width: 36,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  value: {
    minWidth: 60,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
