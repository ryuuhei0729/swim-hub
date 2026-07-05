import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

interface GenderToggleProps {
  /** 0: 男性, 1: 女性 (users.gender と同値) */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * 性別選択トグル (男性 / 女性)。
 * Web の ProfileEditModal / Step2Profile の2択トグルに対応するモバイル版。
 */
export const GenderToggle: React.FC<GenderToggleProps> = ({ value, onChange, disabled }) => {
  const { t } = useTranslation();
  const options = [
    { value: 0, label: t("mypage.profileEdit.genderMale") },
    { value: 1, label: t("mypage.profileEdit.genderFemale") },
  ];

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{t("mypage.profileEdit.genderLabel")}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !!disabled }}
              accessibilityLabel={opt.label}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  optionSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
  optionTextSelected: {
    color: "#2563EB",
    fontWeight: "600",
  },
});
