// =============================================================================
// OfflineBanner - オフライン状態を表示するバナーコンポーネント
// =============================================================================

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeInsets } from "@/hooks/useSafeInsets";

interface OfflineBannerProps {
  visible: boolean;
}

/**
 * オフライン状態を表示するバナー
 * ノッチ部分を避けるため、上部の安全領域を考慮
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({ visible }) => {
  const insets = useSafeInsets();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
      <Feather name="wifi-off" size={14} color="#92400E" />
      <Text style={styles.text}>{t("common.offlineBanner")}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FEF3C7",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#FCD34D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  text: {
    fontSize: 14,
    color: "#92400E",
    fontWeight: "500",
  },
});
