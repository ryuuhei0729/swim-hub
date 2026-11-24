"use client";

// =============================================================================
// チーム大会 (大会タブ) の取得
//
// 取得関数はタブ本体 (next/dynamic で遅延読み込み) から切り離してここに置く。
// タブの先読み (useTeamTabPrefetch) が本体のチャンクを読み込まずに同じ取得を
// 呼べるようにするため。
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoolType } from "@apps/shared/types";
import { isPoolType } from "@apps/shared/types";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "./teamDetailKeys";

/** 大会タブの 1 ページの件数 */
export const TEAM_COMPETITIONS_PAGE_SIZE = 20;

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
  users?: {
    name: string;
  };
  created_by_user?: {
    name: string;
  };
  records?: {
    id: string;
    time: number;
    users?: {
      name: string;
    };
  }[];
  entries?: {
    id: string;
    user_id: string;
    style_id: number;
    entry_time: number | null;
    users?: {
      name: string;
    };
  }[];
}

// Supabaseクエリ結果の型定義
// Note: Supabaseはリレーションを配列として返す場合がある
interface RawCompetitionUser {
  name: string;
}

interface RawCompetitionRecord {
  id: string;
  time: number;
  users?: RawCompetitionUser | RawCompetitionUser[] | null;
}

interface RawCompetitionEntry {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  users?: RawCompetitionUser | RawCompetitionUser[] | null;
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
  users?: RawCompetitionUser | RawCompetitionUser[] | null;
  created_by_user?: RawCompetitionUser | RawCompetitionUser[] | null;
  records?: RawCompetitionRecord[] | null;
  entries?: RawCompetitionEntry[] | null;
}


/**
 * Supabaseが返すユーザー情報（配列または単一オブジェクト）を単一オブジェクトに正規化
 */
function normalizeUser(
  user: RawCompetitionUser | RawCompetitionUser[] | null | undefined,
): { name: string } | undefined {
  if (!user) return undefined;
  if (Array.isArray(user)) {
    return user.length > 0 ? { name: user[0]!.name } : undefined; // user.length > 0 を三項演算子内で確認済み
  }
  return { name: user.name };
}

/**
 * Supabaseのクエリ結果をTeamCompetition[]に変換するマッパー関数
 */
function mapToTeamCompetitions(
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
      users: normalizeUser(item.users),
      created_by_user: normalizeUser(item.created_by_user),
      records: item.records?.map((record) => ({
        id: record.id,
        time: record.time,
        users: normalizeUser(record.users),
      })),
      entries: item.entries?.map((entry) => ({
        id: entry.id,
        user_id: entry.user_id,
        style_id: entry.style_id,
        entry_time: entry.entry_time,
        users: normalizeUser(entry.users),
      })),
    }),
  );
}

function isValidEntryStatus(
  status: string | null,
): status is "before" | "open" | "closed" {
  return status === "before" || status === "open" || status === "closed";
}
export interface TeamCompetitionsPage {
  competitions: TeamCompetition[];
  totalCount: number;
}

/** チームの大会 1 ページ分 (エントリー・記録の概要を含む) と総件数を取得する */
export async function fetchTeamCompetitionsPage(
  supabase: SupabaseClient,
  teamId: string,
  page: number,
  pageSize: number = TEAM_COMPETITIONS_PAGE_SIZE,
): Promise<TeamCompetitionsPage> {
  const offset = (page - 1) * pageSize;

  // 総件数とデータを並列取得（パフォーマンス最適化）
  const [countResult, competitionsResult] = await Promise.all([
    // 総件数を取得
    supabase
      .from("competitions")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId),
    // チームIDが設定された大会を取得（エントリー情報も含む）
    supabase
      .from("competitions")
      .select(
        `
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
            users!competitions_user_id_fkey (
              name
            ),
            created_by_user:users!competitions_created_by_fkey (
              name
            ),
            records (
              id,
              time,
              users!records_user_id_fkey (
                name
              )
            ),
            entries (
              id,
              user_id,
              style_id,
              entry_time,
              users!entries_user_id_fkey (
                name
              )
            )
          `,
      )
      .eq("team_id", teamId)
      .order("date", { ascending: false })
      .range(offset, offset + pageSize - 1),
  ]);

  if (countResult.error) throw countResult.error;
  if (competitionsResult.error) throw competitionsResult.error;

  return {
    totalCount: countResult.count || 0,
    competitions: mapToTeamCompetitions(competitionsResult.data as RawCompetitionData[] | null),
  };
}

export function teamCompetitionsPageQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  page: number,
  pageSize: number = TEAM_COMPETITIONS_PAGE_SIZE,
) {
  return {
    queryKey: teamDetailKeys.competitionPage(teamId, page, pageSize),
    queryFn: () => fetchTeamCompetitionsPage(supabase, teamId, page, pageSize),
    ...TEAM_VIEW_QUERY_OPTIONS,
  };
}

/** 大会タブの一覧 (ページ単位) */
export function useTeamCompetitionsPageQuery(
  supabase: SupabaseClient,
  teamId: string,
  page: number,
  pageSize: number = TEAM_COMPETITIONS_PAGE_SIZE,
) {
  return useQuery(teamCompetitionsPageQueryOptions(supabase, teamId, page, pageSize));
}
