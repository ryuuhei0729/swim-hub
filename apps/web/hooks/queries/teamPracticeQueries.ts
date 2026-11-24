"use client";

// =============================================================================
// チーム練習 (練習タブ・練習詳細モーダル) の取得
//
// 取得関数はタブ本体 (next/dynamic で遅延読み込み) から切り離してここに置く。
// タブの先読み (useTeamTabPrefetch) が本体のチャンクを読み込まずに同じ取得を
// 呼べるようにするため。
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "./teamDetailKeys";

/** 練習タブの 1 ページの件数 */
export const TEAM_PRACTICES_PAGE_SIZE = 20;

// Supabase から返されるスネークケースの型
// Supabaseのリレーションは配列または単一オブジェクトで返る可能性がある
interface PracticeRecord {
  id: string;
  user_id: string;
  date: string;
  title: string | null;
  place: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  users?: { name: string } | { name: string }[];
  created_by_user?: { name: string } | { name: string }[];
  practice_logs?: {
    id: string;
    style: string;
    distance: number;
    practice_times?: {
      time: number;
    }[];
  }[];
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
  users?: {
    name: string;
  };
  createdByUser?: {
    name: string;
  };
  practiceLogs?: {
    id: string;
    style: string;
    distance: number;
    practiceTimes?: {
      time: number;
    }[];
  }[];
}

export interface TeamPracticesPage {
  practices: TeamPractice[];
  totalCount: number;
}

// ヘルパー: 配列または単一オブジェクトを単一オブジェクトに正規化
function normalizeUser(
  user: { name: string } | { name: string }[] | undefined,
): { name: string } | undefined {
  if (!user) return undefined;
  return Array.isArray(user) ? user[0] : user;
}

// スネークケース → キャメルケース変換関数
function mapPracticeRecordToTeamPractice(record: PracticeRecord): TeamPractice {
  return {
    id: record.id,
    userId: record.user_id,
    date: record.date,
    title: record.title,
    place: record.place,
    note: record.note,
    createdAt: record.created_at,
    createdBy: record.created_by,
    users: normalizeUser(record.users),
    createdByUser: normalizeUser(record.created_by_user),
    practiceLogs: record.practice_logs?.map((log) => ({
      id: log.id,
      style: log.style,
      distance: log.distance,
      practiceTimes: log.practice_times?.map((pt) => ({
        time: pt.time,
      })),
    })),
  };
}

/** チームの練習記録 1 ページ分と総件数を取得する */
export async function fetchTeamPracticesPage(
  supabase: SupabaseClient,
  teamId: string,
  page: number,
  pageSize: number = TEAM_PRACTICES_PAGE_SIZE,
): Promise<TeamPracticesPage> {
  const offset = (page - 1) * pageSize;

  // 総件数とデータを並列取得（パフォーマンス最適化）
  const [countResult, practicesResult] = await Promise.all([
    // 総件数を取得
    supabase.from("practices").select("*", { count: "exact", head: true }).eq("team_id", teamId),
    // チームIDが設定された練習記録を取得
    supabase
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
            users!practices_user_id_fkey (
              name
            ),
            created_by_user:users!practices_created_by_fkey (
              name
            ),
            practice_logs (
              id,
              style,
              distance,
              practice_times (time)
            )
          `,
      )
      .eq("team_id", teamId)
      .order("date", { ascending: false })
      .range(offset, offset + pageSize - 1),
  ]);

  if (countResult.error) throw countResult.error;
  if (practicesResult.error) throw practicesResult.error;

  return {
    totalCount: countResult.count || 0,
    practices: (practicesResult.data || []).map((record) =>
      mapPracticeRecordToTeamPractice(record as PracticeRecord),
    ),
  };
}

export function teamPracticesPageQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  page: number,
  pageSize: number = TEAM_PRACTICES_PAGE_SIZE,
) {
  return {
    queryKey: teamDetailKeys.practicePage(teamId, page, pageSize),
    queryFn: () => fetchTeamPracticesPage(supabase, teamId, page, pageSize),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

/** 練習タブの一覧 (ページ単位) */
export function useTeamPracticesPageQuery(
  supabase: SupabaseClient,
  teamId: string,
  page: number,
  pageSize: number = TEAM_PRACTICES_PAGE_SIZE,
) {
  return useQuery(teamPracticesPageQueryOptions(supabase, teamId, page, pageSize));
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
