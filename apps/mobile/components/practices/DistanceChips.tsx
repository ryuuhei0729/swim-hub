import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

/** よく泳ぐ距離プリセット。これ以外は「その他」で直接入力する (web practice-log/types.ts と同一) */
export const DISTANCE_PRESETS = [25, 50, 100, 200] as const;

interface DistanceChipsProps {
  /** 現在の距離。空入力を許容するため number | "" */
  value: number | "";
  onChange: (value: number | "") => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * 距離入力チップ (web PracticeMenuItem の距離プリセット + 「その他」の RN 移植)。
 * プリセット (25/50/100/200) はチップで選択し、「その他」チップはその場で数値入力欄に変化する。
 */
export const DistanceChips: React.FC<DistanceChipsProps> = ({
  value,
  onChange,
  disabled = false,
  testID,
}) => {
  const { t } = useTranslation();
  // 距離がプリセット外 (空含む) なら「その他」入力モードで開始
  const [showCustom, setShowCustom] = useState(
    () => value === "" || !(DISTANCE_PRESETS as readonly number[]).includes(Number(value)),
  );

  return (
    <View style={styles.container} testID={testID}>
      {DISTANCE_PRESETS.map((preset) => {
        const selected = !showCustom && Number(value) === preset;
        return (
          <Pressable
            key={preset}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => {
              setShowCustom(false);
              onChange(preset);
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-preset-${preset}` : undefined}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{preset}</Text>
          </Pressable>
        );
      })}
      {showCustom ? (
        // 「その他」ボタンがその場で入力欄に変化する
        <TextInput
          style={styles.customInput}
          value={value === "" ? "" : String(value)}
          onChangeText={(text) => {
            if (text === "") {
              onChange("");
              return;
            }
            const num = Number(text);
            if (Number.isNaN(num)) return;
            onChange(num);
          }}
          placeholder="100"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          editable={!disabled}
          autoFocus
          accessibilityLabel={t("practice.form.distanceLabel")}
          testID={testID ? `${testID}-input` : undefined}
        />
      ) : (
        <Pressable
          style={styles.chip}
          onPress={() => {
            onChange("");
            setShowCustom(true);
          }}
          disabled={disabled}
          accessibilityRole="button"
          testID={testID ? `${testID}-other` : undefined}
        >
          <Text style={styles.chipText}>{t("forms.practiceMenu.distanceOther")}</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    minWidth: 48,
    alignItems: "center",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  chipText: {
    fontSize: 14,
    color: "#374151",
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  customInput: {
    height: 38,
    width: 80,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: "#111827",
    textAlign: "center",
  },
});
