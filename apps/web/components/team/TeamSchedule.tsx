"use client";

// =============================================================================
// チーム画面「予定」タブ: チーム練習とチーム大会を 1 本の一覧にまとめて表示する
// (mobile の components/teams/TeamScheduleList.tsx と同じ。swimhub-tasks #72)。
//
// 絞り込みは 2 つの独立した条件の組み合わせ:
//   - 種類: 全て / 練習 / 大会 (どれか 1 つ)
//   - 過去: オン/オフのスイッチ。オフは今日以降を日付の近い順、オンは昨日以前を新しい順
// 「今日」は端末のローカル日付 (getScheduleToday)。
//
// 今日以降は mobile と同じく全件を取る。過去は長く使うチームほど増え続けるので、
// 「過去」を開いたときだけ取得し、TEAM_SCHEDULE_PAST_PAGE_SIZE 件ずつ「もっと見る」で読み足す。
//
// カードと各操作 (編集・削除・記録入力・エントリー等) とモーダルは
// TeamPractices.tsx / TeamCompetitions.tsx の useTeam*Actions をそのまま使う。
// =============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CalendarDaysIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthProvider";
import {
  teamPastPracticesInfiniteQueryOptions,
  teamUpcomingPracticesQueryOptions,
} from "@/hooks/queries/teamPracticeQueries";
import {
  teamPastCompetitionsInfiniteQueryOptions,
  teamUpcomingCompetitionsQueryOptions,
} from "@/hooks/queries/teamCompetitionQueries";
import { buildScheduleItems, getScheduleToday, type ScheduleKind } from "@/utils/teamSchedule";
import { useTeamPracticeActions } from "./TeamPractices";
import { useTeamCompetitionActions } from "./TeamCompetitions";

const KINDS = [
  { id: "all", labelKey: "mobile.schedule.filterAll" },
  { id: "practices", labelKey: "mobile.schedule.filterPractices" },
  { id: "competitions", labelKey: "mobile.schedule.filterCompetitions" },
] as const satisfies readonly { id: ScheduleKind; labelKey: string }[];

const EMPTY_KEYS = {
  upcoming: {
    all: "mobile.schedule.emptyUpcoming",
    practices: "mobile.schedule.emptyPractices",
    competitions: "mobile.schedule.emptyCompetitions",
  },
  past: {
    all: "mobile.schedule.emptyPast",
    practices: "mobile.schedule.emptyPastPractices",
    competitions: "mobile.schedule.emptyPastCompetitions",
  },
} as const satisfies Record<"upcoming" | "past", Record<ScheduleKind, string>>;

export interface TeamScheduleProps {
  teamId: string;
  /** 管理者ビューか (追加・一括登録・編集・削除・記録の代理入力を出す) */
  isAdmin?: boolean;
  /** 管理者ビュー: 一括登録の画面を開く */
  onOpenBulkRegister?: () => void;
}

