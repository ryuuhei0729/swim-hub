import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import {
  formatTimeBest,
  isInvalidTimeInput,
  parseTimeFlexible,
} from "@apps/shared/utils/time";

interface TimeSecondsInputProps {
  /** 秒数。null または 0 以下は未入力を表す */
  value: number | null;
  /** パース成功時は秒数、空欄・パース不能の途中入力は null を渡す */
  onChange: (seconds: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** 空欄で blur したときのエラー文言 (required のときのみ表示) */
  requiredErrorMessage?: string;
  /** 解釈できない値で blur したときのエラー文言 */
  invalidErrorMessage: string;
  /**
   * true の間は blur を経ていなくても invalidErrorMessage を表示する。
   * 呼び出し元が保存時に「保存できない値 (0以下等)」を検知した場合に使う。
   */
  forceInvalid?: boolean;
  /**
   * 入力欄に解釈できない文字列が残っているかを通知する。保存タップでは blur が起きない
   * (keyboardShouldPersistTaps="handled") ため、親が保存時に不正入力を検出するために使う。
   */
  onInvalidChange?: (invalid: boolean) => void;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * value / lastNotifiedValueRef の比較用正規化。呼び出し側が途中入力の null を 0 に
 * 変換して書き戻しても、0 を null に戻しても、どちらも「自分の入力が返ってきただけ」
 * として同じ扱いにする (0以下は未入力)。
 */
function normalizeForComparison(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

/**
 * 目標タイム・初期タイム・マイルストーンの目標タイム等の単発タイム入力欄。
 * 練習・大会記録入力と同じ parseTimeFlexible で柔軟にパースし、blur で m:ss.cc に正規化する。
 * web の goals/_components/shared/TimeSecondsInput.tsx の RN 版。
 */
export const TimeSecondsInput: React.FC<TimeSecondsInputProps> = ({
  value,
  onChange,
  placeholder = "2.00.00",
  disabled = false,
  required = false,
  requiredErrorMessage,
  invalidErrorMessage,
  forceInvalid = false,
  onInvalidChange,
  accessibilityLabel,
  testID,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(() => {
    const normalized = normalizeForComparison(value);
    return normalized !== null ? formatTimeBest(normalized) : "";
  });
  const [error, setError] = useState("");
  // 直近にこの部品自身が onChange で親へ通知した秒数。value がこれと一致する間は
  // 「自分の入力が返ってきただけ」とみなして表示を書き換えない
  // (1文字打つたびに value が更新され、formatTimeBest で上書きされて入力が壊れるのを防ぐ)。
  // 一致しないときだけ外部変更 (ベストタイム取得・テンプレ適用・リセット) として同期する
  const lastNotifiedValueRef = useRef<number | null>(normalizeForComparison(value));

  useEffect(() => {
    const normalized = normalizeForComparison(value);
    if (normalized === lastNotifiedValueRef.current) return;
    lastNotifiedValueRef.current = normalized;
    // 外部からの値更新で欄の内容が置き換わるので、不正入力の残留フラグは必ず解除する
    onInvalidChange?.(false);
    if (normalized !== null) {
      setDisplayValue(formatTimeBest(normalized));
      setError("");
    } else {
      setDisplayValue("");
    }
  }, [value, onInvalidChange]);

  const handleChangeText = (raw: string) => {
    setDisplayValue(raw);

    if (raw.trim() === "") {
      setError("");
      lastNotifiedValueRef.current = null;
      onInvalidChange?.(false);
      onChange(null);
      return;
    }

    const seconds = parseTimeFlexible(raw);
    if (seconds !== null) {
      setError("");
      lastNotifiedValueRef.current = normalizeForComparison(seconds);
      onInvalidChange?.(false);
      onChange(seconds);
    } else {
      // 入力途中でまだパースできない値。blur を経ない保存で古い確定値が残らないよう
      // 親には null を通知する。エラー表示は blur 時のみ (途中入力でエラーを出さない)
      lastNotifiedValueRef.current = null;
      onInvalidChange?.(true);
      onChange(null);
    }
  };

  const handleBlur = () => {
    if (displayValue.trim() === "") {
      if (required) setError(requiredErrorMessage ?? invalidErrorMessage);
      return;
    }

    if (isInvalidTimeInput(displayValue)) {
      setError(invalidErrorMessage);
      return;
    }
    const seconds = parseTimeFlexible(displayValue);
    if (seconds !== null) {
      setError("");
      setDisplayValue(formatTimeBest(seconds));
    }
  };

  const displayError = error || (forceInvalid ? invalidErrorMessage : "");

  return (
    <View>
      <TextInput
        style={[styles.input, !!displayError && styles.inputError, disabled && styles.inputDisabled]}
        value={displayValue}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType="decimal-pad"
        autoCorrect={false}
        autoCapitalize="none"
        editable={!disabled}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
      {!!displayError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {displayError}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: "#111827",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: "#EF4444",
  },
});
