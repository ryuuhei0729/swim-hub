// =============================================================================
// StaleDataBanner - 再取得に失敗したが手元のデータは表示できるときの小さな通知
// =============================================================================
//
// React Query は再取得 (タブ切替・アプリ復帰・引っ張って更新) に失敗しても、前回取得した
// data を保持したまま isError を true にする。画面が isError だけを見て全画面エラーに
// 切り替えると、プールのように電波が不安定な場所では、見えていた一覧が一瞬で消えてしまう。
// データがあるときは一覧をそのまま表示し、このバナーで「古いかもしれない」ことだけ伝える。

import React, { useSyncExternalStore } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { onlineManager } from "@tanstack/react-query";
import { PressableScale } from "@/components/ui/PressableScale";

interface StaleDataBannerProps {
  /** 表示するか (通常は「isError かつ表示できるデータがある」) */
  visible: boolean;
  /** 再試行ボタンを押したとき */
  onRetry?: () => void;
}

const subscribeOnline = (listener: () => void) =>
  onlineManager.subscribe(listener);
const getOnline = () => onlineManager.isOnline();

export const StaleDataBanner: React.FC<StaleDataBannerProps> = ({
  visible,
  onRetry,
}) => {
  const { t } = useTranslation();
  const isOnline = useSyncExternalStore(subscribeOnline, getOnline, getOnline);

  if (!visible) return null;

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      testID="stale-data-banner"
    >
      <Feather name="alert-circle" size={14} color="#92400E" />
      <Text style={styles.text}>
        {isOnline
          ? t("common.staleData.failed")
          : t("common.staleData.offline")}
      </Text>
      {onRetry && isOnline && (
        <PressableScale
          style={styles.retryButton}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
        >
          <Text style={styles.retryText}>{t("common.retry")}</Text>
        </PressableScale>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#92400E",
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#FDE68A",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
  },
});
