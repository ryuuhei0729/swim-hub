"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { dashboardKeys } from "./keys";
import {
  pickNextCompetition,
  type NextCompetitionCandidate,
  type NextCompetitionEntry,
  type NextCompetitionGoal,
} from "../../utils/dashboardNextCompetition";

export interface DashboardStats {
  practiceCount: number;
  recordCount: number;
}

/**
 * ダッシュボード統計データ取得クエリ
 * 今月の練習回数と全期間の大会記録数を並列で取得
 */
export function useDashboardStatsQuery(supabase: SupabaseClient, userId: string | undefined) {
  const today = new Date();
  const month = format(today, "yyyy-MM");
  const startOfMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const endOfMonth = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), "yyyy-MM-dd");

  return useQuery<DashboardStats>({
    queryKey: dashboardKeys.stats(userId ?? "", month),
    queryFn: async () => {
      const [practicesResult, recordsResult] = await Promise.all([
        supabase
          .from("practices")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId!)
          .gte("date", startOfMonth)
          .lte("date", endOfMonth),
        supabase.from("records").select("*", { count: "exact", head: true }).eq("user_id", userId!),
      ]);

      const errors: string[] = [];
      if (practicesResult.error) {
        errors.push(
          `practices: ${practicesResult.error.message}${practicesResult.error.details ? ` (${practicesResult.error.details})` : ""}`,
        );
      }
      if (recordsResult.error) {
        errors.push(
          `records: ${recordsResult.error.message}${recordsResult.error.details ? ` (${recordsResult.error.details})` : ""}`,
        );
      }
      if (errors.length > 0) {
        throw new Error(`ダッシュボード統計の取得に失敗しました: ${errors.join("; ")}`);
      }

      return {
        practiceCount: practicesResult.count ?? 0,
        recordCount: recordsResult.count ?? 0,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export interface NextCompetitionData {
  competition: NextCompetitionCandidate;
  entries: NextCompetitionEntry[];
  goals: NextCompetitionGoal[];
}

const NEXT_COMPETITION_COLUMNS = "id, title, date, end_date, place, pool_type, team_id, entry_status";

/**
 * ダッシュボードの「次の大会」と、その大会の自分のエントリー・目標を取得する。
 * 大会は RLS (本人 or 所属チーム) で見えるものから選ぶ。選び方は pickNextCompetition を参照。
 * 予定の大会が無ければ null。
 */
export function useNextCompetitionQuery(supabase: SupabaseClient, userId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery<NextCompetitionData | null>({
    queryKey: dashboardKeys.nextCompetition(userId ?? "", today),
    queryFn: async () => {
      const { data: competitions, error: competitionsError } = await supabase
        .from("competitions")
        .select(NEXT_COMPETITION_COLUMNS)
        .or(`date.gte.${today},end_date.gte.${today}`)
        .order("date", { ascending: true })
        .limit(20);
      if (competitionsError) throw competitionsError;

      const candidates = (competitions ?? []) as NextCompetitionCandidate[];
      if (candidates.length === 0) return null;

      const { data: entries, error: entriesError } = await supabase
        .from("entries")
        .select("id, competition_id, style_id, entry_time, is_relaying, style:styles(id, name_jp, distance, style)")
        .eq("user_id", userId!)
        .in(
          "competition_id",
          candidates.map((c) => c.id),
        );
      if (entriesError) throw entriesError;

      const entryRows = (entries ?? []) as Array<
        Omit<NextCompetitionEntry, "style"> & {
          competition_id: string;
          style: NextCompetitionEntry["style"] | NextCompetitionEntry["style"][];
        }
      >;
      const enteredIds = new Set(entryRows.map((e) => e.competition_id));
      const competition = pickNextCompetition(candidates, enteredIds, today);
      if (!competition) return null;

      const myEntries: NextCompetitionEntry[] = entryRows
        .filter((e) => e.competition_id === competition.id)
        .map((e) => ({
          id: e.id,
          style_id: e.style_id,
          entry_time: e.entry_time,
          is_relaying: e.is_relaying,
          style: Array.isArray(e.style) ? (e.style[0] ?? null) : e.style,
        }))
        // 個人種目を先に、リレーを後ろに。それぞれ種目 ID 順
        .sort((a, b) => Number(a.is_relaying) - Number(b.is_relaying) || a.style_id - b.style_id);

      if (myEntries.length === 0) return { competition, entries: [], goals: [] };

      const { data: goals, error: goalsError } = await supabase
        .from("goals")
        .select("id, style_id, target_time")
        .eq("user_id", userId!)
        .eq("competition_id", competition.id)
        .neq("status", "cancelled");
      if (goalsError) throw goalsError;

      return { competition, entries: myEntries, goals: (goals ?? []) as NextCompetitionGoal[] };
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

export interface UnrecordedCompetition {
  competitionId: string;
  competitionName: string;
  competitionDate: string;
}

/** 記録が未入力の大会を探す範囲 (大会の最終日が今日から何日前まで) */
export const UNRECORDED_LOOKBACK_DAYS = 30;

/**
 * エントリーしたのに記録が1件も無い、終わった大会 (直近30日) を取得する。
 * ダッシュボードの「対応が必要なこと」に出す。
 */
export function useUnrecordedCompetitionsQuery(
  supabase: SupabaseClient,
  userId: string | undefined,
) {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const from = format(subDays(now, UNRECORDED_LOOKBACK_DAYS), "yyyy-MM-dd");

  return useQuery<UnrecordedCompetition[]>({
    queryKey: dashboardKeys.unrecordedCompetitions(userId ?? "", today),
    queryFn: async () => {
      const { data: competitions, error: competitionsError } = await supabase
        .from("competitions")
        .select("id, title, date, end_date")
        .gte("date", from)
        .lt("date", today)
        .order("date", { ascending: false });
      if (competitionsError) throw competitionsError;

      const finished = (
        (competitions ?? []) as Array<{
          id: string;
          title: string | null;
          date: string;
          end_date: string | null;
        }>
      ).filter((c) => (c.end_date ?? c.date) < today);
      if (finished.length === 0) return [];

      const ids = finished.map((c) => c.id);
      const [entriesResult, recordsResult] = await Promise.all([
        supabase.from("entries").select("competition_id").eq("user_id", userId!).in("competition_id", ids),
        supabase.from("records").select("competition_id").eq("user_id", userId!).in("competition_id", ids),
      ]);
      if (entriesResult.error) throw entriesResult.error;
      if (recordsResult.error) throw recordsResult.error;

      const entered = new Set(
        ((entriesResult.data ?? []) as Array<{ competition_id: string }>).map((e) => e.competition_id),
      );
      const recorded = new Set(
        ((recordsResult.data ?? []) as Array<{ competition_id: string | null }>).map(
          (r) => r.competition_id,
        ),
      );

      return finished
        .filter((c) => entered.has(c.id) && !recorded.has(c.id))
        .map((c) => ({
          competitionId: c.id,
          competitionName: c.title ?? "",
          competitionDate: c.date,
        }));
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
