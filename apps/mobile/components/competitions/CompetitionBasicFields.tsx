import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { formatDate } from "@apps/shared/utils/date";
import {
  competitionDaysFromRange,
  competitionEndDateFromDays,
} from "@apps/shared/utils/competitionDays";
import { useDateLocale } from "@/hooks/useDateLocale";
import { CompetitionDaysStepper } from "./CompetitionDaysStepper";

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
  /**
   * 開始日・終了日の変更 (日数の変更も終了日の変更として届く)。
   * 開始日を変えると日数を保ったまま終了日もずらすため、2つを同時に受け取る。
   */
  onDateRangeChange: (date: string, endDate: string) => void;
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
  /** 過去に使った場所の候補 (最近使った順)。渡したときだけ場所の入力中に候補を出す */
  placeSuggestions?: string[];
}

/**
 * 大会の基本項目 (開始日・日数・大会名・場所・水路) の入力欄。
 * 終了日は直接入れず「開始日 + 日数」で入力する (保存値は従来どおり endDate。単日なら空文字)。
 * 開始日を変えても日数は保ち、終了日をずらす。
 * 大会タブのフォームと目標フォームの新規大会入力で共有する。親の gap で並べる前提のフラグメント。
 */
export const CompetitionBasicFields: React.FC<CompetitionBasicFieldsProps> = ({
  date,
  endDate,
  title,
  place,
  poolType,
  onDateRangeChange,
  onTitleChange,
  onPlaceChange,
  onPoolTypeChange,
  errors,
  minDate,
  disabled = false,
  locked = false,
  placeSuggestions,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [placeFocused, setPlaceFocused] = useState(false);
  const days = competitionDaysFromRange(date, endDate);

  // 開始日を変えても日数は保つ (終了日を同じ日数だけずらす)
  const handleDateChange = (next: string) =>
    onDateRangeChange(next, days > 1 ? competitionEndDateFromDays(next, days) : "");

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
              onChange={handleDateChange}
              required
              disabled={disabled}
              error={errors?.date}
              minDate={minDate}
              compact
            />
          </View>
          <View>
            <Text style={styles.label}>{t("competition.form.daysLabel")}</Text>
            <CompetitionDaysStepper
              days={days}
              onChange={(next) => onDateRangeChange(date, competitionEndDateFromDays(date, next))}
              disabled={disabled || !date}
            />
          </View>
        </View>
        {days > 1 && endDate ? (
          <Text style={styles.endDatePreview}>
            {t("competition.form.endDatePreview", {
              date: formatDate(endDate, "longWithWeekday", locale),
            })}
          </Text>
        ) : null}
        {errors?.endDate ? <Text style={styles.errorText}>{errors.endDate}</Text> : null}
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
          onFocus={() => setPlaceFocused(true)}
          onBlur={() => setPlaceFocused(false)}
          placeholder={t("competition.form.placePlaceholder")}
          editable={!disabled}
        />
      </View>
      {/* 過去に使った場所のサジェスト (web PlaceCombobox 相当。練習フォームの場所サジェストと同じ形)。
          候補の項目も disabled で塞ぐ: 入力不可のまま place を書き換える経路にしないため。 */}
      {placeFocused &&
        placeSuggestions &&
        (() => {
          const query = place.trim().toLowerCase();
          const filtered = placeSuggestions
            .filter(
              (p) =>
                p.toLowerCase() !== query && (query === "" || p.toLowerCase().includes(query)),
            )
            .slice(0, 5);
          if (filtered.length === 0) return null;
          return (
            <View style={styles.placeSuggestions}>
              {filtered.map((p) => (
                <Pressable
                  key={p}
                  style={styles.placeSuggestionItem}
                  onPress={() => {
                    onPlaceChange(p);
                    setPlaceFocused(false);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={p}
                >
                  <Feather name="map-pin" size={13} color="#6B7280" />
                  <Text style={styles.placeSuggestionText} numberOfLines={1}>
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        })()}

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
  dateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  dateColumn: {
    flex: 1,
    minWidth: 0,
  },
  endDatePreview: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
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
  placeSuggestions: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  placeSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  placeSuggestionText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
});
