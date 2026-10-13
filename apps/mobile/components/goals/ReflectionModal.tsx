import React, { useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { CenterModal } from "@/components/ui/CenterModal";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useMilestoneSummary } from "@/hooks/useMilestoneSummary";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import type { Milestone } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { REFLECTION_OPTIONS, buildReflectionNote } from "@apps/shared/utils/goalReflection";
import { ReflectionChecklist } from "./ReflectionChecklist";
import { useCenterModalMaxHeight } from "./useCenterModalMaxHeight";

interface ReflectionModalProps {
  milestone: Milestone;
  /** 閉じるだけ。保存せず、次の期限切れも出さない */
  onSkip: () => void;
  /** 保存成功後。呼び出し元が次の期限切れを取得して表示する */
  onSaved: () => Promise<void>;
  onGoToGoals: () => void;
}

/** 期限切れ・未達成マイルストーンの振り返り */
export const ReflectionModal: React.FC<ReflectionModalProps> = ({
  milestone,
  onSkip,
  onSaved,
  onGoToGoals,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const locale = useDateLocale();
  const summarize = useMilestoneSummary();
  const maxHeight = useCenterModalMaxHeight();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const options = REFLECTION_OPTIONS.map(({ id, labelKey }) => ({
    id,
    label: t(`goals.reflection.options.${labelKey}`),
  }));

  const reflectionNote = buildReflectionNote({
    selectedIds,
    resolveLabel: (id) => options.find((o) => o.id === id)?.label ?? id,
    otherNote,
    formatOtherNote: (note) => t("goals.reflection.otherPrefix", { note }),
  });

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    // reflectionNote が null のままでは reflection_done が立たず、同じマイルストーンが
    // 保存のたびに再表示され続けるため、何か1つ入力されるまで保存させない
    if (savingRef.current || reflectionNote === null) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await new GoalAPI(supabase).updateMilestone(milestone.id, { reflectionNote });
      void queryClient.invalidateQueries({ queryKey: goalKeys.all });
      await onSaved();
    } catch (error) {
      console.error("Failed to save milestone reflection:", error);
      Alert.alert(t("common.alertErrorTitle"), t("goals.reflection.saveFailed"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const canSave = reflectionNote !== null && !isSaving;

  return (
    <CenterModal
      visible
      onClose={onSkip}
      closeAccessibilityLabel={t("common.close")}
      contentStyle={{ maxHeight }}
    >
      <Text style={styles.title}>{t("goals.reflection.title")}</Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>{t("goals.reflection.expiredDesc")}</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{milestone.title}</Text>
          <Text style={styles.summaryText}>{summarize(milestone)}</Text>
          {milestone.deadline && (
            <Text style={styles.summaryMeta}>
              {t("goals.reflection.deadlineLabel")} {formatDate(milestone.deadline, "long", locale)}
            </Text>
          )}
        </View>
        <Pressable onPress={onGoToGoals} accessibilityRole="link">
          <Text style={styles.link}>{t("goals.reflection.goToGoalsLink")}</Text>
        </Pressable>

        <ReflectionChecklist
          label={t("goals.reflection.reflectionLabel")}
          options={options}
          selectedIds={selectedIds}
          onToggle={toggle}
          otherLabel={t("goals.reflection.otherLabel")}
          otherPlaceholder={t("goals.reflection.otherPlaceholder")}
          otherNote={otherNote}
          onOtherNoteChange={setOtherNote}
          disabled={isSaving}
        />

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.skipButton, isSaving && styles.disabled]}
            onPress={onSkip}
            disabled={isSaving}
            accessibilityRole="button"
          >
            <Text style={styles.skipButtonText}>{t("goals.reflection.skipButton")}</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, !canSave && styles.disabled]}
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>{t("goals.reflection.saveButton")}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </CenterModal>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    gap: 12,
  },
  description: {
    fontSize: 14,
    color: "#4B5563",
  },
  summary: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    gap: 4,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  summaryText: {
    fontSize: 13,
    color: "#4B5563",
  },
  summaryMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  link: {
    fontSize: 12,
    color: "#2563EB",
    textDecorationLine: "underline",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 4,
  },
  skipButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  saveButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#2563EB",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.6,
  },
});
