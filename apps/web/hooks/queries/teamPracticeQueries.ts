"use client";

// =============================================================================
// チーム練習 (予定タブの練習・練習詳細モーダル) の取得
//
// 取得関数はタブ本体 (next/dynamic で遅延読み込み) から切り離してここに置く。
// タブの先読み (useTeamTabPrefetch) が本体のチャンクを読み込まずに同じ取得を
// 呼べるようにするため。
//
// 予定タブは「今日以降 (近い順・全件)」と「過去 (新しい順・段階読み込み)」を別々に取る
// (swimhub-tasks #72)。今日以降は件数が限られるので mobile と同じく全件、過去は
// 長く使うチームほど増え続けるので TEAM_SCHEDULE_PAST_PAGE_SIZE 件ずつ読み足す。
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "./teamDetailKeys";

/** 予定タブの「過去」を 1 回に読み込む件数 (練習・大会それぞれ) */
export const TEAM_SCHEDULE_PAST_PAGE_SIZE = 20;

/** 予定タブの取得範囲。today は端末のローカル日付 (yyyy-MM-dd) */
export type TeamScheduleRange =
  | { when: "upcoming"; today: string }
  | { when: "past"; today: string; offset: number; limit: number };

// Supabase から返されるスネークケースの型
export interface PracticeRecord {
  id: string;
  user_id: string;
  date: string;
  title: string | null;
  place: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  practice_logs?: { id: string }[];
}

// UI で使用するキャメルケースの型
export interface TeamPractice {
  id: string;
  userId: string;
  date: string;
  title: string | null;
  place: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  /** カードは「記録があるか」だけを見るので、ログは ID だけ取る */
  practiceLogs?: { id: string }[];
}

// スネークケース → キャメルケース変換関数
export function mapPracticeRecordToTeamPractice(record: PracticeRecord): TeamPractice {
  return {
    id: record.id,
    userId: record.user_id,
    date: record.date,
    title: record.title,
    place: record.place,
    note: record.note,
    createdAt: record.created_at,
    createdBy: record.created_by,
    practiceLogs: record.practice_logs?.map((log) => ({ id: log.id })),
  };
}

/** チームの練習を、予定タブの範囲 (今日以降 / 過去の 1 ページ) で取得する */
export async function fetchTeamPractices(
  supabase: SupabaseClient,
  teamId: string,
  range: TeamScheduleRange,
): Promise<TeamPractice[]> {
  const base = supabase
    .from("practices")
    .select(
      `
            id,
            user_id,
            date,
            title,
            place,
            note,
            created_at,
            created_by,
            practice_logs ( id )
          `,
    )
    .eq("team_id", teamId);

  const { data, error } =
    range.when === "upcoming"
      ? await base.gte("date", range.today).order("date", { ascending: true })
      : await base
          .lt("date", range.today)
          .order("date", { ascending: false })
          .range(range.offset, range.offset + range.limit - 1);

  if (error) throw error;
  return (data || []).map((record) => mapPracticeRecordToTeamPractice(record as PracticeRecord));
}

/** 今日以降の練習 (日付の近い順・全件) */
export function teamUpcomingPracticesQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  today: string,
) {
  return {
    queryKey: teamDetailKeys.practiceUpcoming(teamId, today),
    queryFn: () => fetchTeamPractices(supabase, teamId, { when: "upcoming", today }),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

/** 過去の練習 (新しい順・TEAM_SCHEDULE_PAST_PAGE_SIZE 件ずつ) の useInfiniteQuery 用オプション */
export function teamPastPracticesInfiniteQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  today: string,
) {
  return {
    queryKey: teamDetailKeys.practicePast(teamId, today),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchTeamPractices(supabase, teamId, {
        when: "past",
        today,
        offset: pageParam,
        limit: TEAM_SCHEDULE_PAST_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: TeamPractice[], allPages: TeamPractice[][]) =>
      lastPage.length < TEAM_SCHEDULE_PAST_PAGE_SIZE
        ? undefined
        : allPages.length * TEAM_SCHEDULE_PAST_PAGE_SIZE,
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

// -----------------------------------------------------------------------------
// 練習詳細モーダル
// -----------------------------------------------------------------------------

/**
 * 練習 1 件 + 全メンバーのログ・タイム・タグ。
 * 該当行が無い (PGRST116) 場合も「見つからない」というエラーとして扱い、
 * 空の結果をキャッシュしない (以前のコードも読み込みエラーを表示していた)。
 */
export async function fetchTeamPracticeDetail<T>(
  supabase: SupabaseClient,
  practiceId: string,
  notFoundMessage: string,
): Promise<T> {
  const { data, error } = await supabase
    .from("practices")
    .select(
      `
            id,
            date,
            title,
            place,
            note,
            practice_logs (
              id,
              user_id,
              style,
              swim_category,
              rep_count,
              set_count,
              distance,
              circle,
              note,
              practice_times (
                id,
                time,
                rep_number,
                set_number,
                user_id
              ),
              practice_log_tags (
                practice_tag_id,
                practice_tags (
                  id,
                  name,
                  color
                )
              ),
              users!practice_logs_user_id_fkey (
                name
              )
            )
          `,
    )
    .eq("id", practiceId)
    .single();

  if (error) throw error;
  if (!data) throw new Error(notFoundMessage);
  return data as unknown as T;
}
