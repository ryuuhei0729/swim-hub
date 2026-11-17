import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { CompetitionDaysStepper } from "@/components/competitions/CompetitionDaysStepper";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { competitionEndDate, type CompetitionDraft } from "./bulkRegisterUtils";
import { BULK_COLORS } from "./bulkRegisterColors";

interface CompetitionDraftSheetProps {
  visible: boolean;
  /** 開いたときの内容。id が既存の追加予定と一致すれば「編集」になる */
  draft: CompetitionDraft | null;
  isEditing: boolean;
  /** 指定期間に他の大会 (登録済み・追加予定) があるか */
  hasOverlap: (date: string, days: number, excludeId: string | null) => boolean;
  onSave: (draft: CompetitionDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const POOL_TYPES = [
  { value: 0, labelKey: "competition.form.poolTypeShort" },
  { value: 1, labelKey: "competition.form.poolTypeLong" },
] as const;

/** 大会を追加・編集するボトムシート (日程はカレンダーでタップした日が入り、ここでも変更できる) */
export function CompetitionDraftSheet({
  visible,
  draft,
  isEditing,
  hasOverlap,
  onSave,
  onDelete,
  onClose,
}: CompetitionDraftSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const locale = useDateLocale();
  const [local, setLocal] = useState<CompetitionDraft | null>(draft);

  // 開くたびに呼び出し元の内容で初期化する (閉じるアニメーション中は前の内容を表示したまま)
  useEffect(() => {
    if (visible) setLocal(draft);
  }, [visible, draft]);

  const update = <K extends keyof CompetitionDraft>(key: K, value: CompetitionDraft[K]) =>
    setLocal((prev) => (prev ? { ...prev, [key]: value } : prev));

  const overlap = local ? hasOverlap(local.date, local.days, isEditing ? local.id : null) : false;

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
        <Text style={styles.title}>
          {isEditing
            ? t("teams.mobile.bulkRegister.editCompetitionTitle")
            : t("teams.mobile.bulkRegister.addCompetitionTitle")}
        </Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")}>
          <Feather name="x" size={20} color="#6B7280" />
        </Pressable>
      </View>

      {local && (
        <>
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* 日程と日数を横並びにする */}
            <View style={styles.dateRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.label}>{t("teams.mobile.bulkRegister.labelSchedule")}</Text>
                <DatePickerField
                  value={local.date}
                  onChange={(date) => date && update("date", date)}
                  compact
                />
              </View>
              <View>
                <Text style={styles.label}>{t("competition.form.daysLabel")}</Text>
                <CompetitionDaysStepper days={local.days} onChange={(d) => update("days", d)} />
              </View>
            </View>
            {local.days > 1 && (
              <Text style={styles.endDatePreview}>
                {t("competition.form.endDatePreview", {
                  date: formatDate(competitionEndDate(local.date, local.days), "longWithWeekday", locale),
                })}
              </Text>
            )}

            <Text style={styles.label}>{t("teams.mobile.bulkRegister.labelCompetitionName")}</Text>
            <TextInput
              style={styles.input}
              value={local.title}
              onChangeText={(v) => update("title", v)}
              placeholder={t("teams.mobile.bulkCompetitionNamePlaceholder")}
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>{t("teams.mobile.bulkRegister.labelPlace")}</Text>
            <TextInput
              style={styles.input}
              value={local.place}
              onChangeText={(v) => update("place", v)}
              placeholder={t("teams.mobile.bulkPlacePlaceholder")}
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>{t("teams.mobile.bulkRegister.labelPoolType")}</Text>
            <View style={styles.poolRow}>
              {POOL_TYPES.map((p) => {
                const active = local.poolType === p.value;
                return (
                  <Pressable
                    key={p.value}
                    style={[styles.poolButton, active && styles.poolButtonActive]}
                    onPress={() => update("poolType", p.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.poolText, active && styles.poolTextActive]}>{t(p.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {local.noteOpen ? (
              <>
                <Text style={styles.label}>{t("teams.mobile.bulkRegister.labelMemo")}</Text>
                <TextInput
                  style={[styles.input, styles.memoInput]}
                  value={local.note}
                  onChangeText={(v) => update("note", v)}
                  placeholder={t("teams.mobile.bulkMemoPlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  autoFocus
                />
              </>
            ) : (
              <Pressable
                style={styles.memoButton}
                onPress={() => update("noteOpen", true)}
                accessibilityRole="button"
              >
                <Text style={styles.memoButtonText}>{t("teams.mobile.bulkRegister.addMemo")}</Text>
              </Pressable>
            )}

            {overlap && (
              <View style={styles.warning}>
                <Feather name="alert-triangle" size={13} color="#92400E" />
                <Text style={styles.warningText}>{t("teams.mobile.bulkRegister.overlapWarning")}</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: getSafeFooterPadding(12, insets.bottom) }]}>
            {isEditing && (
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDelete(local.id)}
                accessibilityRole="button"
              >
                <Text style={styles.deleteButtonText}>{t("common.delete")}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.saveButton}
              onPress={() => onSave(local)}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>
                {isEditing ? t("common.save") : t("common.add")}
              </Text>
            </Pressable>
          </View>
        </>
      )}
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
    paddingBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  body: {
    paddingHorizontal: 16,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  dateColumn: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginTop: 10,
    marginBottom: 5,
  },
  endDatePreview: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  memoInput: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  poolRow: {
    flexDirection: "row",
    gap: 8,
  },
  poolButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  poolButtonActive: {
    backgroundColor: BULK_COLORS.competition.main,
    borderColor: BULK_COLORS.competition.main,
  },
  poolText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  poolTextActive: {
    color: "#FFFFFF",
  },
  memoButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  memoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
  },
  footer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  deleteButton: {
    width: 88,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
  },
  saveButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BULK_COLORS.competition.main,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
