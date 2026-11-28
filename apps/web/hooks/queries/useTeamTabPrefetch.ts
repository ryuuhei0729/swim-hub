"use client";

// =============================================================================
// チーム画面のタブ先読み
//
// 開いているタブの読み込みが終わったあと、次に開かれそうなタブ (既定タブ + 左右の隣)
// のデータを React Query のキャッシュへ先に読み込んでおく。タブを切り替えた瞬間に
// 内容を表示できる (表示後に staleTime 0 の再取得で最新化される)。
// =============================================================================

import { useEffect } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/contexts";
import {
  DEFAULT_TEAM_TAB,
  TEAM_TAB_IDS,
  type TeamTabType,
} from "@/components/team/teamTabDefs";
import { getScheduleToday } from "@/utils/teamSchedule";
import { useOptionalQueryClient } from "./useOptionalQueryClient";
import { teamUpcomingPracticesQueryOptions } from "./teamPracticeQueries";
import { teamUpcomingCompetitionsQueryOptions } from "./teamCompetitionQueries";
import {
  approvedTeamMembersQueryOptions,
  teamGroupSortDataQueryOptions,
} from "./teamMemberQueries";
import { myMonthListQueryOptions } from "./teamAttendanceQueries";

/** 開いているタブの取得が落ち着いてから先読みを始めるまでの待ち時間 */
export const TEAM_TAB_PREFETCH_DELAY_MS = 500;

/**
 * 先読みしたデータを「新しい」とみなす時間。タブを行き来するたびに同じ先読みを
 * 繰り返さないためのもので、タブを開いたときの再取得 (各クエリの staleTime 0) には影響しない。
 */
const PREFETCH_STALE_TIME_MS = 30 * 1000;

type TeamView = "member" | "admin";

interface PrefetchContext {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  teamId: string;
  userId: string | null;
}

interface TabPrefetcher {
  /** タブ本体が最初に表示するクエリ (これの取得が終わるまで先読みを待つ) */
  primaryKey: (ctx: PrefetchContext) => QueryKey;
  prefetch: (ctx: PrefetchContext) => Promise<unknown>;
}

function prefetchWith(
  ctx: PrefetchContext,
  options: { queryKey: QueryKey; queryFn: () => Promise<unknown> },
) {
  return ctx.queryClient.prefetchQuery({ ...options, staleTime: PREFETCH_STALE_TIME_MS });
}

const membersPrefetcher: TabPrefetcher = {
  primaryKey: (ctx) => approvedTeamMembersQueryOptions(ctx.supabase, ctx.teamId).queryKey,
  // ベストタイム表 (メンバー数ぶんのクエリ) は重いので先読みしない
  prefetch: (ctx) =>
    Promise.all([
      prefetchWith(ctx, approvedTeamMembersQueryOptions(ctx.supabase, ctx.teamId)),
      prefetchWith(ctx, teamGroupSortDataQueryOptions(ctx.supabase, ctx.teamId)),
    ]),
};

// 予定タブは今日以降の練習・大会を最初に出す (過去は「過去」を開いたときだけ取る)
const schedulePrefetcher: TabPrefetcher = {
  primaryKey: (ctx) =>
    teamUpcomingPracticesQueryOptions(ctx.supabase, ctx.teamId, getScheduleToday()).queryKey,
  prefetch: (ctx) => {
    const today = getScheduleToday();
    return Promise.all([
      prefetchWith(ctx, teamUpcomingPracticesQueryOptions(ctx.supabase, ctx.teamId, today)),
      prefetchWith(ctx, teamUpcomingCompetitionsQueryOptions(ctx.supabase, ctx.teamId, today)),
    ]);
  },
};

const myAttendancePrefetcher: TabPrefetcher = {
  primaryKey: (ctx) => myMonthListQueryOptions(ctx.supabase, ctx.teamId, ctx.userId).queryKey,
  // ユーザー未確定 (null) のときは先読みしない (タブ本体のクエリも enabled: false で待つ)
  prefetch: (ctx) =>
    ctx.userId === null
      ? Promise.resolve()
      : prefetchWith(ctx, myMonthListQueryOptions(ctx.supabase, ctx.teamId, ctx.userId)),
};

