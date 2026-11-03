import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { ErrorView } from "@/components/layout/ErrorView";
import { GoalListSkeleton } from "@/components/ui/ScreenSkeletons";
import { PressableScale } from "@/components/ui/PressableScale";
import { ListItemEnter, useListEnterOnce } from "@/components/ui/ListItemEnter";
import { GoalCard } from "@/components/goals/GoalCard";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { localizedStyleName } from "@/utils/styleName";
import { toISODateString } from "@apps/shared/utils/date";
import { selectUpcomingGoals } from "@apps/shared/utils/upcomingGoals";
import type { MainStackParamList } from "@/navigation/types";
import { GoalAPI } from "@apps/shared/api/goals";
import { StyleAPI } from "@apps/shared/api/styles";
import { goalKeys, useGoalsQuery } from "@apps/shared/hooks/queries/goals";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import { runMilestoneJudgment } from "@apps/shared/utils/milestoneJudgment";

type NavProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 目標一覧 (タブのルート画面)。
 * タブにフォーカスが当たるたびに「判定 → goalKeys invalidate → 取得」を1周する。
 * 判定前の一覧を見せないため、初回だけは1周が終わるまで一覧クエリを開始しない。
 */
export const GoalsScreen: React.FC = () => {
  const { supabase, user } = useAuth();
  const queryClient = useQueryClient();
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const userId = user?.id;

  const [firstRoundDone, setFirstRoundDone] = useState(false);
  // 過去日の目標を隠す基準日。1周の開始ごとに取り直す (開いたまま日付が変わっても反映される。
  // 再取得結果が同じだと一覧データの参照が変わらず、フィルタが再計算されないため state で持つ)
  const [today, setToday] = useState(() => toISODateString(new Date()));
  // 判定の並行実行を防ぐ。実行中に focus / pull-to-refresh / 再試行が来たら同じ1周に相乗りする
  const inFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const runRound = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!userId) return Promise.resolve();
    setToday(toISODateString(new Date()));

    const round = (async () => {
      try {
        await runMilestoneJudgment(goalAPI, userId);
        await queryClient.invalidateQueries({ queryKey: goalKeys.all });
      } finally {
        inFlightRef.current = null;
        if (isMountedRef.current) setFirstRoundDone(true);
      }
    })();
    inFlightRef.current = round;
    return round;
  }, [goalAPI, queryClient, userId]);

  useFocusEffect(
    useCallback(() => {
      void runRound();
    }, [runRound]),
  );

  const { refreshing, handleRefresh } = usePullToRefresh(runRound);

  if (!firstRoundDone) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <GoalListSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <GoalsContent
        today={today}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onRetry={runRound}
      />
    </SafeAreaView>
  );
};

interface GoalsContentProps {
  today: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onRetry: () => Promise<void>;
}

const GoalsContent: React.FC<GoalsContentProps> = ({
  today,
  refreshing,
  onRefresh,
  onRetry,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [isRetrying, setIsRetrying] = useState(false);

  // styles は固定マスタなので長めにキャッシュする
  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: () => new StyleAPI(supabase).getStyles(),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const goalsQuery = useGoalsQuery(supabase);
  // 大会が終わった目標は目標タブに出さない (大会情報なしの目標は削除できるよう残す)。
  // 複数日開催は終了日で判定する (開催中の2日目以降も出す)
  const goals = useMemo(
    () => (goalsQuery.data ? selectUpcomingGoals(goalsQuery.data, today) : undefined),
    [goalsQuery.data, today],
  );

  const stylesById = useMemo(
    () => new Map((stylesQuery.data ?? []).map((s) => [s.id, s])),
    [stylesQuery.data],
  );

  // 一覧が初めてデータ付きで出るときだけ、カードを時間差でふわっと出す
  const listEnterEnabled = useListEnterOnce(goals !== undefined && goals.length > 0);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={["#2563EB"]}
      tintColor="#2563EB"
    />
  );

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  if (isRetrying) {
    return <GoalListSkeleton />;
  }

  if (goalsQuery.isError && !goals) {
    return <ErrorView message={t("goals.list.loadError")} onRetry={handleRetry} fullScreen />;
  }

  if (!goals) {
    return <GoalListSkeleton />;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      // iOS 26 の浮いたタブバーの下に末尾が隠れないよう、OS に下端の余白を足させる
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
    >
      {goals.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t("goals.list.empty")}</Text>
          <Text style={styles.emptyText}>{t("goals.list.emptyDesc")}</Text>
        </View>
      ) : (
        goals.map((goal, index) => {
          const style = stylesById.get(goal.style_id);
          return (
            <ListItemEnter key={goal.id} index={index} enabled={listEnterEnabled}>
              <GoalCard
                goalId={goal.id}
                competitionTitle={goal.competition?.title}
                competitionDate={goal.competition?.date}
                competitionUnavailable={goal.competition === null}
                styleName={style ? localizedStyleName(style, t) : t("goals.list.styleFallback")}
                targetTime={goal.target_time}
                achieved={goal.status === "achieved"}
                onPress={() => navigation.navigate("GoalDetail", { goalId: goal.id })}
              />
            </ListItemEnter>
          );
        })
      )}
      <PressableScale
        style={styles.createButton}
        onPress={() => navigation.navigate("GoalForm", {})}
        accessibilityRole="button"
        accessibilityLabel={t("goals.page.createButton")}
      >
        <Feather name="plus" size={18} color="#4B5563" />
        <Text style={styles.createButtonText}>{t("goals.page.createButton")}</Text>
      </PressableScale>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
  },
});
