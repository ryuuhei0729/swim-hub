"use client";

import React, { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ArrowLongLeftIcon } from "@heroicons/react/24/outline";
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import { useAuth } from "@/contexts";
import { formatTimeBest } from "@/utils/formatters";
import { toISODateString } from "@apps/shared/utils/date";
import { useGoalCurrentBestTimeQuery } from "@apps/shared/hooks/queries/goals";

// サーバー描画される場合に備え、サーバー (UTC) とブラウザで「今日」の日付がずれる時間帯の
// ハイドレーション不一致を避ける。サーバー描画では残り日数を出さず、ハイドレーション後にブラウザの日付で出す
const subscribeNothing = () => () => {};
const getBrowserToday = () => toISODateString(new Date());
const getServerToday = () => null;

/**
 * 大会までの残り日数 (「あと12日」「本日」「終了」)。大会日が無い・不正なら null。
 * 複数日開催 (endDate あり) は開始日から終了日まで「本日」
 */
function useCompetitionCountdown(
  date: string | null | undefined,
  endDate: string | null | undefined,
): { label: string; past: boolean } | null {
  const t = useTranslations("goals");
  const today = useSyncExternalStore(subscribeNothing, getBrowserToday, getServerToday);
  if (!today || !date) return null;
  const startDay = parseISO(date);
  if (!isValid(startDay)) return null;
  const parsedEnd = endDate ? parseISO(endDate) : null;
  const lastDay = parsedEnd && isValid(parsedEnd) ? parsedEnd : startDay;

  const todayDay = parseISO(today);
  const daysToStart = differenceInCalendarDays(startDay, todayDay);
  if (daysToStart > 0) return { label: t("detail.daysLeft", { days: daysToStart }), past: false };
  if (differenceInCalendarDays(lastDay, todayDay) >= 0) {
    return { label: t("detail.competitionToday"), past: false };
  }
  return { label: t("detail.competitionFinished"), past: true };
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
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const { data: currentBestTime } = useGoalCurrentBestTimeQuery(supabase, goalId);

  if (competitionUnavailable || currentBestTime === undefined) {
    return { current: "—", remaining: null, reached: false };
  }
  if (currentBestTime === null) {
    return { current: t("detail.noRecord"), remaining: null, reached: false };
  }

  const diff = currentBestTime - targetTime;
  const reached = diff <= 0;
  return {
    current: formatTimeBest(currentBestTime),
    remaining: reached
      ? t("detail.targetReached")
      : t("detail.remainingSeconds", { seconds: diff.toFixed(2) }),
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
 * 主役は目標タイムなので、Before は小さく控えめにする
 */
export default function GoalBeforeAfter({
  goalId,
  targetTime,
  competitionDate,
  competitionEndDate,
  competitionUnavailable,
}: GoalBeforeAfterProps) {
  const t = useTranslations("goals");
  const countdown = useCompetitionCountdown(competitionDate, competitionEndDate);
  const { current, remaining, reached } = useCurrentBestLabels(
    goalId,
    targetTime,
    competitionUnavailable,
  );

  // 3つとも中身の幅で左詰めに並べる。狭い幅 (長いタイム・de の長いラベル) で並び切らないときは折り返す
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 sm:gap-x-4">
      <div
        data-testid="goal-after"
        className="shrink-0"
      >
        <p className="text-blue-700 text-xs sm:text-sm">{t("detail.targetTime")}</p>
        <p className="font-bold text-blue-700 tabular-nums whitespace-nowrap text-2xl sm:text-3xl">
          {formatTimeBest(targetTime)}
        </p>
      </div>

      <div
        data-testid="goal-before-after-gap"
        className="min-w-min px-1 sm:px-2 flex flex-col items-center text-center font-semibold text-xs sm:text-sm"
      >
        {countdown && (
          <span className={countdown.past ? "text-gray-500" : "text-blue-600"}>
            {countdown.label}
          </span>
        )}
        <ArrowLongLeftIcon className="text-gray-400 w-10 h-6 sm:w-14 sm:h-7" aria-hidden="true" />
        {remaining && (
          <span className={reached ? "text-green-600" : "text-blue-600"}>{remaining}</span>
        )}
      </div>

      <div
        data-testid="goal-before"
        className="shrink-0"
      >
        <p className="text-gray-400 text-[11px] sm:text-xs">{t("detail.currentBest")}</p>
        <p className="font-semibold text-gray-600 tabular-nums whitespace-nowrap text-base sm:text-lg">
          {current}
        </p>
      </div>
    </div>
  );
}
