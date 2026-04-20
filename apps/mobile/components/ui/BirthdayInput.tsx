import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { format, isValid } from "date-fns";

interface BirthdayInputProps {
  /** 値 (yyyy-MM-dd 形式の文字列、または先頭 10 文字が YYYY-MM-DD である ISO 文字列) */
  value?: string;
  /** 値が変化したとき (yyyy-MM-dd or "" を返す) */
  onChange: (date: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  /** 最小年。デフォルト: 1900 */
  minYear?: number;
  /** 最大年。デフォルト: 当年 */
  maxYear?: number;
}

function normalizeIsoToDate(v: string | undefined): string {
  if (!v) return "";
  return v.length >= 10 ? v.substring(0, 10) : "";
}

export const BirthdayInput: React.FC<BirthdayInputProps> = ({
  value,
  onChange,
  label,
  required,
  disabled,
  error: externalError,
  helperText,
  minYear = 1900,
  maxYear = new Date().getFullYear(),
}) => {
  const [yearText, setYearText] = useState("");
  const [monthText, setMonthText] = useState("");
  const [dayText, setDayText] = useState("");
  const [internalError, setInternalError] = useState<string | null>(null);

  const yearRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
  const lastEmittedRef = useRef<string>("");

  const normalizedValue = normalizeIsoToDate(value);

  useEffect(() => {
    if (normalizedValue === lastEmittedRef.current) return;
    lastEmittedRef.current = normalizedValue;
    if (normalizedValue) {
      const [y, m, d] = normalizedValue.split("-");
      setYearText(y || "");
      setMonthText(m ? String(Number(m)) : "");
      setDayText(d ? String(Number(d)) : "");
    } else {
      setYearText("");
      setMonthText("");
      setDayText("");
    }
    setInternalError(null);
  }, [normalizedValue]);

  const emit = useCallback(
    (next: string) => {
      if (next === lastEmittedRef.current) return;
      lastEmittedRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const validateAndEmit = useCallback(
    (y: string, m: string, d: string) => {
      if (!y || !m || !d || y.length !== 4) {
        setInternalError(null);
        emit("");
        return;
      }

      const yNum = Number(y);
      const mNum = Number(m);
      const dNum = Number(d);
      const date = new Date(yNum, mNum - 1, dNum);
      const isRealDate =
        isValid(date) &&
        date.getFullYear() === yNum &&
        date.getMonth() === mNum - 1 &&
        date.getDate() === dNum;

      if (!isRealDate) {
        setInternalError("存在しない日付です");
        emit("");
        return;
      }

      if (yNum < minYear || yNum > maxYear) {
        setInternalError(`${minYear}〜${maxYear}年の範囲で入力してください`);
        emit("");
        return;
      }

      setInternalError(null);
      emit(format(date, "yyyy-MM-dd"));
    },
    [minYear, maxYear, emit],
  );

  useEffect(() => {
    validateAndEmit(yearText, monthText, dayText);
  }, [yearText, monthText, dayText, validateAndEmit]);

  const handleYearChange = (text: string) => {
    const num = text.replace(/[^0-9]/g, "").slice(0, 4);
    setYearText(num);
    if (num.length === 4) monthRef.current?.focus();
  };

  const handleMonthChange = (text: string) => {
    const num = text.replace(/[^0-9]/g, "").slice(0, 2);
    setMonthText(num);
    if (num.length === 2 || (num.length === 1 && Number(num) >= 2)) {
      dayRef.current?.focus();
    }
  };

  const handleDayChange = (text: string) => {
    const num = text.replace(/[^0-9]/g, "").slice(0, 2);
    setDayText(num);
  };

  // Backspace で空フィールドから前フィールドへ戻る
  const handleMonthKeyPress = (e: { nativeEvent: { key: string } }) => {
    if (e.nativeEvent.key === "Backspace" && monthText === "") yearRef.current?.focus();
  };
  const handleDayKeyPress = (e: { nativeEvent: { key: string } }) => {
    if (e.nativeEvent.key === "Backspace" && dayText === "") monthRef.current?.focus();
  };

  const hasError = !!(externalError || internalError);
  const displayError = externalError || internalError;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      <View style={styles.row}>
        <View style={[styles.field, styles.yearField]}>
          <TextInput
            ref={yearRef}
            style={[styles.input, hasError && styles.inputError]}
            value={yearText}
            onChangeText={handleYearChange}
            placeholder="1996"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            maxLength={4}
            editable={!disabled}
            accessibilityLabel="生年"
            autoComplete="birthdate-year"
          />
          <Text style={styles.suffix}>年</Text>
        </View>
        <View style={styles.field}>
          <TextInput
            ref={monthRef}
            style={[styles.input, hasError && styles.inputError]}
            value={monthText}
            onChangeText={handleMonthChange}
            onKeyPress={handleMonthKeyPress}
            placeholder="2"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            maxLength={2}
            editable={!disabled}
            accessibilityLabel="生月"
            autoComplete="birthdate-month"
          />
          <Text style={styles.suffix}>月</Text>
        </View>
        <View style={styles.field}>
          <TextInput
            ref={dayRef}
            style={[styles.input, hasError && styles.inputError]}
            value={dayText}
            onChangeText={handleDayChange}
            onKeyPress={handleDayKeyPress}
            placeholder="22"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            maxLength={2}
            editable={!disabled}
            accessibilityLabel="生日"
            autoComplete="birthdate-day"
          />
          <Text style={styles.suffix}>日</Text>
        </View>
      </View>

      {hasError && <Text style={styles.errorText}>{displayError}</Text>}
      {!hasError && helperText && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  required: {
    color: "#DC2626",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  yearField: {
    flex: 1.4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    textAlign: "center",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  suffix: {
    fontSize: 14,
    color: "#374151",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
});
