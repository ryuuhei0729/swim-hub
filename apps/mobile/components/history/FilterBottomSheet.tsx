import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "./BottomSheet";

export type FilterGroupMode = "single" | "multi";

export interface FilterGroupOption {
  value: string;
  label: string;
  /** タグ等、選択時にこの色を背景に使う場合に指定する */
  color?: string;
}

export interface FilterGroup {
  id: string;
  label: string;
  mode: FilterGroupMode;
  options: FilterGroupOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  /** このグループのみを未選択(=すべて)に戻す */
  onClearGroup: () => void;
  /** 見出し直下に表示する注記(例: タググループの「すべて選択したタグを含む」) */
  note?: string;
}

export interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  /** 有効な絞り込み条件の総数(ドラフト値ベース)。0 の場合は「すべてクリア」を無効化する */
  activeCount: number;
  /** ドラフトのみを未選択に戻す(シートは閉じない) */
  onClearAll: () => void;
  /** ドラフトをストアへ一括コミットし、シートを閉じる(呼び出し側の責務) */
  onApply: () => void;
}

/**
 * 絞り込みボトムシート(汎用・draft/apply 専用)。グループごとにチップを表示する。
 * - single: タップで選択を置き換える。選択中のチップを再タップした場合はトグルで解除する
 * - multi: タップでトグル(複数選択)
 *
 * チップ操作(onChange)は呼び出し側のドラフト state のみを更新する想定で、
 * 「適用」ボタン押下時にのみ呼び出し側がストアへ一括コミットする。
 */
export const FilterBottomSheet: React.FC<FilterBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  groups,
  activeCount,
  onClearAll,
  onApply,
}) => {
  const { t } = useTranslation();

  const handleOptionPress = (group: FilterGroup, value: string) => {
    if (group.mode === "single") {
      const isAlreadySelected = group.selectedValues.includes(value);
      group.onChange(isAlreadySelected ? [] : [value]);
      return;
    }
    const next = group.selectedValues.includes(value)
      ? group.selectedValues.filter((v) => v !== value)
      : [...group.selectedValues, value];
    group.onChange(next);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.footerButton, styles.footerButtonOutline]}
            onPress={onClearAll}
            disabled={activeCount === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: activeCount === 0 }}
          >
            <Text
              style={[
                styles.footerButtonOutlineText,
                activeCount === 0 && styles.footerButtonTextDisabled,
              ]}
            >
              {t("common.bottomSheet.clearAll")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, styles.footerButtonPrimary]}
            onPress={onApply}
            accessibilityRole="button"
          >
            <Text style={styles.footerButtonPrimaryText}>{t("common.bottomSheet.apply")}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.groupsContainer}>
        {groups.map((group) => (
          <View key={group.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.selectedValues.length > 0 && (
                <Pressable onPress={group.onClearGroup} accessibilityRole="button">
                  <Text style={styles.groupClear}>{t("common.bottomSheet.clearGroup")}</Text>
                </Pressable>
              )}
            </View>
            {group.note && <Text style={styles.groupNote}>{group.note}</Text>}
            <View style={styles.chipsRow}>
              {group.options.length === 0 ? (
                <Text style={styles.noOptions}>-</Text>
              ) : (
                group.options.map((option) => {
                  const selected = group.selectedValues.includes(option.value);
                  const usesCustomColor = selected && !!option.color;
                  return (
                    <Pressable
                      key={option.value || "__unset__"}
                      style={[
                        styles.chip,
                        selected && !usesCustomColor && styles.chipSelected,
                        usesCustomColor && { backgroundColor: option.color },
                      ]}
                      onPress={() => handleOptionPress(group, option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={option.label}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  groupsContainer: {
    gap: 20,
  },
  group: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  groupClear: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  groupNote: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  noOptions: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  footerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  footerButtonOutline: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  footerButtonOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  footerButtonTextDisabled: {
    color: "#D1D5DB",
  },
  footerButtonPrimary: {
    backgroundColor: "#2563EB",
  },
  footerButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
