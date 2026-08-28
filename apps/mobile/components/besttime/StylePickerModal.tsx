import React from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { TFunction } from "i18next";
import { STYLES, formatStyleDisplay } from "./styleOptions";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

export interface StylePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (styleId: number) => void;
  t: TFunction;
}

/**
 * 種目選択ボトムシート。STYLES (22種) を一覧表示する。
 * オンボーディングとマイページ一括入力で共有する。
 */
export const StylePickerModal: React.FC<StylePickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  t,
}) => {
  const insets = useSafeInsets();
  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      overlayColor="rgba(0, 0, 0, 0.4)"
      sheetStyle={[
        styles.modalSheet,
        { paddingBottom: getSafeFooterPadding(32, insets.bottom) },
      ]}
    >
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>
          {t("onboarding.step3.styleModalTitle")}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={20} color="#374151" />
        </Pressable>
      </View>
      <FlatList
        data={STYLES}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const label = formatStyleDisplay(item, t);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.modalItem,
                pressed && styles.modalItemPressed,
              ]}
              onPress={() => onSelect(item.id)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={styles.modalItemText}>{label}</Text>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </SlideUpModal>
  );
};

const styles = StyleSheet.create({
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  modalItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalItemPressed: {
    backgroundColor: "#F0F9FF",
  },
  modalItemText: {
    fontSize: 15,
    color: "#111827",
  },
});
