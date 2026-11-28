"use client";

// =============================================================================
// チーム大会 (予定タブの大会) の取得
//
// 取得関数はタブ本体 (next/dynamic で遅延読み込み) から切り離してここに置く。
// タブの先読み (useTeamTabPrefetch) が本体のチャンクを読み込まずに同じ取得を
// 呼べるようにするため。今日以降 / 過去の分け方は teamPracticeQueries.ts と同じ。
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoolType } from "@apps/shared/types";
import { isPoolType } from "@apps/shared/types";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "./teamDetailKeys";
import { TEAM_SCHEDULE_PAST_PAGE_SIZE, type TeamScheduleRange } from "./teamPracticeQueries";

export interface TeamCompetition {
  id: string;
  user_id: string;
  team_id: string;
  title: string;
  date: string;
  end_date: string | null;
  place: string | null;
  pool_type: PoolType;
  entry_status?: "before" | "open" | "closed";
  note: string | null;
  created_at: string;
  created_by: string | null;
  /** 「自分の記録を追加」フォームで自分のエントリー内容を初期値にするために使う */
  entries?: {
    id: string;
    user_id: string;
    style_id: number;
    entry_time: number | null;
  }[];
}

// Supabaseクエリ結果の型定義
interface RawCompetitionEntry {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
}

interface RawCompetitionData {
  id: string;
  user_id: string;
  team_id: string;
  title: string;
  date: string;
  end_date?: string | null;
  place: string | null;
  pool_type?: number | null;
  entry_status: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  entries?: RawCompetitionEntry[] | null;
}


/**
 * Supabaseのクエリ結果をTeamCompetition[]に変換するマッパー関数
 */
export function mapToTeamCompetitions(
  data: RawCompetitionData[] | null,
): TeamCompetition[] {
  if (!data) return [];

  return data.map(
    (item): TeamCompetition => ({
      id: item.id,
      user_id: item.user_id,
      team_id: item.team_id,
      title: item.title,
      date: item.date,
      end_date: item.end_date ?? null,
      place: item.place,
      // DB 由来の生の数値を PoolType (0 | 1) の値域に narrowing する。範囲外/NULL は 0 (短水路) にフォールバック
      pool_type: isPoolType(item.pool_type) ? item.pool_type : 0,
      entry_status: isValidEntryStatus(item.entry_status)
        ? item.entry_status
        : undefined,
      note: item.note,
      created_at: item.created_at,
      created_by: item.created_by,
      entries: item.entries?.map((entry) => ({
        id: entry.id,
        user_id: entry.user_id,
        style_id: entry.style_id,
        entry_time: entry.entry_time,
      })),
    }),
  );
}

function isValidEntryStatus(
  status: string | null,
): status is "before" | "open" | "closed" {
  return status === "before" || status === "open" || status === "closed";
}
/** 予定タブの大会カードに使う列 (一覧と 1 件取得で共通) */
const TEAM_COMPETITION_LIST_SELECT = `
            id,
            user_id,
            team_id,
            title,
            date,
            end_date,
            place,
            pool_type,
            entry_status,
            note,
            created_at,
            created_by,
            entries (
              id,
              user_id,
              style_id,
              entry_time
            )
          `;

/** チームの大会 (エントリーの概要を含む) を、予定タブの範囲 (今日以降 / 過去の 1 ページ) で取得する */
export async function fetchTeamCompetitions(
  supabase: SupabaseClient,
  teamId: string,
  range: TeamScheduleRange,
): Promise<TeamCompetition[]> {
  const base = supabase
    .from("competitions")
    .select(TEAM_COMPETITION_LIST_SELECT)
    .eq("team_id", teamId);

  const { data, error } =
    range.when === "upcoming"
      ? await base.gte("date", range.today).order("date", { ascending: true })
      : await base
          .lt("date", range.today)
          .order("date", { ascending: false })
          .range(range.offset, range.offset + range.limit - 1);

  if (error) throw error;
  return mapToTeamCompetitions(data as RawCompetitionData[] | null);
}

/**
 * チームの大会 1 件 (予定タブのカードと同じ形)。他のチームの大会・見つからないときは null。
 * 外から予定タブの詳細を開くとき (`?competition=<id>`) に使う。過去の大会でも一覧の読み込み範囲に関係なく取れる
 */
export async function fetchTeamCompetitionById(
  supabase: SupabaseClient,
  teamId: string,
  competitionId: string,
): Promise<TeamCompetition | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select(TEAM_COMPETITION_LIST_SELECT)
    .eq("team_id", teamId)
    .eq("id", competitionId)
    .maybeSingle();

  if (error) throw error;
  return data ? (mapToTeamCompetitions([data as RawCompetitionData])[0] ?? null) : null;
}

/** 今日以降の大会 (日付の近い順・全件) */
export function teamUpcomingCompetitionsQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  today: string,
) {
  return {
    queryKey: teamDetailKeys.competitionUpcoming(teamId, today),
    queryFn: () => fetchTeamCompetitions(supabase, teamId, { when: "upcoming", today }),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

/** 過去の大会 (新しい順・TEAM_SCHEDULE_PAST_PAGE_SIZE 件ずつ) の useInfiniteQuery 用オプション */
export function teamPastCompetitionsInfiniteQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  today: string,
) {
  return {
    queryKey: teamDetailKeys.competitionPast(teamId, today),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchTeamCompetitions(supabase, teamId, {
        when: "past",
        today,
        offset: pageParam,
        limit: TEAM_SCHEDULE_PAST_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: TeamCompetition[], allPages: TeamCompetition[][]) =>
      lastPage.length < TEAM_SCHEDULE_PAST_PAGE_SIZE
        ? undefined
        : allPages.length * TEAM_SCHEDULE_PAST_PAGE_SIZE,
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}
