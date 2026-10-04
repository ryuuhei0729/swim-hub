import React, { useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { CenterModal } from "@/components/ui/CenterModal";
import { useDateLocale } from "@/hooks/useDateLocale";
import { localizedStyleName } from "@/utils/styleName";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import type { GoalWithMilestones } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { REFLECTION_OPTIONS, buildReflectionNote } from "@apps/shared/utils/goalReflection";
import { formatTimeBest } from "@apps/shared/utils/time";
import { ReflectionChecklist } from "./ReflectionChecklist";
import { useCenterModalMaxHeight } from "./useCenterModalMaxHeight";

interface GoalReflectionModalProps {
  goal: GoalWithMilestones;
  /** 閉じるだけ。保存せず、次の期限切れも出さない */
  onSkip: () => void;
  /** 保存成功後。呼び出し元が次の期限切れを取得して表示する */
  onSaved: () => Promise<void>;
}

/** 期限切れ目標の振り返り (達成した / 達成できなかった + 理由) */
export const GoalReflectionModal: React.FC<GoalReflectionModalProps> = ({
  goal,
  onSkip,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const locale = useDateLocale();
  const maxHeight = useCenterModalMaxHeight();
  const [isReflectionOpen, setIsReflectionOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const options = REFLECTION_OPTIONS.map(({ id, labelKey }) => ({
    id,
    label: t(`goals.goalReflection.options.${labelKey}`),
  }));

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async (updates: Parameters<GoalAPI["updateGoal"]>[1]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await new GoalAPI(supabase).updateGoal(goal.id, updates);
      void queryClient.invalidateQueries({ queryKey: goalKeys.all });
      await onSaved();
    } catch (error) {
      console.error("Failed to update goal:", error);
      Alert.alert(t("common.alertErrorTitle"), t("goals.goalReflection.updateFailed"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleNotAchieved = () =>
    save({
      status: "cancelled",
      reflectionNote: buildReflectionNote({
        selectedIds,
        resolveLabel: (id) => options.find((o) => o.id === id)?.label ?? id,
        otherNote,
        formatOtherNote: (note) => t("goals.goalReflection.otherPrefix", { note }),
      }),
    });

  const achievedCount = goal.milestones.filter((m) => m.status === "achieved").length;

  return (
    <CenterModal
      visible
      onClose={onSkip}
      closeAccessibilityLabel={t("common.close")}
      contentStyle={{ maxHeight }}
    >
      <Text style={styles.title}>{t("goals.goalReflection.title")}</Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>{t("goals.goalReflection.expiredDesc")}</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {goal.competition === null
              ? t("goals.list.competitionInfoUnavailable")
              : goal.competition.title || t("goals.goalReflection.competitionFallback")}
          </Text>
          <Text style={styles.summaryText}>
            {goal.style
              ? localizedStyleName(goal.style, t)
              : t("goals.goalReflection.styleFallback")}{" "}
            |{" "}
            {t("goals.goalReflection.targetLabel")} {formatTimeBest(goal.target_time)}
          </Text>
          {goal.start_time ? (
            <Text style={styles.summaryMeta}>
              {t("goals.goalReflection.initialTimeLabel")} {formatTimeBest(goal.start_time)}
            </Text>
          ) : null}
          <Text style={styles.summaryMeta}>
            {t("goals.goalReflection.competitionDateLabel")}{" "}
            {goal.competition?.date
              ? formatDate(goal.competition.date, "long", locale)
              : t("goals.goalReflection.undecided")}
          </Text>
          {goal.milestones.length > 0 && (
            <Text style={styles.summaryMeta}>
              {t("goals.goalReflection.milestoneAchievedText", {
                achieved: achievedCount,
                total: goal.milestones.length,
              })}
            </Text>
          )}
        </View>
        <Text style={styles.question}>{t("goals.goalReflection.achievedQuestion")}</Text>
        <View style={styles.choiceRow}>
          <Pressable
            style={[styles.achievedButton, isSaving && styles.disabled]}
            onPress={() => save({ status: "achieved" })}
            disabled={isSaving}
            accessibilityRole="button"
          >
            <Feather name="award" size={18} color="#FFFFFF" />
            <Text style={styles.achievedButtonText}>{t("goals.goalReflection.achievedButton")}</Text>
          </Pressable>
          <Pressable
            style={[styles.notAchievedButton, isSaving && styles.disabled]}
            onPress={() => setIsReflectionOpen(true)}
            disabled={isSaving}
            accessibilityRole="button"
          >
            <Feather name="flag" size={18} color="#374151" />
            <Text style={styles.notAchievedButtonText}>
              {t("goals.goalReflection.notAchievedButton")}
            </Text>
          </Pressable>
        </View>

        {isReflectionOpen && (
          <View style={styles.reflection}>
            <ReflectionChecklist
              label={t("goals.goalReflection.reflectionLabel")}
              options={options}
              selectedIds={selectedIds}
              onToggle={toggle}
              otherLabel={t("goals.goalReflection.otherLabel")}
              otherPlaceholder={t("goals.goalReflection.otherPlaceholder")}
              otherNote={otherNote}
              onOtherNoteChange={setOtherNote}
              disabled={isSaving}
            />
            <View style={styles.choiceRow}>
              <Pressable
                style={[styles.notAchievedButton, isSaving && styles.disabled]}
                onPress={onSkip}
                disabled={isSaving}
                accessibilityRole="button"
              >
                <Text style={styles.notAchievedButtonText}>
                  {t("goals.goalReflection.skipButton")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, isSaving && styles.disabled]}
                onPress={handleNotAchieved}
                disabled={isSaving}
                accessibilityRole="button"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>{t("goals.goalReflection.saveButton")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
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
  question: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  choiceRow: {
    flexDirection: "row",
    gap: 12,
  },
  achievedButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#16A34A",
  },
  achievedButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  notAchievedButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  notAchievedButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  reflection: {
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
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
