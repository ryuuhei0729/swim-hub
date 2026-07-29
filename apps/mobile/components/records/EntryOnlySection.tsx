import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { ErrorView } from "@/components/layout/ErrorView";
import { EntryOnlyCard } from "./EntryOnlyCard";
import type { EntryOnlyItem } from "@/utils/entryOnlyFilter";

interface EntryOnlySectionProps {
  items: EntryOnlyItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onItemPress: (item: EntryOnlyItem) => void;
}

/**
 * 「エントリー済み・記録未登録」大会セクション(RecordsScreen の FlashList ヘッダー)
 * web CompetitionClient.tsx:981-1020 のセクションと同じ表示条件をベースにしつつ、
 * ローディング中と0件を区別する(mobile 独自): web はローディング中も0件と同じ「何も出ない」
 * 描画だが、mobile では取得中である旨をインジケータで明示する(PendingMembersSection と同じパターン)。
 * - 取得中: 小さいインジケータ + 読み込み中テキストを表示(0件と見分けがつく)
 * - 取得失敗時: エラー表示+再試行導線を出す(web はサイレント縮退だが mobile では明示する)
 * - 取得完了かつ0件のときはセクションごと非表示
 */
export const EntryOnlySection: React.FC<EntryOnlySectionProps> = ({
  items,
  isLoading,
  isError,
  onRetry,
  onItemPress,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#5B21B6" />
          <Text style={styles.loadingText}>{t("dashboard.entry.loading")}</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <ErrorView message={t("competition.entry.entryFetchFailed")} onRetry={onRetry} />
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("dashboard.entry.enteredNoRecord")}</Text>
      {items.map((item) => (
        <EntryOnlyCard key={item.entryId} item={item} onPress={onItemPress} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5B21B6",
    marginHorizontal: 16,
    marginBottom: 6,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
});
