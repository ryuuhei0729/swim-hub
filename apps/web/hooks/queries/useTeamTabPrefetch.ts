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
import type { TeamTabType } from "@/components/team/TeamTabs";
import type { TeamAdminTabType } from "@/components/team/TeamAdminTabs";
import { teamGroupsWithCountQueryOptions } from "@/components/team/group-management/hooks/useTeamGroups";
import { useOptionalQueryClient } from "./useOptionalQueryClient";
import { teamPracticesPageQueryOptions } from "./teamPracticeQueries";
import { teamCompetitionsPageQueryOptions } from "./teamCompetitionQueries";
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

/** タブの並び順 (TeamTabs / TeamAdminTabs の定義と同じ順)。「隣のタブ」の判定に使う */
const MEMBER_TAB_ORDER = [
  "attendance",
  "members",
  "practices",
  "competitions",
  "rankings",
  "settings",
] as const satisfies readonly TeamTabType[];

const ADMIN_TAB_ORDER = [
  "attendance",
  "announcements",
  "members",
  "groups",
  "practices",
  "competitions",
  "rankings",
  "goals",
  "bulk-register",
  "settings",
] as const satisfies readonly TeamAdminTabType[];

const DEFAULT_TAB = "attendance";

type TeamView = "member" | "admin";
type AnyTeamTab = TeamTabType | TeamAdminTabType;

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

const practicesPrefetcher: TabPrefetcher = {
  primaryKey: (ctx) => teamPracticesPageQueryOptions(ctx.supabase, ctx.teamId, 1).queryKey,
  prefetch: (ctx) => prefetchWith(ctx, teamPracticesPageQueryOptions(ctx.supabase, ctx.teamId, 1)),
};

const competitionsPrefetcher: TabPrefetcher = {
  primaryKey: (ctx) => teamCompetitionsPageQueryOptions(ctx.supabase, ctx.teamId, 1).queryKey,
  prefetch: (ctx) =>
    prefetchWith(ctx, teamCompetitionsPageQueryOptions(ctx.supabase, ctx.teamId, 1)),
};

const myAttendancePrefetcher: TabPrefetcher = {
  primaryKey: (ctx) => myMonthListQueryOptions(ctx.supabase, ctx.teamId, ctx.userId).queryKey,
  // ユーザー未確定 (null) のときは先読みしない (タブ本体のクエリも enabled: false で待つ)
  prefetch: (ctx) =>
    ctx.userId === null
      ? Promise.resolve()
      : prefetchWith(ctx, myMonthListQueryOptions(ctx.supabase, ctx.teamId, ctx.userId)),
};

const groupsPrefetcher: TabPrefetcher = {
  primaryKey: (ctx) => teamGroupsWithCountQueryOptions(ctx.supabase, ctx.teamId).queryKey,
  prefetch: (ctx) => prefetchWith(ctx, teamGroupsWithCountQueryOptions(ctx.supabase, ctx.teamId)),
};

/**
 * ビューごとの先読み可能なタブ。ここに無いタブ (ランキング・設定・お知らせ・
 * 管理者の出欠など) は先読みしない (それぞれ別の仕組みでキャッシュしているか、
 * 編集フォームなのでキャッシュしない)。
 */
const PREFETCHERS: Record<TeamView, Partial<Record<AnyTeamTab, TabPrefetcher>>> = {
  member: {
    attendance: myAttendancePrefetcher,
    members: membersPrefetcher,
    practices: practicesPrefetcher,
    competitions: competitionsPrefetcher,
  },
  admin: {
    members: membersPrefetcher,
    groups: groupsPrefetcher,
    practices: practicesPrefetcher,
    competitions: competitionsPrefetcher,
  },
};

/**
 * 先読みするタブ = 既定タブ + 開いているタブの左右の隣 (開いているタブ自身は除く)。
 * 先読みの仕組みが無いタブは除く。
 */
export function getTeamTabsToPrefetch(view: TeamView, activeTab: AnyTeamTab): AnyTeamTab[] {
  const order: readonly AnyTeamTab[] = view === "admin" ? ADMIN_TAB_ORDER : MEMBER_TAB_ORDER;
  const index = order.indexOf(activeTab);
  const candidates: AnyTeamTab[] = [DEFAULT_TAB];
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
  activeTab: AnyTeamTab,
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
