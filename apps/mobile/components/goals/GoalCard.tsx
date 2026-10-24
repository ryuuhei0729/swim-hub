import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useGoalCurrentBestTimeQuery } from "@apps/shared/hooks/queries/goals";
import { formatDate } from "@apps/shared/utils/date";
import { formatSignedSeconds, formatTimeBest } from "@apps/shared/utils/time";

interface GoalCardProps {
  goalId: string;
  /** null = 大会情報なし (個人大会削除・チーム退会)。判定は === null の1本 */
  competitionTitle: string | null | undefined;
  /** 大会日 (yyyy-MM-dd)。大会情報なしは undefined */
  competitionDate: string | null | undefined;
  competitionUnavailable: boolean;
  styleName: string;
  targetTime: number;
  achieved: boolean;
  onPress: () => void;
  /** 大会情報なしの目標では渡さない (編集導線を出さない) */
  onEdit?: () => void;
  onDelete: () => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goalId,
  competitionTitle,
  competitionDate,
  competitionUnavailable,
  styleName,
  targetTime,
  achieved,
  onPress,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const locale = useDateLocale();
  const { data: currentBestTime } = useGoalCurrentBestTimeQuery(supabase, goalId);
  const title = competitionUnavailable
    ? t("goals.list.competitionInfoUnavailable")
    : competitionTitle || t("goals.list.competitionFallback");
  // 目標タイムと現在のベストの差 (Best-0.01)。ベストが分からない (取得中・失敗・記録なし・
  // 大会情報なしで水路が分からない) ときは出さない
  const diffFromBest =
    !competitionUnavailable && currentBestTime != null
      ? t("goals.list.diffFromBest", { diff: formatSignedSeconds(targetTime - currentBestTime) })
      : null;

  return (
    <Pressable
      style={[styles.card, achieved && styles.cardAchieved]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} ${styleName}`}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          {/* 1行に収める。大会名が長いときは … で省略する (日付は縮めない) */}
          <View style={styles.titleRow}>
            {competitionDate ? (
              <Text style={styles.date}>{formatDate(competitionDate, "numeric", locale)}</Text>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
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

      {/* 種目名と並び切らないときは、タイムを右寄せのまま次の行に回す */}
      <View style={styles.styleRow}>
        {/* 達成バッジは種目名の横に置く。並び切らなければバッジの方を次の行に回す */}
        <View style={styles.styleBlock}>
          <Text style={styles.style}>{styleName}</Text>
          {achieved && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t("goals.list.achievedBadge")}</Text>
            </View>
          )}
        </View>
        <View style={styles.timeBlock}>
          <Text style={styles.targetTime}>{formatTimeBest(targetTime)}</Text>
          {diffFromBest && <Text style={styles.diff}>{diffFromBest}</Text>}
        </View>
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
  date: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    fontVariant: ["tabular-nums"],
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    color: "#6B7280",
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
  styleRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: 8,
  },
  styleBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 4,
  },
  style: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D4ED8",
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
  timeBlock: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  targetTime: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1D4ED8",
    fontVariant: ["tabular-nums"],
  },
  diff: {
    fontSize: 12,
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },
});
