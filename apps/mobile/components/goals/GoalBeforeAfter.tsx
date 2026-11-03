import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import { useGoalCurrentBestTimeQuery } from "@apps/shared/hooks/queries/goals";
import { formatTimeBest } from "@apps/shared/utils/time";

/**
 * 大会までの残り日数 (「あと12日」「本日」「終了」)。大会日が無い・不正なら null。
 * 複数日開催 (endDate あり) は開始日から終了日まで「本日」
 */
function useCompetitionCountdown(
  date: string | null | undefined,
  endDate: string | null | undefined,
): { label: string; past: boolean } | null {
  const { t } = useTranslation();
  if (!date) return null;
  const startDay = parseISO(date);
  if (!isValid(startDay)) return null;
  const parsedEnd = endDate ? parseISO(endDate) : null;
  const lastDay = parsedEnd && isValid(parsedEnd) ? parsedEnd : startDay;

  // 暦日で数える (時刻の端数で1日ずれない)
  const today = new Date();
  const daysToStart = differenceInCalendarDays(startDay, today);
  if (daysToStart > 0) return { label: t("goals.detail.daysLeft", { days: daysToStart }), past: false };
  if (differenceInCalendarDays(lastDay, today) >= 0) {
    return { label: t("goals.detail.competitionToday"), past: false };
  }
  return { label: t("goals.detail.competitionFinished"), past: true };
}

/**
 * 「現在のベスト」と目標タイムまでの残り。
 * current: 取得中・取得失敗・大会情報なし (水路が分からない) は「—」、記録なしは noRecord
 * remaining: 現在のベストがあるときだけ「あと0.01秒」/ 目標タイム以下なら targetReached
 */
function useCurrentBestLabels(
  goalId: string,
  targetTime: number,
  competitionUnavailable: boolean,
): { current: string; remaining: string | null; reached: boolean } {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const { data: currentBestTime } = useGoalCurrentBestTimeQuery(supabase, goalId);

  if (competitionUnavailable || currentBestTime === undefined) {
    return { current: "—", remaining: null, reached: false };
  }
  if (currentBestTime === null) {
    return { current: t("goals.detail.noRecord"), remaining: null, reached: false };
  }

  const diff = currentBestTime - targetTime;
  const reached = diff <= 0;
  return {
    current: formatTimeBest(currentBestTime),
    remaining: reached
      ? t("goals.detail.targetReached")
      : t("goals.detail.remainingSeconds", { seconds: diff.toFixed(2) }),
    reached,
  };
}

interface GoalBeforeAfterProps {
  goalId: string;
  targetTime: number;
  competitionDate: string | null | undefined;
  /** 複数日開催の終了日 (単日開催は null) */
  competitionEndDate: string | null | undefined;
  /** goal.competition === null (大会情報なし)。水路が分からないので現在のベストを出さない */
  competitionUnavailable: boolean;
}

/**
 * 左に After (目標タイム)、右に Before (現在のベスト) を置き、Before → After を
 * 左向きの矢印でつなぐ。間に大会までの残り日数・目標までの残り秒数。
 * 主役は目標タイムなので、Before は小さく控えめにする。
 * web の goals/_components/GoalBeforeAfter.tsx の RN 版。
 */
export const GoalBeforeAfter: React.FC<GoalBeforeAfterProps> = ({
  goalId,
  targetTime,
  competitionDate,
  competitionEndDate,
  competitionUnavailable,
}) => {
  const { t } = useTranslation();
  const countdown = useCompetitionCountdown(competitionDate, competitionEndDate);
  const { current, remaining, reached } = useCurrentBestLabels(
    goalId,
    targetTime,
    competitionUnavailable,
  );

  // 3つとも中身の幅で左詰めに並べる。狭い幅 (長いタイム・de の長いラベル) で並び切らないときは折り返す
  return (
    <View style={styles.row}>
      <View testID="goal-after">
        <Text style={styles.afterLabel}>{t("goals.detail.targetTime")}</Text>
        <Text style={styles.afterValue}>{formatTimeBest(targetTime)}</Text>
      </View>

      <View testID="goal-before-after-gap" style={styles.gap}>
        {countdown && (
          <Text style={[styles.gapText, countdown.past ? styles.muted : styles.accent]}>
            {countdown.label}
          </Text>
        )}
        {/* 横長の左向き矢印 (Feather の arrow-left は正方形グリフで横に伸ばせないため View で描く) */}
        <View
          testID="goal-before-after-arrow"
          style={styles.arrow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.arrowHead} />
          <View style={styles.arrowShaft} />
        </View>
        {remaining && (
          <Text style={[styles.gapText, reached ? styles.reached : styles.accent]}>{remaining}</Text>
        )}
      </View>

      <View testID="goal-before">
        <Text style={styles.beforeLabel}>{t("goals.detail.currentBest")}</Text>
        <Text style={styles.beforeValue}>{current}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    columnGap: 12,
    rowGap: 8,
  },
  afterLabel: {
    fontSize: 12,
    color: "#1D4ED8",
  },
  afterValue: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1D4ED8",
    fontVariant: ["tabular-nums"],
  },
  gap: {
    alignItems: "center",
    paddingHorizontal: 4,
  },
  gapText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  // 矢印: 高さ 14 / 幅 56 (以前の Feather size=28 の約半分の縦幅・約2倍の横幅)
  arrow: {
    flexDirection: "row",
    alignItems: "center",
    width: 56,
    height: 14,
    marginVertical: 2,
  },
  // 矢頭: 左辺と下辺に線を引いた正方形を 45° 回して「<」にする (対角線 ≈ 14)
  arrowHead: {
    width: 10,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#9CA3AF",
    transform: [{ rotate: "45deg" }],
    marginRight: -6,
  },
  arrowShaft: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#9CA3AF",
  },
  accent: {
    color: "#2563EB",
  },
  muted: {
    color: "#6B7280",
  },
  reached: {
    color: "#16A34A",
  },
  beforeLabel: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  beforeValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4B5563",
    fontVariant: ["tabular-nums"],
  },
});
