import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { TeamMemberMilestone } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { MILESTONE_STATUS_DISPLAY } from "@apps/shared/utils/goalStatusDisplay";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useMilestoneSummary } from "@/hooks/useMilestoneSummary";
import { TONE_COLORS } from "./statusTone";

interface TeamMemberMilestoneListProps {
  milestones: readonly TeamMemberMilestone[];
}

/** 管理者がメンバーのマイルストーンを閲覧するための読み取り専用一覧 (編集・削除なし) */
export const TeamMemberMilestoneList: React.FC<TeamMemberMilestoneListProps> = ({ milestones }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const summarize = useMilestoneSummary();

  if (milestones.length === 0) {
    return <Text style={styles.empty}>{t("goals.milestone.empty")}</Text>;
  }

  return (
    <View style={styles.list}>
      {milestones.map((milestone) => {
        const display = MILESTONE_STATUS_DISPLAY[milestone.status];
        const colors = TONE_COLORS[display.tone];
        return (
          <View key={milestone.id} style={styles.item}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{milestone.title}</Text>
              <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                <Text style={[styles.badgeText, { color: colors.fg }]}>
                  {t(`teamMemberGoals.${display.labelKey}`)}
                </Text>
              </View>
            </View>
            <Text style={styles.summary}>{summarize(milestone)}</Text>
            {milestone.deadline && (
              <Text style={styles.meta}>
                {t("goals.milestone.deadlineLabel")} {formatDate(milestone.deadline, "long", locale)}
              </Text>
            )}
            {milestone.status === "achieved" && milestone.achieved_at && (
              <Text style={styles.meta}>
                {t("goals.milestone.achievedDateLabel")}{" "}
                {formatDate(milestone.achieved_at, "long", locale)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: 8 },
  empty: { fontSize: 13, color: "#6B7280" },
  item: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111827" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  summary: { fontSize: 13, color: "#4B5563" },
  meta: { fontSize: 12, color: "#6B7280" },
});
