import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { TeamMemberGoal } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { GOAL_STATUS_DISPLAY } from "@apps/shared/utils/goalStatusDisplay";
import { computeMilestoneRatio } from "@apps/shared/utils/milestoneRatio";
import { formatSignedSeconds } from "@apps/shared/utils/time";
import { useDateLocale } from "@/hooks/useDateLocale";
import { formatTime } from "@/utils/formatters";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { TeamMemberMilestoneList } from "./TeamMemberMilestoneList";
import { TONE_COLORS } from "./statusTone";

interface TeamMemberGoalCardProps {
  goal: TeamMemberGoal;
  styleName: string;
}

export const TeamMemberGoalCard: React.FC<TeamMemberGoalCardProps> = ({ goal, styleName }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const display = GOAL_STATUS_DISPLAY[goal.status];
  const colors = TONE_COLORS[display.tone];

  const milestoneRatio = computeMilestoneRatio(goal.milestones);
  const hasCompetition = goal.competition_id !== null;
  const title = hasCompetition
    ? goal.competition_title || t("goals.list.competitionFallback")
    : t("goals.list.competitionInfoUnavailable");

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.fg }]}>
            {t(`teamMemberGoals.${display.labelKey}`)}
          </Text>
        </View>
      </View>
      <Text style={styles.sub}>{styleName}</Text>
      {hasCompetition && (
        <Text style={styles.sub}>
          {t("goals.goalReflection.competitionDateLabel")}{" "}
          {formatDate(goal.competition_date, "long", locale)}
          {goal.competition_pool_type !== null &&
            ` | ${
              goal.competition_pool_type === 1 ? t("common.poolTypeLong") : t("common.poolTypeShort")
            }`}
        </Text>
      )}

      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <Text style={styles.label}>{t("goals.detail.targetTime")}</Text>
          <View style={styles.targetRow}>
            <Text style={styles.value}>{formatTime(goal.target_time)}</Text>
            {goal.current_best_time !== null && (
              <Text style={styles.diff}>
                {t("goals.list.diffFromBest", {
                  diff: formatSignedSeconds(goal.target_time - goal.current_best_time),
                })}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <Text style={styles.label}>{t("goals.detail.milestoneRatio")}</Text>
          <Text style={styles.value}>
            {milestoneRatio === null ? t("goals.detail.notSet") : `${milestoneRatio.toFixed(0)}%`}
          </Text>
        </View>
        {milestoneRatio !== null && <GoalProgressBar progress={milestoneRatio} />}
      </View>

      {goal.status === "achieved" && goal.achieved_at && (
        <Text style={styles.achievedAt}>
          {t("goals.milestone.achievedDateLabel")} {formatDate(goal.achieved_at, "long", locale)}
        </Text>
      )}

      <View style={styles.milestones}>
        <Text style={styles.sectionLabel}>{t("goals.detail.milestoneSection")}</Text>
        <TeamMemberMilestoneList milestones={goal.milestones} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  sub: { fontSize: 13, color: "#4B5563" },
  timeRow: { flexDirection: "row", gap: 16, marginTop: 6 },
  timeCol: { flex: 1 },
  label: { fontSize: 12, color: "#6B7280" },
  value: { fontSize: 15, fontWeight: "600", color: "#111827" },
  progressBlock: { marginTop: 6, gap: 6 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  targetRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  diff: { fontSize: 12, color: "#6B7280" },
  achievedAt: { fontSize: 12, color: "#16A34A", marginTop: 4 },
  milestones: { marginTop: 10, gap: 6 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
});
