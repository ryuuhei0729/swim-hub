import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export interface ListToolbarProps {
  /** 絞り込み後の総件数(displayCount とは別物) */
  itemCount: number;
  onSortClick: () => void;
  onFilterClick: () => void;
  /** 有効な絞り込み条件の数。0 より大きい場合のみバッジを表示する */
  activeFilterCount: number;
}

/**
 * 大会/練習履歴タブ共通の一覧ツールバー(web の ListToolbar と同じ契約)。
 * 左に絞り込み後の件数、右に並べ替え/絞り込みのボトムシートを開くボタンを表示する。
 */
export const ListToolbar: React.FC<ListToolbarProps> = ({
  itemCount,
  onSortClick,
  onFilterClick,
  activeFilterCount,
}) => {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.itemCount}>{t("common.listToolbar.itemCount", { count: itemCount })}</Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.button}
          onPress={onSortClick}
          accessibilityRole="button"
          accessibilityLabel={t("common.listToolbar.sortButton")}
        >
          <Feather name="sliders" size={14} color="#374151" />
          <Text style={styles.buttonText}>{t("common.listToolbar.sortButton")}</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={onFilterClick}
          accessibilityRole="button"
          accessibilityLabel={t("common.listToolbar.filterButton")}
        >
          <Feather name="filter" size={14} color="#374151" />
          <Text style={styles.buttonText}>{t("common.listToolbar.filterButton")}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  itemCount: {
    fontSize: 13,
    color: "#6B7280",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
