import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { CenterModal } from "@/components/ui/CenterModal";
import { localizedStyleName } from "@/utils/styleName";
import { useUserProfileQuery } from "@apps/shared/hooks/queries/user";
import type { GoalWithMilestones } from "@apps/shared/types";
import {
  calculateAge,
  calculateGoalSetTargetTime,
  getStyleCoefficient,
} from "@apps/shared/utils/goalSetCalculator";
import { formatTimeBest } from "@apps/shared/utils/time";
import { useCenterModalMaxHeight } from "./useCenterModalMaxHeight";

/** 順天堂大学水泳研究室の重回帰式の解説ページ */
const GOAL_SET_DESCRIPTION_URL =
  "https://sites.google.com/view/goalset-racetime-prediction/%E3%83%95%E3%82%A3%E3%83%BC%E3%83%89%E3%83%90%E3%83%83%E3%82%AF/%E9%87%8D%E5%9B%9E%E5%B8%B0%E5%BC%8F";

interface GoalSetCalculatorModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (targetAverageTime: number, practicePoolType: number) => void;
  goal: GoalWithMilestones;
}

/**
 * ゴールセット目標タイム計算。100m目標タイムから、50m×6本×3セットで出すべき平均タイムを逆算する。
 * 計算式は shared の goalSetCalculator が唯一の定義元 (web と同一)。
 */
