/**
 * ログインボタン右上に重ねる「直近で利用」バッジ
 * 見た目専用。読み上げはボタン側の accessibilityLabel に含める
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

interface LastUsedBadgeProps {
  testID?: string;
}

export const LastUsedBadge: React.FC<LastUsedBadgeProps> = ({ testID }) => {
  const { t } = useTranslation();
  return (
    <View
      style={styles.badge}
      pointerEvents="none"
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.text}>{t("auth.signin.lastUsed")}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -9,
    right: 12,
    backgroundColor: "#2563EB",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 1,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
});
