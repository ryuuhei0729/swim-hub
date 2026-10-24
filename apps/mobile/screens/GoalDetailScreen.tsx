import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, StyleSheet, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { GoalBeforeAfter } from "@/components/goals/GoalBeforeAfter";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { MilestoneList } from "@/components/goals/MilestoneList";
import { useDateLocale } from "@/hooks/useDateLocale";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { localizedStyleName } from "@/utils/styleName";
import type { MainStackParamList } from "@/navigation/types";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys, useGoalDetailQuery } from "@apps/shared/hooks/queries/goals";
import type { Milestone } from "@apps/shared/types";
import { computeMilestoneRatio } from "@apps/shared/utils/milestoneRatio";
import { formatDate } from "@apps/shared/utils/date";

type NavProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, "GoalDetail">;

/**
 * 目標詳細。目標タイムと現在のベスト・マイルストーン達成率とマイルストーン一覧を表示し、
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

  // 現在のベスト (GoalBeforeAfter) も取り直す。別端末で記録が増えた場合に引っ張って更新で反映する
  const refresh = useCallback(
    () =>
      Promise.allSettled([
        goalQuery.refetch(),
        queryClient.refetchQueries({ queryKey: goalKeys.currentBestTime(goalId) }),
      ]),
    [goalQuery, queryClient, goalId],
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
  const milestoneRatio = computeMilestoneRatio(goal.milestones);

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
        <View>
          {/* 1行目に大会日、2行目に大会名 (水路)。編集・削除は右上のアイコン */}
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              {competition?.date ? (
                <Text style={styles.metaDate}>{formatDate(competition.date, "numeric", locale)}</Text>
              ) : null}
              {/* 大会名が長いときは … で省略する (水路は縮めない) */}
              <View style={styles.metaRow}>
                <Text style={styles.metaTitle} numberOfLines={1}>
                  {competitionTitle}
                </Text>
                {competition && (
                  <Text style={styles.metaPool}>
                    ({competition.pool_type === 1 ? t("common.poolTypeLong") : t("common.poolTypeShort")})
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.headerActions}>
              {!competitionUnavailable && (
                <Pressable
                  onPress={() => navigation.navigate("GoalForm", { goalId })}
                  hitSlop={8}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel={t("goals.list.edit")}
                >
                  <Feather name="edit-2" size={18} color="#6B7280" />
                </Pressable>
              )}
              <Pressable
                onPress={handleDeleteGoal}
                hitSlop={8}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={t("goals.list.delete")}
              >
                <Feather name="trash-2" size={18} color="#6B7280" />
              </Pressable>
            </View>
          </View>

          {/* 種目名 → 目標タイム ← 現在のベスト を横並び。狭いときはタイムの並びが種目名の下に回る */}
          <View style={styles.headlineRow}>
            <Text style={styles.styleHeading} accessibilityRole="header">
              {styleName}
            </Text>
            <GoalBeforeAfter
              goalId={goal.id}
              targetTime={goal.target_time}
              competitionDate={competition?.date}
              competitionEndDate={competition?.end_date}
              competitionUnavailable={competitionUnavailable}
            />
          </View>

          {/* 大会情報が無い目標は編集できない理由を明示する */}
          {competitionUnavailable && (
            <Text style={styles.unavailable}>{t("goals.list.editUnavailableReason")}</Text>
          )}
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
            <Text style={styles.label}>
              {milestoneRatio === null ? t("goals.detail.notSet") : `${milestoneRatio.toFixed(0)}%`}
            </Text>
          </View>
          {milestoneRatio !== null && <GoalProgressBar progress={milestoneRatio} />}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    fontVariant: ["tabular-nums"],
  },
  metaTitle: {
    flexShrink: 1,
    fontSize: 14,
    color: "#6B7280",
  },
  metaPool: {
    fontSize: 14,
    color: "#6B7280",
  },
  headlineRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    columnGap: 24,
    rowGap: 8,
  },
  styleHeading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  unavailable: {
    marginTop: 4,
    fontSize: 12,
    color: "#D97706",
  },
  label: {
    fontSize: 13,
    color: "#4B5563",
  },
  progressBlock: {
    gap: 6,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