/**
 * ビューごとの先読み可能なタブ。ここに無いタブ (その他・管理者の出欠など) は先読みしない
 * (それぞれ別の仕組みでキャッシュしているか、開いてから取れば十分なため)。
 * 管理者ビューのメンバータブは「メンバー / グループ」切替の既定がメンバーなので、
 * 利用者ビューと同じものを先読みする。
 */
const PREFETCHERS: Record<TeamView, Partial<Record<TeamTabType, TabPrefetcher>>> = {
  member: {
    members: membersPrefetcher,
    schedule: schedulePrefetcher,
    attendance: myAttendancePrefetcher,
  },
  admin: {
    members: membersPrefetcher,
    schedule: schedulePrefetcher,
  },
};

/**
 * 先読みするタブ = 既定タブ + 開いているタブの左右の隣 (開いているタブ自身は除く)。
 * 先読みの仕組みが無いタブは除く。タブの並びは両ビューで同じ (teamTabDefs.ts)。
 */
export function getTeamTabsToPrefetch(view: TeamView, activeTab: TeamTabType): TeamTabType[] {
  const order = TEAM_TAB_IDS;
  const index = order.indexOf(activeTab);
  const candidates: TeamTabType[] = [DEFAULT_TEAM_TAB];
  if (index > 0) candidates.push(order[index - 1]!); // index > 0 を確認済み
  if (index >= 0 && index < order.length - 1) candidates.push(order[index + 1]!); // 範囲確認済み
  const prefetchers = PREFETCHERS[view];
  return [...new Set(candidates)].filter((tab) => tab !== activeTab && prefetchers[tab]);
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * チーム画面 (利用者ビュー / 管理者ビュー) のタブ先読み。
 *
 * 開いているタブの読み込みが終わる (そのタブの主クエリに結果が入り、かつ取得中の
 * クエリが無くなる) まで待ってから、次に開かれそうなタブのデータを先読みする。
 * オフライン (`navigator.onLine === false`) のときは先読みしない。
 * QueryClientProvider が無い環境 (既存テスト) や enabled=false のときは何もしない。
 */
export function useTeamTabPrefetch(
  teamId: string,
  activeTab: TeamTabType,
  view: TeamView,
  enabled: boolean = true,
) {
  const queryClient = useOptionalQueryClient();
  const { supabase, user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!enabled || !queryClient || !supabase) return;
    const ctx: PrefetchContext = { queryClient, supabase, teamId, userId };
    const targets = getTeamTabsToPrefetch(view, activeTab);
    if (targets.length === 0) return;

    const activePrefetcher = PREFETCHERS[view][activeTab];
    const activeKey = activePrefetcher?.primaryKey(ctx);

    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 開いているタブの読み込みが終わったか。主クエリがあるタブはその結果 (成功・失敗) を待ち、
    // 主クエリが無いタブは「取得中のクエリが無い」状態が続くことだけを条件にする
    const isActiveTabSettled = () => {
      if (queryClient.isFetching() > 0) return false;
      if (!activeKey) return true;
      const state = queryClient.getQueryState(activeKey);
      return state !== undefined && (state.status === "success" || state.status === "error");
    };

    const run = () => {
      if (done) return;
      done = true;
      unsubscribe();
      if (isOffline()) return;
      for (const tab of targets) {
        void PREFETCHERS[view][tab]?.prefetch(ctx);
      }
    };

    const check = () => {
      if (done) return;
      if (!isActiveTabSettled()) {
        // 取得が始まったら、待っていた先読みは仕切り直す
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        return;
      }
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (isActiveTabSettled()) run();
      }, TEAM_TAB_PREFETCH_DELAY_MS);
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(check);
    check();

    return () => {
      done = true;
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled, queryClient, supabase, teamId, userId, activeTab, view]);
}