export default function TeamSchedule({
  teamId,
  isAdmin = false,
  onOpenBulkRegister,
}: TeamScheduleProps) {
  const t = useTranslations("teams");
  const tCommon = useTranslations("common");
  const tAdmin = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  const [kind, setKind] = useState<ScheduleKind>("all");
  const [showPast, setShowPast] = useState(false);
  // 開いている間に日付が変わっても、一覧の境目が途中で動かないよう開いた時点の日付で固定する
  const [today] = useState(getScheduleToday);

  const includePractices = kind !== "competitions";
  const includeCompetitions = kind !== "practices";

  // 今日以降 (近い順・全件)。種類の絞り込みを切り替えても取り直さないよう、両方とも常に取る
  const upcomingPracticesQuery = useQuery(
    teamUpcomingPracticesQueryOptions(supabase, teamId, today),
  );
  const upcomingCompetitionsQuery = useQuery(
    teamUpcomingCompetitionsQueryOptions(supabase, teamId, today),
  );
  // 過去 (新しい順・段階読み込み)。「過去」を開いたときだけ取る
  const pastPracticesQuery = useInfiniteQuery({
    ...teamPastPracticesInfiniteQueryOptions(supabase, teamId, today),
    enabled: showPast && includePractices,
  });
  const pastCompetitionsQuery = useInfiniteQuery({
    ...teamPastCompetitionsInfiniteQueryOptions(supabase, teamId, today),
    enabled: showPast && includeCompetitions,
  });

  const practiceActions = useTeamPracticeActions({ teamId, isAdmin });
  const competitionActions = useTeamCompetitionActions({ teamId, isAdmin });

  const practicesQuery = showPast ? pastPracticesQuery : upcomingPracticesQuery;
  const competitionsQuery = showPast ? pastCompetitionsQuery : upcomingCompetitionsQuery;
  const practices = useMemo(
    () =>
      showPast ? (pastPracticesQuery.data?.pages.flat() ?? []) : (upcomingPracticesQuery.data ?? []),
    [showPast, pastPracticesQuery.data, upcomingPracticesQuery.data],
  );
  const competitions = useMemo(
    () =>
      showPast
        ? (pastCompetitionsQuery.data?.pages.flat() ?? [])
        : (upcomingCompetitionsQuery.data ?? []),
    [showPast, pastCompetitionsQuery.data, upcomingCompetitionsQuery.data],
  );
  const practicesHasMore = showPast && includePractices && pastPracticesQuery.hasNextPage;
  const competitionsHasMore =
    showPast && includeCompetitions && pastCompetitionsQuery.hasNextPage;

  const items = useMemo(
    () =>
      buildScheduleItems({
        practices,
        competitions,
        kind,
        showPast,
        practicesHasMore,
        competitionsHasMore,
      }),
    [practices, competitions, kind, showPast, practicesHasMore, competitionsHasMore],
  );

  // スケルトン / 取得エラーは「表示できるデータが無い」ときだけ出す
  // (再取得中・再取得の失敗時は前回の内容をそのまま表示する)
  const isLoading =
    (includePractices && practicesQuery.isPending) ||
    (includeCompetitions && competitionsQuery.isPending);
  const isFetchError =
    (includePractices && practicesQuery.isError && !practicesQuery.data) ||
    (includeCompetitions && competitionsQuery.isError && !competitionsQuery.data);
  const actionError = practiceActions.error ?? competitionActions.error;
  const isFetchingMore =
    pastPracticesQuery.isFetchingNextPage || pastCompetitionsQuery.isFetchingNextPage;

  const practicesFetchError = practicesQuery.error;
  const competitionsFetchError = competitionsQuery.error;
  useEffect(() => {
    if (practicesFetchError) console.error("チーム練習情報の取得に失敗:", practicesFetchError);
  }, [practicesFetchError]);
  useEffect(() => {
    if (competitionsFetchError) console.error("チーム大会情報の取得に失敗:", competitionsFetchError);
  }, [competitionsFetchError]);

  const handleRetry = () => {
    practiceActions.clearError();
    competitionActions.clearError();
    if (includePractices) void practicesQuery.refetch();
    if (includeCompetitions) void competitionsQuery.refetch();
  };

  const handleLoadMore = () => {
    if (practicesHasMore) void pastPracticesQuery.fetchNextPage();
    if (competitionsHasMore) void pastCompetitionsQuery.fetchNextPage();
  };

  let body: React.ReactNode;
  if (actionError) {
    body = (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{actionError}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          {tCommon("retry")}
        </button>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div className="animate-pulse space-y-3" data-testid="team-schedule-loading">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
            <div className="h-3 bg-gray-200 rounded w-20"></div>
          </div>
        ))}
      </div>
    );
  } else if (isFetchError) {
    body = (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{t("mobile.schedule.fetchFailed")}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          {tCommon("retry")}
        </button>
      </div>
    );
  } else if (items.length === 0 && !practicesHasMore && !competitionsHasMore) {
    body = (
      <div className="text-center py-8">
        <CalendarDaysIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600">{t(EMPTY_KEYS[showPast ? "past" : "upcoming"][kind])}</p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {items.map((item) => (
          <React.Fragment key={item.key}>
            {item.kind === "practice"
              ? practiceActions.renderCard(item.practice)
              : competitionActions.renderCard(item.competition)}
          </React.Fragment>
        ))}
        {(practicesHasMore || competitionsHasMore) && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isFetchingMore}
              data-testid="team-schedule-load-more"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFetchingMore ? tCommon("loading") : tCommon("loadMore.button")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        {/* 絞り込みと操作ボタン (読み込み中・エラー時も常に出し、すぐ操作できるようにする) */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5" role="group" aria-label={t("mobile.tabSchedule")}>
            {KINDS.map(({ id, labelKey }) => {
              const isActive = kind === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKind(id)}
                  aria-pressed={isActive}
                  data-testid={`team-schedule-kind-${id}`}
                  className={`px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors ${
                    isActive
                      ? "bg-blue-100 border-blue-300 text-blue-700 font-semibold"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
          {/* 「過去」は種類の択一とは別のオン/オフ。時計アイコンと塗りの色で区別する */}
          <button
            type="button"
            role="switch"
            aria-checked={showPast}
            onClick={() => setShowPast((prev) => !prev)}
            data-testid="team-schedule-past-toggle"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs sm:text-sm transition-colors ${
              showPast
                ? "bg-gray-600 border-gray-600 text-white"
                : "bg-white border-dashed border-gray-400 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <ClockIcon className="h-4 w-4" aria-hidden="true" />
            {t("mobile.schedule.filterPast")}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* 利用者ビュー: 自分のログを追加 */}
            {!isAdmin && (
              <button
                type="button"
                onClick={practiceActions.openSelfLog}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                {t("practices.selfLogButton")}
              </button>
            )}
            {isAdmin && (
              <>
                {onOpenBulkRegister && (
                  <button
                    type="button"
                    onClick={onOpenBulkRegister}
                    data-testid="team-schedule-bulk-register"
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <DocumentArrowUpIcon className="h-4 w-4 mr-1" />
                    {tAdmin("tabs.bulkRegister")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={practiceActions.openAddForm}
                  data-testid="team-schedule-add-practice"
                  className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  {t("practices.addButton")}
                </button>
                <button
                  type="button"
                  onClick={competitionActions.openAddForm}
                  data-testid="team-schedule-add-competition"
                  className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  {t("competitions.addButton")}
                </button>
              </>
            )}
          </div>
        </div>

        {body}
      </div>

      {practiceActions.modals}
      {competitionActions.modals}
    </>
  );
}
