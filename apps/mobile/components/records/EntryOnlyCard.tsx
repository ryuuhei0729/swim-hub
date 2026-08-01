import React, { useCallback } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { localizedStyleName } from "@/utils/styleName";
import type { EntryOnlyItem } from "@/utils/entryOnlyFilter";

interface EntryOnlyCardProps {
  item: EntryOnlyItem;
  onPress: (item: EntryOnlyItem) => void;
}

/**
 * 「エントリー済み・記録未登録」大会セクションの1件分カード
 * web CompetitionClient.tsx:988-1017 のカードと同じ情報(日付/大会名/場所/種目)を表示する
 */
export const EntryOnlyCard: React.FC<EntryOnlyCardProps> = ({ item, onPress }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t("competition.client.viewDetailAriaLabel")}
    >
      <View style={styles.row}>
        <Text style={styles.date}>{formatDate(item.date, "numeric", locale)}</Text>
        <Text style={styles.competitionName} numberOfLines={1}>
          {item.competitionName}
        </Text>
      </View>
      <View style={styles.rowSpaceBetween}>
        {item.place ? (
          <Text style={styles.place} numberOfLines={1}>
            📍{item.place}
          </Text>
        ) : (
          <View />
        )}
        <View style={styles.row}>
          <Text style={styles.style}>{localizedStyleName(item.styleName, t)}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("dashboard.entry.entered")}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 12,
    gap: 6,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowSpaceBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  date: {
    fontSize: 13,
    color: "#6D28D9",
  },
  competitionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4C1D95",
    flexShrink: 1,
  },
  place: {
    fontSize: 12,
    color: "#7C3AED",
    flexShrink: 1,
  },
  style: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5B21B6",
  },
  badge: {
    backgroundColor: "#DDD6FE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5B21B6",
  },
});
