import React, { useCallback } from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

interface NumberStepperProps {
  /** 現在値。入力中の空状態を許容するため number | "" */
  value: number | "";
  /** 値変更時のコールバック。空入力は "" のまま保持する (web NumberStepper と同じ規約) */
  onChange: (value: number | "") => void;
  min?: number;
  max?: number;
  /** −/+ ボタン1回あたりの増減幅 */
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  /** 中央 input の accessibilityLabel (フィールド名) */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * −/+ ボタンと直接入力を兼ねた数値ステッパー (web components/ui/NumberStepper.tsx の RN 移植)。
 * 普段はボタンで増減、変則値は中央をタップして直接入力する。
 * 直接入力の確定時 (blur) に min/max へクランプし、不正値 (0以下・上限超え) を防ぐ。
 */
export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  disabled = false,
  accessibilityLabel,
  testID,
}) => {
  const { t } = useTranslation();
  const current = value === "" ? NaN : Number(value);

  const clamp = useCallback(
    (n: number) => {
      let result = n;
      result = Math.max(min, result);
      if (max !== undefined) result = Math.min(max, result);
      return result;
    },
    [min, max],
  );

  const handleStep = useCallback(
    (delta: number) => {
      const base = Number.isNaN(current) ? min : current;
      onChange(clamp(base + delta));
    },
    [current, min, clamp, onChange],
  );

  const handleChangeText = useCallback(
    (text: string) => {
      if (text === "") {
        onChange("");
        return;
      }
      const num = Number(text);
      if (Number.isNaN(num)) return;
      onChange(num);
    },
    [onChange],
  );

  // 直接入力の確定時にクランプ (0以下や max 超えの不正値を防ぐ)
  const handleEndEditing = useCallback(() => {
    if (value === "") return;
    const clamped = clamp(Number(value));
    if (clamped !== Number(value)) onChange(clamped);
  }, [value, clamp, onChange]);

  const atMin = !Number.isNaN(current) && current <= min;
  const atMax = max !== undefined && !Number.isNaN(current) && current >= max;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => handleStep(-step)}
        disabled={disabled || atMin}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? ""} ${t("forms.practiceMenu.decrease")}`.trim()}
        style={styles.button}
        testID={testID ? `${testID}-decrease` : undefined}
        hitSlop={4}
      >
        <Feather name="minus" size={16} color={disabled || atMin ? "#D1D5DB" : "#2563EB"} />
      </Pressable>
      <TextInput
        style={styles.input}
        value={value === "" ? "" : String(value)}
        onChangeText={handleChangeText}
        onEndEditing={handleEndEditing}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
        editable={!disabled}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
      <Pressable
        onPress={() => handleStep(step)}
        disabled={disabled || atMax}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? ""} ${t("forms.practiceMenu.increase")}`.trim()}
        style={styles.button}
        testID={testID ? `${testID}-increase` : undefined}
        hitSlop={4}
      >
        <Feather name="plus" size={16} color={disabled || atMax ? "#D1D5DB" : "#2563EB"} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    overflow: "hidden",
  },
  button: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 16,
    color: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
});
