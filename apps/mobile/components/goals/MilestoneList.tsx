import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { Milestone } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useMilestoneSummary } from "@/hooks/useMilestoneSummary";

interface MilestoneListProps {
  milestones: Milestone[];
  onEdit: (milestone: Milestone) => void;
  onDelete: (milestone: Milestone) => void;
  /** 手動で完了にする (completed=true) / 未完了に戻す (completed=false) */
  onToggleComplete: (milestone: Milestone, completed: boolean) => void;
  /** 削除中のマイルストーン id (スピナーを出す) */
  deletingMilestoneId?: string | null;
  /** 削除ボタンを押せないか (目標・マイルストーンのいずれかを削除中) */
  deleteDisabled?: boolean;
}

export const MilestoneList: React.FC<MilestoneListProps> = ({
  milestones,
  onEdit,
  onDelete,
  onToggleComplete,
  deletingMilestoneId = null,
  deleteDisabled = false,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const summarize = useMilestoneSummary();

  if (milestones.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t("goals.milestone.empty")}</Text>
        <Text style={styles.emptyDesc}>{t("goals.milestone.emptyDesc")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {milestones.map((milestone) => {
        const achieved = milestone.status === "achieved";
        return (
          <View key={milestone.id} style={[styles.item, achieved && styles.itemAchieved]}>
            {/* 編集・削除はタイトルの行にだけ置き、概要と日付はカードの全幅を使う */}
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{milestone.title}</Text>
                {achieved && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t("goals.milestone.achievedBadge")}</Text>
                  </View>
                )}
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => onEdit(milestone)}
                  hitSlop={8}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("goals.milestone.edit")}
                >
                  <Feather name="edit-2" size={16} color="#2563EB" />
                </Pressable>
                <Pressable
                  onPress={() => onDelete(milestone)}
                  disabled={deleteDisabled}
                  hitSlop={8}
                  style={[styles.iconButton, deleteDisabled && styles.iconButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t("goals.milestone.delete")}
                  accessibilityState={{
                    disabled: deleteDisabled,
                    busy: deletingMilestoneId === milestone.id,
                  }}
                >
                  {deletingMilestoneId === milestone.id ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Feather name="trash-2" size={16} color="#EF4444" />
                  )}
                </Pressable>
              </View>
            </View>
            {/* その他タイプは内容 = タイトルなので、要約文 (= タイトル) を重ねて出さない */}
            {milestone.type !== "other" && (
              <Text style={styles.summary}>{summarize(milestone)}</Text>
            )}
            {(milestone.deadline || (achieved && milestone.achieved_at)) && (
              <View style={styles.metaRow}>
                {milestone.deadline && (
                  <Text style={styles.meta}>
                    {t("goals.milestone.deadlineLabel")} {formatDate(milestone.deadline, "long", locale)}
                  </Text>
                )}
                {achieved && milestone.achieved_at && (
                  <Text style={styles.achievedMeta}>
                    {t("goals.milestone.achievedDateLabel")}{" "}
                    {formatDate(milestone.achieved_at, "long", locale)}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.footer}>
              {achieved ? (
                <Pressable
                  onPress={() => onToggleComplete(milestone, false)}
                  hitSlop={6}
                  style={styles.reopenButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("goals.milestone.markIncomplete")}
                >
                  <Feather name="rotate-ccw" size={13} color="#6B7280" />
                  <Text style={styles.reopenButtonText}>{t("goals.milestone.markIncomplete")}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => onToggleComplete(milestone, true)}
                  hitSlop={6}
                  style={styles.completeButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("goals.milestone.markComplete")}
                >
                  <Feather name="check" size={14} color="#16A34A" />
                  <Text style={styles.completeButtonText}>{t("goals.milestone.markComplete")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyDesc: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  item: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  itemAchieved: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flex: 1,
    // 1行目をアイコン (タップ領域 28pt) の中心に揃える
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#DCFCE7",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  summary: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  metaRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 2,
  },
  meta: {
    fontSize: 12,
    color: "#6B7280",
  },
  achievedMeta: {
    fontSize: 12,
    color: "#16A34A",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 6,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  footer: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#86EFAC",
    backgroundColor: "#FFFFFF",
  },
  completeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },
  reopenButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  reopenButtonText: {
    fontSize: 12,
    color: "#6B7280",
  },
});
