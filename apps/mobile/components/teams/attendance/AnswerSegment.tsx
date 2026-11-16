"use client";

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus } from "@swim-hub/shared/types";

const OPTIONS: { status: AttendanceStatus; labelKey: string }[] = [
  { status: "present", labelKey: "teams.mobile.attendanceStatusPresent" },
  { status: "absent", labelKey: "teams.mobile.attendanceStatusAbsent" },
  { status: "other", labelKey: "teams.mobile.attendanceStatusOther" },
];

export const ANSWER_COLORS: Record<AttendanceStatus, string> = {
  present: "#16A34A",
  absent: "#DC2626",
  other: "#D97706",
};

interface AnswerSegmentProps {
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  /** 一覧の行に置く小さい形 / モーダルに置く横いっぱいの形 */
  size?: "compact" | "large";
  /** 締切後: 色を薄くして「締切」と分かるようにする (押すことはできる) */
  dimmed?: boolean;
  /** 読み上げ用。何に対する回答か (イベント名など) */
  accessibilityTarget: string;
  testID?: string;
}

/** 出席 / 欠席 / その他 の 3 択。押した時点で onChange を呼ぶ (保存は呼び出し側) */
export const AnswerSegment: React.FC<AnswerSegmentProps> = ({
  value,
  onChange,
  size = "compact",
  dimmed = false,
  accessibilityTarget,
  testID,
}) => {
  const { t } = useTranslation();
  const large = size === "large";
  return (
    <View style={[styles.container, large && styles.containerLarge]} testID={testID}>
      {OPTIONS.map(({ status, labelKey }, index) => {
        const selected = value === status;
        const label = t(labelKey);
        return (
          <Pressable
            key={status}
            onPress={() => onChange(status)}
            hitSlop={large ? 0 : { top: 6, bottom: 6 }}
            style={[
              styles.button,
              large ? styles.buttonLarge : styles.buttonCompact,
              index > 0 && styles.divider,
              selected && { backgroundColor: ANSWER_COLORS[status], opacity: dimmed ? 0.55 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t("teams.mobile.attendanceTab.answerAria", {
              title: accessibilityTarget,
              status: label,
            })}
            testID={testID ? `${testID}-${status}` : undefined}
          >
            <Text
              style={[
                styles.text,
                large && styles.textLarge,
                dimmed && !selected && styles.textDimmed,
                selected && styles.textSelected,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  containerLarge: {
    alignSelf: "stretch",
    borderRadius: 10,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  buttonCompact: {
    width: 46,
    paddingVertical: 7,
  },
  buttonLarge: {
    flex: 1,
    paddingVertical: 11,
  },
  divider: {
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  textLarge: {
    fontSize: 14,
  },
  textDimmed: {
    color: "#C4C9D0",
  },
  textSelected: {
    color: "#FFFFFF",
  },
});
