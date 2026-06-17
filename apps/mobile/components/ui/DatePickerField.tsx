import React, { useState } from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isToday,
  startOfDay,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";

interface DatePickerFieldProps {
  /** 選択された日付 (yyyy-MM-dd 形式の文字列、空文字なら未選択) */
  value: string;
  /** 日付が変更されたときのコールバック (yyyy-MM-dd or "") */
  onChange: (date: string) => void;
  /** ラベル */
  label?: string;
  /** 必須かどうか */
  required?: boolean;
  /** 無効状態 */
  disabled?: boolean;
  /** エラーメッセージ */
  error?: string;
  /** ヘルパーテキスト */
  helperText?: string;
  /** プレースホルダー (未指定時は i18n の common.datePicker.placeholder) */
  placeholder?: string;
  /** 選択可能な最小日付（日付のみ・時刻は無視） */
  minDate?: Date;
  /** 選択可能な最大日付（日付のみ・時刻は無視） */
  maxDate?: Date;
  /** クリアボタンを表示するか */
  allowClear?: boolean;
}

/** 日付グリッド生成: 月初の曜日分の先頭空白 + 当月の各日 */
function buildMonthGrid(month: Date): (Date | null)[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const leadingEmptyDays: null[] = Array(getDay(start)).fill(null);
  return [...leadingEmptyDays, ...days];
}

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  value,
  onChange,
  label,
  required,
  disabled,
  error,
  helperText,
  placeholder,
  minDate,
  maxDate,
  allowClear,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const weekdays = t("common.datePicker.weekdays", { returnObjects: true }) as string[];

  const selectedDate = value ? parseISO(value) : null;
  const hasValidSelection = !!selectedDate && isValid(selectedDate);

  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    hasValidSelection ? startOfMonth(selectedDate as Date) : startOfMonth(new Date()),
  );

  const openCalendar = () => {
    if (disabled) return;
    setCurrentMonth(hasValidSelection ? startOfMonth(selectedDate as Date) : startOfMonth(new Date()));
    setIsOpen(true);
  };

  const isDateDisabled = (date: Date): boolean => {
    // min/max は日付のみで比較する（時刻が混入しても境界の日が選べるよう正規化）
    const day = startOfDay(date);
    if (minDate && day < startOfDay(minDate)) return true;
    if (maxDate && day > startOfDay(maxDate)) return true;
    return false;
  };

  const handleSelectDate = (date: Date) => {
    if (isDateDisabled(date)) return;
    onChange(format(date, "yyyy-MM-dd"));
    setIsOpen(false);
  };

  const handlePrevMonth = () => setCurrentMonth((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth((prev) => addMonths(prev, 1));

  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    if (!isDateDisabled(today)) {
      onChange(format(today, "yyyy-MM-dd"));
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    onChange("");
  };

  const todayDisabled = isDateDisabled(new Date());
  const days = buildMonthGrid(currentMonth);
  const triggerLabel = hasValidSelection
    ? formatDate(value, "numeric", locale)
    : placeholder ?? t("common.datePicker.placeholder");

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      <Pressable
        onPress={openCalendar}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityLabel={label ?? t("common.datePicker.calendarAriaLabel")}
        style={[
          styles.trigger,
          error ? styles.triggerError : null,
          disabled ? styles.triggerDisabled : null,
        ]}
      >
        <View style={styles.triggerContent}>
          <Feather name="calendar" size={18} color="#9CA3AF" />
          <Text
            style={[styles.triggerText, !hasValidSelection && styles.placeholderText]}
            numberOfLines={1}
          >
            {triggerLabel}
          </Text>
        </View>

        {allowClear && hasValidSelection && !disabled && (
          <Pressable
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("common.datePicker.clearDate")}
            style={styles.clearButton}
          >
            <Feather name="x" size={16} color="#9CA3AF" />
          </Pressable>
        )}
      </Pressable>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          {/*
            オーバーレイ余白タップで閉じる。カードは別の Pressable で包み、
            カード領域のタップを onPress で吸収してオーバーレイへ伝播させない
            （RN では stopPropagation に頼らず、ヒットした最前面の Pressable が
            タッチを消費する挙動を利用する）
          */}
          <Pressable
            style={styles.calendarCard}
            onPress={() => {}}
            accessibilityLabel={t("common.datePicker.calendarAriaLabel")}
          >
            {/* 月送りヘッダ */}
            <View style={styles.calendarHeader}>
              <Pressable
                onPress={handlePrevMonth}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("common.datePicker.prevMonth")}
                style={styles.navButton}
              >
                <Feather name="chevron-left" size={22} color="#374151" />
              </Pressable>

              <Text style={styles.monthLabel}>{formatDate(currentMonth, "yearMonth", locale)}</Text>

              <Pressable
                onPress={handleNextMonth}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("common.datePicker.nextMonth")}
                style={styles.navButton}
              >
                <Feather name="chevron-right" size={22} color="#374151" />
              </Pressable>
            </View>

            {/* 曜日ヘッダ */}
            <View style={styles.weekdayRow}>
              {weekdays.map((day, index) => (
                <View key={day} style={styles.cell}>
                  <Text
                    style={[
                      styles.weekdayText,
                      index === 0 && styles.sundayText,
                      index === 6 && styles.saturdayText,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              ))}
            </View>

            {/* 日付グリッド */}
            <View style={styles.grid}>
              {days.map((day, index) => {
                if (!day) {
                  return <View key={`empty-${index}`} style={styles.cell} />;
                }

                const selected = hasValidSelection && isSameDay(day, selectedDate as Date);
                const inCurrentMonth = isSameMonth(day, currentMonth);
                const dayDisabled = isDateDisabled(day);
                const today = isToday(day);
                const dayOfWeek = getDay(day);

                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => handleSelectDate(day)}
                    disabled={dayDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: dayDisabled }}
                    accessibilityLabel={formatDate(day, "long", locale)}
                    style={styles.cell}
                  >
                    <View
                      style={[
                        styles.dayCircle,
                        !selected && today && styles.todayCircle,
                        selected && styles.selectedCircle,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !inCurrentMonth && styles.outsideMonthText,
                          !selected && dayOfWeek === 0 && inCurrentMonth && styles.sundayText,
                          !selected && dayOfWeek === 6 && inCurrentMonth && styles.saturdayText,
                          !selected && today && styles.todayText,
                          selected && styles.selectedText,
                          dayDisabled && styles.disabledDayText,
                        ]}
                      >
                        {format(day, "d")}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* フッタ */}
            <View style={styles.footer}>
              <Pressable
                onPress={handleToday}
                disabled={todayDisabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: todayDisabled }}
                style={styles.footerButton}
              >
                <Text style={[styles.todayButtonText, todayDisabled && styles.disabledButtonText]}>
                  {t("common.datePicker.today")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setIsOpen(false)}
                accessibilityRole="button"
                style={styles.footerButton}
              >
                <Text style={styles.closeButtonText}>{t("common.datePicker.close")}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    minHeight: 48,
  },
  triggerError: {
    borderColor: "#DC2626",
  },
  triggerDisabled: {
    opacity: 0.5,
    backgroundColor: "#F9FAFB",
  },
  triggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  triggerText: {
    fontSize: 16,
    color: "#111827",
    flexShrink: 1,
  },
  placeholderText: {
    color: "#9CA3AF",
  },
  clearButton: {
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
  },
  helperText: {
    fontSize: 12,
    color: "#6B7280",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  calendarCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navButton: {
    padding: 4,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  todayCircle: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  selectedCircle: {
    backgroundColor: "#2563EB",
  },
  dayText: {
    fontSize: 15,
    color: "#111827",
  },
  outsideMonthText: {
    color: "#D1D5DB",
  },
  sundayText: {
    color: "#DC2626",
  },
  saturdayText: {
    color: "#2563EB",
  },
  todayText: {
    color: "#2563EB",
    fontWeight: "600",
  },
  selectedText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  disabledDayText: {
    opacity: 0.5,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  footerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  todayButtonText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "500",
  },
  disabledButtonText: {
    opacity: 0.4,
  },
  closeButtonText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
});
