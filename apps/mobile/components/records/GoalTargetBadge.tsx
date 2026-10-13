import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { formatTimeBest } from "@apps/shared/utils/time";

interface GoalTargetBadgeProps {
  /** 目標タイム (秒) */
  time: number;
}

/** 入力画面のベストタイムバッジの下に出す「目標: xx.xx」。表示専用 */
export const GoalTargetBadge: React.FC<GoalTargetBadgeProps> = ({ time }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        {t("forms.recordLog.goalTargetLabel")}: {formatTimeBest(time)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    // web の GoalTargetBadge (bg-sky-100 text-sky-800) と同じ sky 系。blue 系は
    // エントリータイムのバッジ (entryTimeBadge) と同色で並ぶと見分けがつかないため使わない
    backgroundColor: "#E0F2FE", // sky-100
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    color: "#075985", // sky-800
  },
});
