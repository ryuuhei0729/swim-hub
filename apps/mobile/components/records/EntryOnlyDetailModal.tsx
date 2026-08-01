import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { styles as dayDetailStyles } from "@/components/calendar/DayDetailModal/styles";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { localizedStyleName } from "@/utils/styleName";
import { formatTime } from "@/utils/formatters";
import type { EntryOnlyItem } from "@/utils/entryOnlyFilter";

interface EntryOnlyDetailModalProps {
  visible: boolean;
  /** エントリー済み・記録未登録の1件。null の間は何もレンダリングしない */
  item: EntryOnlyItem | null;
  onClose: () => void;
}

/**
 * 「エントリー済み・記録未登録」大会の読み取り専用簡易詳細モーダル
 * ダッシュボードの DayDetailModal と同じ外枠(Modal/オーバーレイ/ヘッダー)を再利用しつつ、
 * 編集/削除は行わず、大会名/日付/場所/種目/エントリータイムのみを表示する
 */
export const EntryOnlyDetailModal: React.FC<EntryOnlyDetailModalProps> = ({
  visible,
  item,
  onClose,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();

  if (!item) return null;

  const poolTypeLabel =
    item.poolType === 1 ? t("recordMobile.poolTypeLong") : t("recordMobile.poolTypeShort");

  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <View style={dayDetailStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={dayDetailStyles.safeAreaContainer}
          pointerEvents="box-none"
        >
          <View style={[dayDetailStyles.modalContent, localStyles.modalContent]}>
            <View style={dayDetailStyles.header}>
              <Text style={dayDetailStyles.title} numberOfLines={1}>
                {item.competitionName}
              </Text>
              <Pressable style={dayDetailStyles.closeButton} onPress={onClose}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView
              style={dayDetailStyles.body}
              contentContainerStyle={dayDetailStyles.bodyContent}
            >
              <View style={localStyles.badgeRow}>
                <View style={localStyles.badge}>
                  <Text style={localStyles.badgeText}>{t("dashboard.entry.entered")}</Text>
                </View>
              </View>

              <View style={localStyles.infoBlock}>
                <Text style={localStyles.dateText}>{formatDate(item.date, "long", locale)}</Text>
                {item.place && <Text style={localStyles.subText}>📍{item.place}</Text>}
                <Text style={localStyles.subText}>{poolTypeLabel}</Text>
                {item.teamName && <Text style={localStyles.subText}>{item.teamName}</Text>}
              </View>

              <View style={localStyles.row}>
                <Text style={localStyles.label}>{t("dashboard.entry.styleLabel")}</Text>
                <Text style={localStyles.value}>{localizedStyleName(item.styleName, t)}</Text>
              </View>

              <View style={localStyles.row}>
                <Text style={localStyles.label}>{t("dashboard.entry.entryTimeLabel")}</Text>
                <Text style={localStyles.value}>
                  {item.entryTime != null
                    ? formatTime(item.entryTime)
                    : t("recordMobile.unknownValue")}
                </Text>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const localStyles = StyleSheet.create({
  modalContent: {
    minHeight: 200,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  badge: {
    backgroundColor: "#DDD6FE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B21B6",
  },
  infoBlock: {
    gap: 4,
    marginBottom: 14,
  },
  dateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  subText: {
    fontSize: 13,
    color: "#6B7280",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    color: "#6B7280",
    minWidth: 90,
  },
  value: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
  },
});
