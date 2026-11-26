import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

interface RecordFeedbackCountBadgeProps {
  count: number;
  /** 未読がある (自分宛ての FB) とき強調表示する */
  hasUnread?: boolean;
  testID?: string;
}

/** 記録カードの「FB n件」表示。0件のときは何も出さない */
export const RecordFeedbackCountBadge: React.FC<RecordFeedbackCountBadgeProps> = ({
  count,
  hasUnread = false,
  testID = "record-feedback-count-badge",
}) => {
  const { t } = useTranslation();
  if (count <= 0) return null;
  const label = t("recordFeedbackMobile.countBadge", { count });
  return (
    <View
      testID={testID}
      style={[styles.badge, hasUnread && styles.badgeUnread]}
      accessible
      accessibilityLabel={label}
    >
      <Feather name="message-circle" size={11} color={hasUnread ? "#FFFFFF" : "#7C3AED"} />
      <Text style={[styles.text, hasUnread && styles.textUnread]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#F3E8FF",
  },
  badgeUnread: {
    backgroundColor: "#7C3AED",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: "#7C3AED",
  },
  textUnread: {
    color: "#FFFFFF",
  },
});
