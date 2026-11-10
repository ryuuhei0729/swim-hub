import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { formatDate } from "@apps/shared/utils/date";
import { formatTimeBest } from "@apps/shared/utils/time";
import {
  buildNextCompetitionRows,
  daysUntilCompetition,
  entryStatusOn,
  formatNextCompetitionEvent,
  resolveNextCompetitionState,
  type NextCompetitionRow,
} from "@apps/shared/utils/dashboardNextCompetition";
import { useNextCompetitionQuery } from "@apps/shared/hooks/queries/dashboard";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { useAuth } from "@/contexts/AuthProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import { cardSurface } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

interface NextCompetitionCardProps {
  hasTeams: boolean;
  /** カード上部 (見出し・大会名・日数) を押したとき、その大会日の詳細を開く */
  onOpenDay: (date: string) => void;
}

/**
 * ホームの「次の大会」。
 * 状態は none (予定なし) / noEntries (エントリー未登録) / entries (エントリーあり) の3つで、
 * entries のときは種目ごとにベストと目標までの差を出す。目標が無い種目は「＋ 目標」に置き換え、
 * 押すとその大会・種目を選んだ状態で目標フォームを開く。
 */
export const NextCompetitionCard: React.FC<NextCompetitionCardProps> = ({ hasTeams, onOpenDay }) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, isLoading, isError } = useNextCompetitionQuery(supabase, user?.id);
  const { data: bestTimes = [] } = useBestTimesQuery(supabase, { userId: user?.id });

  const rows = useMemo<NextCompetitionRow[]>(
    () =>
      data
        ? buildNextCompetitionRows(data.entries, data.goals, bestTimes, data.competition.pool_type)
        : [],
    [data, bestTimes],
  );

  if (isLoading) {
    return (
      <View style={[styles.card, styles.loading]} testID="next-competition-loading">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>{t("dashboard.nextCompetition.title")}</Text>
        <Text style={styles.errorText}>{t("dashboard.nextCompetition.loadError")}</Text>
      </View>
    );
  }

  const state = resolveNextCompetitionState(data?.competition ?? null, data?.entries.length ?? 0);

  if (state === "none" || !data) {
    return (
      <View style={styles.card} testID="next-competition-none">
        <Text style={styles.kicker}>{t("dashboard.nextCompetition.title")}</Text>
        <View style={styles.none}>
          <View style={styles.noneIcon}>
            <Feather name="award" size={20} color="#9CA3AF" />
          </View>
          <Text style={styles.noneTitle}>{t("dashboard.nextCompetition.noneTitle")}</Text>
          <Text style={styles.noneDescription}>
            {t("dashboard.nextCompetition.noneDescription")}
          </Text>
          <Pressable
            style={styles.primaryButton}
            accessibilityRole="button"
            onPress={() => navigation.navigate("CompetitionTabForm", { date: today })}
          >
            <Text style={styles.primaryButtonText}>
              {t("dashboard.nextCompetition.addCompetition")}
            </Text>
          </Pressable>
          {hasTeams && (
            <Pressable
              style={styles.secondaryButton}
              accessibilityRole="button"
              onPress={() => navigation.navigate("MainTabs", { screen: "Teams" })}
            >
              <Text style={styles.secondaryButtonText}>
                {t("dashboard.nextCompetition.viewTeamCompetitions")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const { competition } = data;
  const days = daysUntilCompetition(competition.date, today);
  const isOngoing = competition.date < today;
  const poolLabel =
    competition.pool_type === 1 ? t("common.poolTypeLong") : t("common.poolTypeShort");
  const isTeamCompetition = !!competition.team_id;
  const entryStatus = entryStatusOn(competition.date, competition.entry_status, today);
  const openEntry = () =>
    navigation.navigate("CompetitionTabForm", {
      competitionId: competition.id,
      date: competition.date,
      initialTab: "entry",
    });

  return (
    // カードのどこを押しても、その大会日の詳細 (カレンダーの日付を押したときと同じモーダル) を開く。
    // 中の「＋ 目標」「エントリーする」は自分の Pressable が押下を受け取るので、詳細は開かない。
    // accessible={false}: カード全体を1つの読み上げ要素にすると、中のボタンが VoiceOver から
    // 個別に選べなくなる (iOS は accessible な要素の子を読み上げツリーから外す) ため
    <Pressable
      style={styles.card}
      testID={`next-competition-${state}`}
      onPress={() => onOpenDay(competition.date)}
      accessible={false}
    >
      <View style={styles.top}>
        <View style={styles.topText}>
          {/* 「次の大会（YYYY/MM/DD）」「大会名」「場所（水路）」の3行 (2026-11-07 ユーザー指定) */}
          <Text style={styles.kicker}>
            {t("dashboard.nextCompetition.titleWithDate", {
              date: formatDate(competition.date, "numeric", locale),
            })}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {competition.title ?? ""}
          </Text>
          <Text style={styles.place} numberOfLines={1}>
            {competition.place
              ? t("dashboard.nextCompetition.placeWithPool", {
                  place: competition.place,
                  pool: poolLabel,
                })
              : poolLabel}
          </Text>
        </View>
        <View style={styles.countdown}>
          {isOngoing || days === 0 ? (
            <Text style={styles.countdownWord}>
              {isOngoing ? t("dashboard.nextCompetition.ongoing") : t("dashboard.nextCompetition.today")}
            </Text>
          ) : (
            <>
              <Text style={styles.countdownNumber}>{days}</Text>
              <Text style={styles.countdownUnit}>{t("dashboard.nextCompetition.daysLater")}</Text>
            </>
          )}
        </View>
      </View>

      {state === "noEntries" ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("dashboard.nextCompetition.noEntriesTitle")}</Text>
          <Text style={styles.emptySub}>
            {!isTeamCompetition
              ? t("dashboard.nextCompetition.personalNoEntries")
              : entryStatus === "open"
                ? t("dashboard.nextCompetition.entryOpen")
                : t("dashboard.nextCompetition.entryBefore")}
          </Text>
          {(!isTeamCompetition || entryStatus === "open") && (
            <Pressable style={styles.primaryButton} accessibilityRole="button" onPress={openEntry}>
              <Text style={styles.primaryButtonText}>
                {isTeamCompetition
                  ? t("dashboard.nextCompetition.enter")
                  : t("dashboard.nextCompetition.registerEvents")}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          {rows.map((row) => (
            <View key={row.entryId} style={styles.row}>
              <View style={styles.rowEvent}>
                <Text style={styles.rowEventText}>{formatNextCompetitionEvent(row.style)}</Text>
                {row.isRelaying && (
                  <Text style={styles.relayBadge}>{t("dashboard.nextCompetition.relay")}</Text>
                )}
                {!row.isRelaying && row.bestTime === null && (
                  <Text style={styles.firstBadge}>{t("dashboard.nextCompetition.firstTime")}</Text>
                )}
              </View>
              {/* ベストが無い種目は「初」を付けるので、「ベスト —」は出さない (2026-11-07 ユーザー指定) */}
              {!row.isRelaying && row.bestTime !== null && (
                <Text style={styles.rowBest}>
                  {t("dashboard.nextCompetition.best", { time: formatTimeBest(row.bestTime) })}
                </Text>
              )}
              <View style={styles.rowGoal}>
                {row.isRelaying ? (
                  <Text style={styles.rowMuted}>—</Text>
                ) : row.targetTime === null ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      // 開催中の複数日大会は目標フォームの大会一覧 (今日以降) に無く、
                      // 選んでおくと画面に出ないまま保存されるので、種目だけを渡す
                      navigation.navigate("GoalForm", {
                        ...(isOngoing ? {} : { competitionId: competition.id }),
                        styleId: row.styleId,
                      })
                    }
                    hitSlop={8}
                  >
                    <Text style={styles.setGoal}>{t("dashboard.nextCompetition.setGoalShort")}</Text>
                  </Pressable>
                ) : (
                  <TargetLabel
                    gap={row.gapToTarget}
                    targetTime={row.targetTime}
                    goalId={row.goalId}
                    onOpenGoal={(goalId) => navigation.navigate("GoalDetail", { goalId })}
                  />
                )}
              </View>
            </View>
          ))}
        </>
      )}
    </Pressable>
  );
};

/**
 * 目標の欄。目標タイムをラベルで出し、押すとその目標の詳細を開く (2026-11-07 ユーザー指定)。
 * 色: ベストが目標に届いていなければ橙、届いていれば緑、ベストが無ければ灰
 */
const TargetLabel: React.FC<{
  gap: number | null;
  targetTime: number;
  goalId: string | null;
  onOpenGoal: (goalId: string) => void;
}> = ({ gap, targetTime, goalId, onOpenGoal }) => {
  const { t } = useTranslation();
  const time = formatTimeBest(targetTime);
  const tone =
    gap === null ? styles.targetNeutral : gap >= 0 ? styles.targetReached : styles.targetNotReached;
  const textTone =
    gap === null
      ? styles.targetNeutralText
      : gap >= 0
        ? styles.targetReachedText
        : styles.targetNotReachedText;
  return (
    <Pressable
      style={[styles.targetLabel, tone]}
      onPress={goalId ? () => onOpenGoal(goalId) : undefined}
      disabled={!goalId}
      accessibilityRole="button"
      accessibilityLabel={t("dashboard.nextCompetition.openGoal", { time })}
      hitSlop={6}
      testID="next-competition-target"
    >
      <Text style={[styles.targetLabelText, textTone]} numberOfLines={1}>
        {t("dashboard.nextCompetition.target")} {time}
      </Text>
      {goalId && <Feather name="chevron-right" size={12} style={textTone} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
  },
  loading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: "#DC2626",
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  topText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 1,
  },
  place: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 1,
  },
  countdown: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: "center",
    minWidth: 52,
  },
  countdownNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1D4ED8",
    lineHeight: 28,
  },
  countdownUnit: {
    fontSize: 10,
    color: "#1D4ED8",
  },
  countdownWord: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1D4ED8",
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  rowEvent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowEventText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  firstBadge: {
    fontSize: 10,
    color: "#4B5563",
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  relayBadge: {
    fontSize: 10,
    color: "#4338CA",
    backgroundColor: "#EEF2FF",
    borderRadius: 999,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  rowBest: {
    fontSize: 12,
    color: "#4B5563",
    fontVariant: ["tabular-nums"],
  },
  rowGoal: {
    width: 120,
    alignItems: "flex-end",
  },
  targetLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 3,
  },
  targetLabelText: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  targetNeutral: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
  targetNeutralText: {
    color: "#374151",
  },
  targetNotReached: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  targetNotReachedText: {
    color: "#B45309",
  },
  targetReached: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  targetReachedText: {
    color: "#047857",
  },
  rowMuted: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  setGoal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  empty: {
    marginTop: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
    padding: 14,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  emptySub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 10,
    textAlign: "center",
  },
  none: {
    alignItems: "center",
    paddingTop: 6,
  },
  noneIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  noneTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  noneDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 12,
    textAlign: "center",
  },
  primaryButton: {
    alignSelf: "stretch",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  secondaryButton: {
    alignSelf: "stretch",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
  },
});