export const GoalSetCalculatorModal: React.FC<GoalSetCalculatorModalProps> = ({
  visible,
  onClose,
  onConfirm,
  goal,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const maxHeight = useCenterModalMaxHeight();
  const [practicePoolType, setPracticePoolType] = useState<0 | 1>(0);
  const { data: profile, isLoading: isProfileLoading } = useUserProfileQuery(supabase);

  const birthday = profile?.birthday;
  const gender = profile?.gender;
  const age = useMemo(() => (birthday ? calculateAge(birthday) : null), [birthday]);
  const genderKnown = gender === 0 || gender === 1;

  // 大会情報 (対象大会の水路) が無い目標・年齢・性別が未設定のときは計算できない
  const result = useMemo(() => {
    if (!age || !goal.competition || (gender !== 0 && gender !== 1)) return null;
    const value = calculateGoalSetTargetTime({
      Y: goal.target_time,
      X2: age,
      X3: 3,
      // DB: gender 0=男性, 1=女性 / 計算式: X4 1=男性, 0=女性
      X4: gender === 0 ? 1 : 0,
      X5: practicePoolType,
      X6: goal.competition.pool_type,
      X7: getStyleCoefficient(goal.style.style),
    });
    // 現実的な範囲チェック (20秒未満・60秒超は警告)
    return { value, warning: value < 20 || value > 60 };
  }, [age, gender, goal.competition, goal.target_time, goal.style.style, practicePoolType]);

  const handleConfirm = () => {
    if (result && result.value > 0) {
      onConfirm(result.value, practicePoolType);
      onClose();
    }
  };

  const errorBlock = (lines: string[]) => (
    <View style={styles.errorBlock}>
      {lines.map((line) => (
        <Text key={line} style={styles.errorBlockText}>
          {line}
        </Text>
      ))}
    </View>
  );

  let resultView: React.ReactNode;
  if (!goal.competition) {
    resultView = errorBlock([t("goals.list.competitionInfoUnavailable")]);
  } else if (result) {
    resultView = (
      <View style={[styles.resultBlock, result.warning && styles.resultBlockWarning]}>
        <Text style={styles.resultLabel}>{t("goals.goalSetCalculator.resultLabel")}</Text>
        <Text style={styles.resultValue}>{formatTimeBest(result.value)}</Text>
        <Text style={styles.resultDescription}>{t("goals.goalSetCalculator.resultDescription")}</Text>
        {result.warning && (
          <View style={styles.warningRow}>
            <Feather name="alert-triangle" size={14} color="#A16207" />
            <Text style={styles.warningText}>{t("goals.goalSetCalculator.warningText")}</Text>
          </View>
        )}
      </View>
    );
  } else if (isProfileLoading) {
    resultView = <Text style={styles.calculating}>{t("goals.goalSetCalculator.loading")}</Text>;
  } else if (age === null) {
    resultView = errorBlock([
      t("goals.goalSetCalculator.ageNotSetError"),
      t("goals.goalSetCalculator.profileSettingHint"),
    ]);
  } else if (!genderKnown) {
    resultView = errorBlock([
      t("goals.goalSetCalculator.genderNotSetError"),
      t("goals.goalSetCalculator.profileSettingHint"),
    ]);
  } else {
    resultView = <Text style={styles.calculating}>{t("goals.goalSetCalculator.calculating")}</Text>;
  }

  return (
    <CenterModal
      visible={visible}
      onClose={onClose}
      closeAccessibilityLabel={t("goals.goalSetCalculator.closeAriaLabel")}
      contentStyle={{ maxHeight }}
    >
      <Text style={styles.title}>{t("goals.goalSetCalculator.title")}</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBlock}>
          <Text style={styles.infoTitle}>{t("goals.goalSetCalculator.autoFetchTitle")}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("goals.goalSetCalculator.targetLabel")}</Text>
            <Text style={styles.infoValue}>
              {localizedStyleName(goal.style, t)} {formatTimeBest(goal.target_time)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("goals.goalSetCalculator.poolTypeLabel")}</Text>
            <Text style={styles.infoValue}>
              {goal.competition
                ? goal.competition.pool_type === 1
                  ? t("goals.goalSetCalculator.poolTypeLongDisplay")
                  : t("goals.goalSetCalculator.poolTypeShortDisplay")
                : t("goals.list.competitionInfoUnavailable")}
            </Text>
          </View>
          {isProfileLoading ? (
            <Text style={styles.infoLabel}>{t("goals.goalSetCalculator.loading")}</Text>
          ) : (
            <>
              {age !== null ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("goals.goalSetCalculator.ageLabel")}</Text>
                  <Text style={styles.infoValue}>
                    {age}
                    {t("goals.goalSetCalculator.ageUnit")}
                  </Text>
                </View>
              ) : (
                <Text style={styles.infoError}>{t("goals.goalSetCalculator.ageNotSetError")}</Text>
              )}
              {genderKnown ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("goals.goalSetCalculator.genderLabel")}</Text>
                  <Text style={styles.infoValue}>
                    {gender === 1
                      ? t("goals.goalSetCalculator.genderFemale")
                      : t("goals.goalSetCalculator.genderMale")}
                  </Text>
                </View>
              ) : (
                <Text style={styles.infoError}>{t("goals.goalSetCalculator.genderNotSetError")}</Text>
              )}
            </>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("goals.goalSetCalculator.practicePoolTypeLabel")}</Text>
          <View style={styles.segment}>
            {([0, 1] as const).map((poolType) => {
              const active = practicePoolType === poolType;
              const label =
                poolType === 0
                  ? t("goals.goalSetCalculator.poolTypeShort")
                  : t("goals.goalSetCalculator.poolTypeLong");
              return (
                <Pressable
                  key={poolType}
                  style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  onPress={() => setPracticePoolType(poolType)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {resultView}

        <View style={styles.description}>
          <Text style={styles.descriptionText}>
            <Text
              style={styles.link}
              onPress={() => void Linking.openURL(GOAL_SET_DESCRIPTION_URL)}
              accessibilityRole="link"
            >
              {t("goals.goalSetCalculator.descriptionLinkText")}
            </Text>
            {t("goals.goalSetCalculator.descriptionBody")}
          </Text>
          <Text style={styles.descriptionNote}>{t("goals.goalSetCalculator.subjectiveNote")}</Text>
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelButtonText}>{t("goals.goalSetCalculator.cancelButton")}</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmButton, !result && styles.disabled]}
            onPress={handleConfirm}
            disabled={!result}
            accessibilityRole="button"
            accessibilityState={{ disabled: !result }}
          >
            <Text style={styles.confirmButtonText}>{t("goals.goalSetCalculator.confirmButton")}</Text>
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
    gap: 16,
  },
  infoBlock: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    gap: 6,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: "#4B5563",
  },
  infoValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
    textAlign: "right",
  },
  infoError: {
    fontSize: 12,
    color: "#DC2626",
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  segment: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    overflow: "hidden",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  segmentButtonActive: {
    backgroundColor: "#2563EB",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  resultBlock: {
    alignItems: "center",
    padding: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    gap: 4,
  },
  resultBlockWarning: {
    borderColor: "#FDE047",
    backgroundColor: "#FEFCE8",
  },
  resultLabel: {
    fontSize: 13,
    color: "#4B5563",
  },
  resultValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  resultDescription: {
    fontSize: 12,
    color: "#6B7280",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  warningText: {
    fontSize: 12,
    color: "#A16207",
  },
  errorBlock: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
    gap: 2,
  },
  errorBlockText: {
    fontSize: 13,
    color: "#B91C1C",
  },
  calculating: {
    textAlign: "center",
    fontSize: 13,
    color: "#6B7280",
  },
  description: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    gap: 8,
  },
  descriptionText: {
    fontSize: 12,
    color: "#4B5563",
  },
  descriptionNote: {
    fontSize: 12,
    color: "#6B7280",
  },
  link: {
    color: "#2563EB",
    textDecorationLine: "underline",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  confirmButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#2563EB",
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.5,
  },
});
