import React from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import {
  EMPTY_PRACTICE_FIELDS,
  type ExistingScheduleMap,
  type PracticeFields,
} from "./bulkRegisterUtils";
import { BULK_COLORS } from "./bulkRegisterColors";

interface PracticePerDaySheetProps {
  visible: boolean;
  dates: readonly string[];
  common: PracticeFields;
  overrides: Readonly<Record<string, PracticeFields>>;
  existing: ExistingScheduleMap;
  onChangeOverride: (date: string, next: PracticeFields) => void;
  onRemoveDate: (date: string) => void;
  onClose: () => void;
}

/** 選んだ練習日ごとに、タイトル・場所・メモを上書きするシート (空欄は共通の内容になる) */
export function PracticePerDaySheet({
  visible,
  dates,
  common,
  overrides,
  existing,
  onChangeOverride,
  onRemoveDate,
  onClose,
}: PracticePerDaySheetProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const insets = useSafeInsets();

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel={t("common.close")}
      overlayColor="rgba(17,24,39,0.4)"
      sheetStyle={styles.sheet}
    >
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Text style={styles.title}>{t("teams.mobile.bulkRegister.perDayTitle")}</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
          <Text style={styles.closeText}>{t("common.close")}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>{t("teams.mobile.bulkRegister.perDayHint")}</Text>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: getSafeFooterPadding(16, insets.bottom) }}
        keyboardShouldPersistTaps="handled"
      >
        {dates.map((date) => {
          const o = overrides[date] ?? EMPTY_PRACTICE_FIELDS;
          const set = (patch: Partial<PracticeFields>) => onChangeOverride(date, { ...o, ...patch });
          return (
            <View key={date} style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleRow}>
                  <Text style={styles.dayTitle}>{formatDate(date, "shortWithWeekday", locale)}</Text>
                  {existing[date]?.competition && (
                    <Text style={styles.badge}>{t("teams.mobile.bulkRegister.sameDayAsCompetition")}</Text>
                  )}
                </View>
                <Pressable onPress={() => onRemoveDate(date)} hitSlop={6} accessibilityRole="button">
                  <Text style={styles.removeText}>{t("teams.mobile.bulkRegister.removeDay")}</Text>
                </Pressable>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, !!o.title && styles.inputOverridden]}
                  value={o.title}
                  onChangeText={(v) => set({ title: v })}
                  placeholder={common.title || t("teams.mobile.bulkRegister.labelTitle")}
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  style={[styles.input, !!o.place && styles.inputOverridden]}
                  value={o.place}
                  onChangeText={(v) => set({ place: v })}
                  placeholder={common.place || t("teams.mobile.bulkRegister.labelPlace")}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              {o.noteOpen ? (
                <TextInput
                  style={[styles.input, styles.memoInput, !!o.note && styles.inputOverridden]}
                  value={o.note}
                  onChangeText={(v) => set({ note: v })}
                  placeholder={common.note || t("teams.mobile.bulkRegister.labelMemo")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  autoFocus
                />
              ) : (
                <Pressable style={styles.memoButton} onPress={() => set({ noteOpen: true })} accessibilityRole="button">
                  <Text style={styles.memoButtonText}>{t("teams.mobile.bulkRegister.addMemo")}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  closeText: {
    fontSize: 14,
    fontWeight: "700",
    color: BULK_COLORS.practice.text,
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  body: {
    paddingHorizontal: 16,
  },
  dayBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  dayTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  badge: {
    fontSize: 10,
    fontWeight: "700",
    color: BULK_COLORS.competition.text,
    backgroundColor: BULK_COLORS.competition.light,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  removeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EF4444",
  },
  inputRow: {
    flexDirection: "row",
    gap: 6,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputOverridden: {
    borderColor: BULK_COLORS.practice.main,
    backgroundColor: BULK_COLORS.practice.light,
  },
  memoInput: {
    marginTop: 6,
    minHeight: 56,
    textAlignVertical: "top",
  },
  memoButton: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  memoButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
});
