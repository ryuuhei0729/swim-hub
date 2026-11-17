import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import type { BulkRegisterInput } from "@apps/shared/api/teams/bulkRegister";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { BULK_COLORS } from "./bulkRegisterColors";

interface BulkRegisterConfirmSheetProps {
  visible: boolean;
  input: BulkRegisterInput;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

/** 登録前の確認シート (旧画面のプレビュー欄の代わり) */
export function BulkRegisterConfirmSheet({
  visible,
  input,
  submitting,
  onSubmit,
  onClose,
}: BulkRegisterConfirmSheetProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const insets = useSafeInsets();
  const total = input.practices.length + input.competitions.length;

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      onBackdropPress={() => !submitting && onClose()}
      backdropAccessibilityLabel={t("common.close")}
      overlayColor="rgba(17,24,39,0.4)"
      sheetStyle={styles.sheet}
    >
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Text style={styles.title}>{t("teams.mobile.bulkRegister.confirmTitle")}</Text>
        <Pressable onPress={onClose} disabled={submitting} hitSlop={8} accessibilityRole="button">
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body}>
        {input.practices.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: BULK_COLORS.practice.text }]}>
              {t("teams.mobile.bulkRegister.previewSectionPractices", { count: input.practices.length })}
            </Text>
            {input.practices.map((p) => (
              <View key={p.date} style={styles.item}>
                <Text style={styles.itemDate}>{formatDate(p.date, "shortWithWeekday", locale)}</Text>
                <Text style={styles.itemText} numberOfLines={2}>
                  {[p.title || t("teams.mobile.fallbackPractice"), p.place, p.note].filter(Boolean).join(" / ")}
                </Text>
              </View>
            ))}
          </View>
        )}
        {input.competitions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: BULK_COLORS.competition.text }]}>
              {t("teams.mobile.bulkRegister.previewSectionCompetitions", { count: input.competitions.length })}
            </Text>
            {input.competitions.map((c, i) => (
              <View key={`${c.date}-${i}`} style={styles.item}>
                <Text style={styles.itemDate}>
                  {formatDate(c.date, "shortWithWeekday", locale)}
                  {c.end_date ? ` 〜 ${formatDate(c.end_date, "shortWithWeekday", locale)}` : ""}
                </Text>
                <Text style={styles.itemText} numberOfLines={2}>
                  {[
                    c.title || t("teams.mobile.fallbackCompetitionTitle"),
                    c.place,
                    c.pool_type === 1 ? t("competition.form.poolTypeLong") : t("competition.form.poolTypeShort"),
                    c.note,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: getSafeFooterPadding(12, insets.bottom) }]}>
        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={onSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>
              {t("teams.mobile.bulkRegister.confirmSubmit", { count: total })}
            </Text>
          )}
        </Pressable>
      </View>
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "85%",
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
  backText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
  },
  body: {
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  item: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  itemDate: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    minWidth: 92,
  },
  itemText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  submitButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
