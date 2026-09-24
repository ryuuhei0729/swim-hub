import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { ChipScrollRow } from "@/components/ui/ChipScrollRow";
import { SWIM_STYLES } from "@/utils/formatters";

/** 泳法カテゴリ (Swim/Pull/Kick)。個人・チーム代理入力の両画面で共有する唯一の定義元 */
export const SWIM_CATEGORIES = [
  { value: "Swim", label: "Swim" },
  { value: "Pull", label: "Pull" },
  { value: "Kick", label: "Kick" },
] as const;

export type SwimCategory = (typeof SWIM_CATEGORIES)[number]["value"];

interface StyleCategoryChipsProps {
  style: string;
  swimCategory: SwimCategory;
  onChangeStyle: (value: string) => void;
  onChangeCategory: (value: SwimCategory) => void;
  disabled?: boolean;
}

/**
 * 種目 (泳法) チップ + カテゴリ (Swim/Pull/Kick) チップの2段表示。
 * PracticeTabFormScreen (個人の練習ログ) から抽出し、TeamPracticeLogBulkFormScreen
 * (チーム代理入力) と共有する。style 軸と swimCategory 軸を取り違えないこと。
 */
export const StyleCategoryChips: React.FC<StyleCategoryChipsProps> = ({
  style,
  swimCategory,
  onChangeStyle,
  onChangeCategory,
  disabled = false,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {t("practice.form.styleLabel")} <Text style={styles.required}>*</Text>
      </Text>
      <ChipScrollRow>
        {SWIM_STYLES.map((s) => (
          <Pressable
            key={s.value}
            style={[styles.pickerOption, style === s.value && styles.pickerOptionSelected]}
            onPress={() => onChangeStyle(s.value)}
            disabled={disabled}
          >
            <Text
              style={[
                styles.pickerOptionText,
                style === s.value && styles.pickerOptionTextSelected,
              ]}
            >
              {t(`practice.styleAbbrev.${s.value}`)}
            </Text>
          </Pressable>
        ))}
      </ChipScrollRow>
      <ChipScrollRow>
        {SWIM_CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.pickerOption, swimCategory === c.value && styles.pickerOptionSelected]}
            onPress={() => onChangeCategory(c.value)}
            disabled={disabled}
          >
            <Text
              style={[
                styles.pickerOptionText,
                swimCategory === c.value && styles.pickerOptionTextSelected,
              ]}
            >
              {c.label}
            </Text>
          </Pressable>
        ))}
      </ChipScrollRow>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  required: {
    color: "#EF4444",
  },
  pickerOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  pickerOptionSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  pickerOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  pickerOptionTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
