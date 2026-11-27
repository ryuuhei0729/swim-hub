import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

interface RecordFeedbackToggleButtonProps {
  /** 閲覧できる FB の件数 */
  count: number;
  /** 自分が書いた FB があるか */
  hasMine: boolean;
  /** 管理者として新しく書けるか (自分の記録でなく、まだ書いていない) */
  canWriteNew: boolean;
  open: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * チーム記録一覧の行に置く FB の開閉ボタン。
 * - FB があれば「FB n件」(自分が書いていれば「記入済み」を添える)
 * - 無くて書けるなら「FBを書く」
 * - どちらでもなければ何も出さない
 */
export const RecordFeedbackToggleButton: React.FC<RecordFeedbackToggleButtonProps> = ({
  count,
  hasMine,
  canWriteNew,
  open,
  onPress,
  testID = "record-feedback-toggle",
}) => {
  const { t } = useTranslation();
  if (count <= 0 && !canWriteNew) return null;

  const label =
    count > 0
      ? hasMine
        ? `${t("recordFeedbackMobile.countBadge", { count })} · ${t("recordFeedbackMobile.writtenByMe")}`
        : t("recordFeedbackMobile.countBadge", { count })
      : t("recordFeedbackMobile.write");

  return (
    <Pressable
      testID={testID}
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
    >
      <Feather name={count > 0 ? "message-circle" : "edit-3"} size={12} color="#7C3AED" />
      <Text style={styles.text}>{label}</Text>
      <Feather name={open ? "chevron-up" : "chevron-down"} size={12} color="#7C3AED" />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },
});
