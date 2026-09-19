// =============================================================================
// RankingErrorView - ランキングタブ共通のエラー表示 + 再試行
// =============================================================================
//
// 個人種目 (`./TeamRankings.tsx`) とリレー (`./TeamRelayRankings.tsx`) の
// 両サブビューが使う。第3弾でリレー用に同じものを書き足すと、片方だけ
// 再試行ボタンの有無や文言が変わって乖離するため1箇所に置く。

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export interface RankingErrorViewProps {
  /**
   * 表示する文言。生の `PostgrestError.message` (テーブル名・関数名・ポリシー名を
   * 含みうる) は出さない。必ず `toUserFacingMessage` を通した値を渡すこと。
   */
  message: string;
  onRetry: () => void;
}

export const RankingErrorView: React.FC<RankingErrorViewProps> = ({ message, onRetry }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.centerContainer}>
      <Feather name="alert-circle" size={40} color="#DC2626" />
      <Text style={styles.errorText}>{message}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryButtonText}>{t("teams.ranking.retry")}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  centerContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
