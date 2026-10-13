import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { isValid, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { DatePickerField } from "@/components/ui/DatePickerField";

const POOL_TYPES = [
  { value: 0, labelKey: "competition.form.poolTypeShort" },
  { value: 1, labelKey: "competition.form.poolTypeLong" },
] as const;

interface CompetitionBasicFieldsProps {
  /** 開始日 (yyyy-MM-dd) */
  date: string;
  /** 終了日 (yyyy-MM-dd、空文字なら単日開催) */
  endDate: string;
  title: string;
  place: string;
  /** 0: 短水路, 1: 長水路 */
  poolType: number;
  onDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onTitleChange: (title: string) => void;
  onPlaceChange: (place: string) => void;
  onPoolTypeChange: (poolType: number) => void;
  errors?: { date?: string; endDate?: string };
  /** 開始日として選べる最小日付 */
  minDate?: Date;
  /** 入力不可 (保存中・権限なし) */
  disabled?: boolean;
  /** 権限がなく読み取り専用の見た目にする */
  locked?: boolean;
}

/**
 * 大会の基本項目 (開始日・終了日・大会名・場所・水路) の入力欄。
 * 大会タブのフォームと目標フォームの新規大会入力で共有する。親の gap で並べる前提のフラグメント。
 */
export const CompetitionBasicFields: React.FC<CompetitionBasicFieldsProps> = ({
  date,
  endDate,
  title,
  place,
  poolType,
  onDateChange,
  onEndDateChange,
  onTitleChange,
  onPlaceChange,
  onPoolTypeChange,
  errors,
  minDate,
  disabled = false,
  locked = false,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.section}>
        <View style={styles.dateRow}>
          <View style={styles.dateColumn}>
            <Text style={styles.label}>
              {t("competition.form.startDateLabel")} <Text style={styles.required}>*</Text>
            </Text>
            <DatePickerField
              value={date}
              onChange={onDateChange}
              required
              disabled={disabled}
              error={errors?.date}
              minDate={minDate}
              compact
            />
          </View>
          <View style={styles.dateColumn}>
            <Text style={styles.label}>
              {t("competition.form.endDateLabel")}{" "}
              <Text style={styles.optional}>{t("competition.form.multiDayHint")}</Text>
            </Text>
            <DatePickerField
              value={endDate}
              onChange={onEndDateChange}
              allowClear
              disabled={disabled}
              error={errors?.endDate}
              minDate={isValid(parseISO(date)) ? parseISO(date) : undefined}
              compact
            />
          </View>
        </View>
      </View>

      <View style={[styles.section, styles.horizontalField]}>
        <Text style={[styles.label, styles.horizontalLabel]}>{t("competition.form.nameLabel")}</Text>
        <TextInput
          style={[styles.input, styles.horizontalInput, locked && styles.inputDisabled]}
          value={title}
          onChangeText={onTitleChange}
          placeholder={t("competition.form.namePlaceholder")}
          editable={!disabled}
        />
      </View>

      <View style={[styles.section, styles.horizontalField]}>
        <Text style={[styles.label, styles.horizontalLabel]}>{t("competition.form.placeLabel")}</Text>
        <TextInput
          style={[styles.input, styles.horizontalInput, locked && styles.inputDisabled]}
          value={place}
          onChangeText={onPlaceChange}
          placeholder={t("competition.form.placePlaceholder")}
          editable={!disabled}
        />
      </View>

      <View style={[styles.section, styles.horizontalField]}>
        <Text style={[styles.label, styles.horizontalLabel]}>
          {t("competition.form.poolTypeLabel")} <Text style={styles.required}>*</Text>
        </Text>
        <View style={[styles.pickerContainer, styles.horizontalInput]}>
          {POOL_TYPES.map((type) => (
            <Pressable
              key={type.value}
              style={[
                styles.pickerOption,
                poolType === type.value && styles.pickerOptionSelected,
                locked && styles.pickerOptionDisabled,
              ]}
              onPress={() => onPoolTypeChange(type.value)}
              disabled={disabled}
            >
              <Text
                style={[styles.pickerOptionText, poolType === type.value && styles.pickerOptionTextSelected]}
              >
                {t(type.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  required: {
    color: "#EF4444",
  },
  optional: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateColumn: {
    flex: 1,
  },
  horizontalField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  horizontalLabel: {
    width: 56,
    marginBottom: 0,
  },
  horizontalInput: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  pickerContainer: {
    flexDirection: "row",
    gap: 8,
  },
  pickerOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  pickerOptionSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  pickerOptionDisabled: {
    opacity: 0.5,
  },
  pickerOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  pickerOptionTextSelected: {
    color: "#2563EB",
    fontWeight: "600",
  },
});
