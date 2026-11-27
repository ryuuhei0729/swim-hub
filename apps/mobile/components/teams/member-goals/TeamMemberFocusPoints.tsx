import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import { cardSurface, colors } from "@/constants/theme";
import { useTeamMemberFocusPointsQuery } from "@apps/shared/hooks/queries/teamMemberFocusPoints";
import { formatDate } from "@apps/shared/utils/date";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";

interface TeamMemberFocusPointsProps {
  teamId: string;
  memberId: string;
}

/**
 * 管理者ビューの「目標」で、選んだメンバーのフォーカスポイント (読み取り専用)。
 * 取り組み中を番号付きで並べ、身についたものは折りたたんで出す。
 * 大会目標・マイルストーンとは別のクエリなので、こちらだけ失敗しても目標は見られる
 */
export const TeamMemberFocusPoints: React.FC<TeamMemberFocusPointsProps> = ({
  teamId,
  memberId,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const locale = useDateLocale();
  const query = useTeamMemberFocusPointsQuery(supabase, teamId, memberId);
  const [isMasteredOpen, setIsMasteredOpen] = useState(false);

  const points = query.data ?? [];
  const active = points.filter((p) => p.status === "active");
  const mastered = points.filter((p) => p.status === "mastered");

  const renderBody = () => {
    if (query.isPending) {
      return <ActivityIndicator color={colors.primary} style={styles.loading} />;
    }
    if (query.isError) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {toUserFacingMessage(query.error, t("teamMemberGoals.focusPoints.loadError"))}
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => void query.refetch()}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>{t("teamMemberGoals.retry")}</Text>
          </Pressable>
        </View>
      );
    }
    if (points.length === 0) {
      return <Text style={styles.empty}>{t("teamMemberGoals.focusPoints.empty")}</Text>;
    }
    return (
      <>
        {active.map((point, index) => (
          <View key={point.id} style={[styles.row, index > 0 && styles.rowDivider]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{index + 1}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{point.title}</Text>
              {point.note ? <Text style={styles.rowNote}>{point.note}</Text> : null}
            </View>
          </View>
        ))}
        {mastered.length > 0 && (
          <View style={styles.mastered}>
            <Pressable
              style={styles.masteredToggle}
              onPress={() => setIsMasteredOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={t("teamMemberGoals.focusPoints.masteredTitle", {
                count: mastered.length,
              })}
              accessibilityState={{ expanded: isMasteredOpen }}
            >
              <Text style={styles.masteredToggleText}>
                {t("teamMemberGoals.focusPoints.masteredTitle", { count: mastered.length })}
              </Text>
              <Feather
                name={isMasteredOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
            {isMasteredOpen &&
              mastered.map((point) => (
                <View key={point.id} style={styles.masteredRow}>
                  <Text style={styles.masteredTitle}>{point.title}</Text>
                  <Text style={styles.masteredDate}>
                    {t("teamMemberGoals.focusPoints.masteredOn", {
                      date: formatDate(point.mastered_at, "numeric", locale),
                    })}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </>
    );
  };

  return (
    <View style={styles.card} testID="team-member-focus-points">
      <View style={styles.header}>
        <Text style={styles.title}>{t("teamMemberGoals.focusPoints.title")}</Text>
        {query.isSuccess && active.length > 0 && (
          <Text style={styles.count}>
            {t("teamMemberGoals.focusPoints.activeCount", { count: active.length })}
          </Text>
        )}
      </View>
      {renderBody()}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  count: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  loading: {
    marginVertical: 12,
  },
  empty: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textSecondary,
  },
  errorBox: {
    marginTop: 8,
    gap: 8,
    alignItems: "flex-start",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
  },
  retryButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  badge: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  rowNote: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  mastered: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  masteredToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  masteredToggleText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  masteredRow: {
    paddingVertical: 8,
  },
  masteredTitle: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  masteredDate: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
