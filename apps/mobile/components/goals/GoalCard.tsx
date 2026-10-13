import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatTimeBest } from "@apps/shared/utils/time";
import { GoalProgressBar } from "./GoalProgressBar";

interface GoalCardProps {
  /** null = 大会情報なし (個人大会削除・チーム退会)。判定は === null の1本 */
  competitionTitle: string | null | undefined;
  competitionUnavailable: boolean;
  styleName: string;
  targetTime: number;
  achieved: boolean;
  /** undefined = 計算中、null = 計算不能 (水路が分からない) */
  progress: number | null | undefined;
  onPress: () => void;
  /** 大会情報なしの目標では渡さない (編集導線を出さない) */
  onEdit?: () => void;
  onDelete: () => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  competitionTitle,
  competitionUnavailable,
  styleName,
  targetTime,
  achieved,
  progress,
  onPress,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const title = competitionUnavailable
    ? t("goals.list.competitionInfoUnavailable")
    : competitionTitle || t("goals.list.competitionFallback");

  return (
    <Pressable
      style={[styles.card, achieved && styles.cardAchieved]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} ${styleName}`}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {achieved && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("goals.list.achievedBadge")}</Text>
              </View>
            )}
          </View>
          <Text style={styles.style}>{styleName}</Text>
          {competitionUnavailable && (
            <Text style={styles.unavailable}>{t("goals.list.editUnavailableReason")}</Text>
          )}
        </View>
        <View style={styles.actions}>
          {onEdit && (
            <Pressable
              onPress={onEdit}
              hitSlop={8}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={t("goals.list.edit")}
            >
              <Feather name="edit-2" size={16} color="#6B7280" />
            </Pressable>
          )}
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t("goals.list.delete")}
          >
            <Feather name="trash-2" size={16} color="#6B7280" />
          </Pressable>
        </View>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            {t("goals.list.targetTimePrefix")} {formatTimeBest(targetTime)}
          </Text>
          <Text style={styles.progressText}>
            {progress === undefined
              ? ""
              : progress !== null
                ? `${progress.toFixed(0)}%`
                : t("goals.detail.notSet")}
          </Text>
        </View>
        {progress != null && <GoalProgressBar progress={progress} />}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardAchieved: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
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
  style: {
    marginTop: 4,
    fontSize: 13,
    color: "#4B5563",
  },
  unavailable: {
    marginTop: 4,
    fontSize: 11,
    color: "#D97706",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 6,
  },
  progressBlock: {
    marginTop: 12,
    gap: 6,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressText: {
    fontSize: 12,
    color: "#4B5563",
  },
});
