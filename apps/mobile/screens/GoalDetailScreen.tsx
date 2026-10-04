import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, StyleSheet, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { MilestoneList } from "@/components/goals/MilestoneList";
import { useDateLocale } from "@/hooks/useDateLocale";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { goalProgressQuery } from "@/hooks/useGoalProgress";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { localizedStyleName } from "@/utils/styleName";
import type { MainStackParamList } from "@/navigation/types";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys, useGoalDetailQuery } from "@apps/shared/hooks/queries/goals";
import type { Milestone } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { formatTimeBest } from "@apps/shared/utils/time";

type NavProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, "GoalDetail">;

/**
 * 目標詳細。目標タイム・初期タイム・達成率とマイルストーン一覧を表示し、
 * 目標の編集・削除、マイルストーンの追加・編集・削除への導線を持つ。
 */
export const GoalDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { goalId } = useRoute<RouteProps>().params;
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const locale = useDateLocale();
  const insets = useSafeInsets();
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const busyRef = useRef(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const goalQuery = useGoalDetailQuery(supabase, goalId);
  const goal = goalQuery.data;
  const progressQuery = useQuery(goalProgressQuery(goalAPI, goalId));

  const refresh = useCallback(
    () => Promise.allSettled([goalQuery.refetch(), progressQuery.refetch()]),
    [goalQuery, progressQuery],
  );
  const { refreshing, handleRefresh } = usePullToRefresh(refresh);

  const handleDeleteGoal = useCallback(() => {
    Alert.alert(t("goals.list.delete"), t("goals.list.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          try {
            await goalAPI.deleteGoal(goalId);
            // 削除後の再取得で「見つかりません」が一瞬出ないよう、先に描画をローディングへ固定してから戻る
            setIsDeleted(true);
            navigation.goBack();
            void queryClient.invalidateQueries({ queryKey: goalKeys.all });
          } catch (error) {
            console.error("Failed to delete goal:", error);
            Alert.alert(t("common.alertErrorTitle"), t("goals.list.deleteFailed"));
          } finally {
            busyRef.current = false;
          }
        },
      },
    ]);
  }, [goalAPI, goalId, navigation, queryClient, t]);

  const handleDeleteMilestone = useCallback(
    (milestone: Milestone) => {
      Alert.alert(t("goals.milestone.delete"), t("goals.milestone.deleteConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            if (busyRef.current) return;
            busyRef.current = true;
            try {
              await goalAPI.deleteMilestone(milestone.id);
              await queryClient.invalidateQueries({ queryKey: goalKeys.all });
            } catch (error) {
              console.error("Failed to delete milestone:", error);
              Alert.alert(t("common.alertErrorTitle"), t("goals.milestone.deleteFailed"));
            } finally {
              busyRef.current = false;
            }
          },
        },
      ]);
    },
    [goalAPI, queryClient, t],
  );

  if (isDeleted) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (goalQuery.isError && goal === undefined) {
    return (
      <View style={styles.container}>
        <ErrorView message={t("goals.detail.loadError")} onRetry={() => void goalQuery.refetch()} fullScreen />
      </View>
    );
  }

  if (goal === undefined) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (goal === null) {
    return (
      <View style={styles.container}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>{t("goals.mobile.notFound")}</Text>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>{t("common.back")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // competition は null になりうる (大会削除・チーム退会)。判定は === null の1本
  const competition = goal.competition;
  const competitionUnavailable = competition === null;
  const competitionTitle = competitionUnavailable
    ? t("goals.list.competitionInfoUnavailable")
    : competition.title || t("goals.list.competitionFallback");
  const styleName = goal.style ? localizedStyleName(goal.style, t) : t("goals.list.styleFallback");

  const achievedCount = goal.milestones.filter((m) => m.status === "achieved").length;
  const milestoneRatio =
    goal.milestones.length > 0 ? (achievedCount / goal.milestones.length) * 100 : 0;
  const progress = progressQuery.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: getSafeFooterPadding(24, insets.bottom) }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={["#2563EB"]}
          tintColor="#2563EB"
        />
      }
    >
      <View style={styles.card}>
        <Text style={styles.competitionTitle}>{competitionTitle}</Text>
        <Text style={styles.subtitle}>
          {styleName} | {competitionUnavailable ? t("goals.list.competitionInfoUnavailable") : formatDate(competition.date, "long", locale)}
        </Text>
        {competitionUnavailable && (
          <Text style={styles.unavailable}>{t("goals.list.editUnavailableReason")}</Text>
        )}

        <View style={styles.timeRow}>
          <View style={styles.timeCell}>
            <Text style={styles.label}>{t("goals.detail.targetTime")}</Text>
            <Text style={styles.timeValue}>{formatTimeBest(goal.target_time)}</Text>
          </View>
          <View style={styles.timeCell}>
            <Text style={styles.label}>{t("goals.detail.initialTime")}</Text>
            <Text style={styles.timeValue}>
              {goal.start_time ? formatTimeBest(goal.start_time) : t("goals.detail.notSet")}
            </Text>
          </View>
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <Text style={styles.label}>{t("goals.detail.achievement")}</Text>
            <Text style={styles.label}>
              {progress === undefined
                ? ""
                : progress !== null
                  ? `${progress.toFixed(0)}%`
                  : t("goals.detail.notSet")}
            </Text>
          </View>
          {progress != null && <GoalProgressBar progress={progress} />}
        </View>

        <View style={styles.goalActions}>
          {!competitionUnavailable && (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("GoalForm", { goalId })}
              accessibilityRole="button"
              accessibilityLabel={t("goals.list.edit")}
            >
              <Feather name="edit-2" size={16} color="#374151" />
              <Text style={styles.secondaryButtonText}>{t("goals.list.edit")}</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.dangerButton}
            onPress={handleDeleteGoal}
            accessibilityRole="button"
            accessibilityLabel={t("goals.list.delete")}
          >
            <Feather name="trash-2" size={16} color="#DC2626" />
            <Text style={styles.dangerButtonText}>{t("goals.list.delete")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t("goals.detail.milestoneSection")} ({achievedCount}/{goal.milestones.length})
          </Text>
          <Pressable
            style={styles.addButton}
            onPress={() => navigation.navigate("MilestoneForm", { goalId })}
            accessibilityRole="button"
            accessibilityLabel={t("goals.detail.milestoneAdd")}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.addButtonText}>{t("goals.detail.milestoneAdd")}</Text>
          </Pressable>
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <Text style={styles.label}>{t("goals.detail.milestoneRatio")}</Text>
            <Text style={styles.label}>{milestoneRatio.toFixed(0)}%</Text>
          </View>
          <GoalProgressBar progress={milestoneRatio} />
        </View>

        <MilestoneList
          milestones={goal.milestones}
          onEdit={(milestone) =>
            navigation.navigate("MilestoneForm", { goalId, milestoneId: milestone.id })
          }
          onDelete={handleDeleteMilestone}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  competitionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: -8,
    fontSize: 14,
    color: "#4B5563",
  },
  unavailable: {
    marginTop: -8,
    fontSize: 12,
    color: "#D97706",
  },
  timeRow: {
    flexDirection: "row",
    gap: 16,
  },
  timeCell: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: "#4B5563",
  },
  timeValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  progressBlock: {
    gap: 6,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalActions: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  dangerButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#DC2626",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  notFoundText: {
    fontSize: 16,
    color: "#374151",
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
