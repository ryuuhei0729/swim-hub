"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { notificationKeys } from "./keys";

export interface UnansweredAttendance {
  teamId: string;
  teamName: string;
  eventId: string;
  eventType: "practice" | "competition";
  eventName: string;
  eventDate: string;
}

export interface UnsubmittedEntry {
  teamId: string;
  teamName: string;
  competitionId: string;
  competitionName: string;
  competitionDate: string;
}

interface TeamInfo {
  team_id: string;
  team?: { name?: string };
}

/**
 * 「受付中で未回答」の練習・大会を取得するクエリ (ホームのお知らせ・チームタブのバッジ・モバイルの出欠タブで同じ定義)
 *
 * - 受付中: イベント日が今日以降で、attendance_status が締切 (closed) でないもの。
 *   null (旧データの「未設定」) は受付中として数える (受付状態は 受付中 / 締切 の 2 つだけを扱うため)
 * - 未回答: 自分の出欠の行が無いか、行の status が null
 * - 期間の上限は設けない (来月以降の受付中のイベントも数える)
 */
export function useUnansweredAttendancesQuery(
  supabase: SupabaseClient,
  userId: string | undefined,
  teams: TeamInfo[],
) {
  const teamIds = teams.map((t) => t.team_id);

  return useQuery<UnansweredAttendance[]>({
    queryKey: notificationKeys.unanswered(userId ?? "", teamIds),
    queryFn: async () => {
      // 今日は過去扱いしない (resolveAttendanceStatus / isCompetitionDateInPast と同じ境界 = 端末のローカル日付)
      const startDateStr = format(new Date(), "yyyy-MM-dd");

      // 全チームを並列で処理
      const results = await Promise.all(
        teams.map(async (team): Promise<UnansweredAttendance[]> => {
          const teamId = team.team_id;
          const teamName = team.team?.name || "チーム";

          // 練習と大会を並列で取得
          const [practicesResult, competitionsResult] = await Promise.all([
            supabase
              .from("practices")
              .select("id, title, date, attendance_status")
              .eq("team_id", teamId)
              .gte("date", startDateStr)
              .order("date", { ascending: true }),
            supabase
              .from("competitions")
              .select("id, title, date, attendance_status")
              .eq("team_id", teamId)
              .gte("date", startDateStr)
              .order("date", { ascending: true }),
          ]);

          if (practicesResult.error || competitionsResult.error) {
            console.error(`チーム ${teamName} のデータ取得に失敗しました:`, {
              practicesError: practicesResult.error,
              competitionsError: competitionsResult.error,
            });
            return [];
          }

          // 締切のものを除く (null = 未設定は受付中として残す)
          const isOpen = (e: { attendance_status: string | null }) => e.attendance_status !== "closed";
          const practices = (practicesResult.data ?? []).filter(isOpen);
          const competitions = (competitionsResult.data ?? []).filter(isOpen);

          // 出欠情報を並列で取得
          const practiceIds = practices.map((p) => p.id);
          const competitionIds = competitions.map((c) => c.id);

          const [practiceAttendances, competitionAttendances] = await Promise.all([
            practiceIds.length > 0
              ? supabase
                  .from("team_attendance")
                  .select("practice_id, status")
                  .eq("user_id", userId!)
                  .in("practice_id", practiceIds)
              : Promise.resolve({
                  data: [] as { practice_id: string; status: string | null }[],
                  error: null,
                }),
            competitionIds.length > 0
              ? supabase
                  .from("team_attendance")
                  .select("competition_id, status")
                  .eq("user_id", userId!)
                  .in("competition_id", competitionIds)
              : Promise.resolve({
                  data: [] as { competition_id: string; status: string | null }[],
                  error: null,
                }),
          ]);

          if (practiceAttendances.error || competitionAttendances.error) {
            console.error(`チーム ${teamName} の出欠データ取得に失敗しました:`, {
              practiceAttendancesError: practiceAttendances.error,
              competitionAttendancesError: competitionAttendances.error,
            });
            return [];
          }

          const practiceAttData = practiceAttendances.data ?? [];
          const competitionAttData = competitionAttendances.data ?? [];

          const items: UnansweredAttendance[] = [];

          // 未回答の練習を追加
          for (const practice of practices) {
            const attendance = practiceAttData.find((a) => a.practice_id === practice.id);
            if (!attendance || attendance.status === null) {
              items.push({
                teamId,
                teamName,
                eventId: practice.id,
                eventType: "practice",
                eventName: practice.title || "練習",
                eventDate: practice.date,
              });
            }
          }

          // 未回答の大会を追加
          for (const competition of competitions) {
            const attendance = competitionAttData.find((a) => a.competition_id === competition.id);
            if (!attendance || attendance.status === null) {
              items.push({
                teamId,
                teamName,
                eventId: competition.id,
                eventType: "competition",
                eventName: competition.title || "大会",
                eventDate: competition.date,
              });
            }
          }

          return items;
        }),
      );

      return results.flat();
    },
    enabled: !!userId && teams.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * エントリー未提出の大会を取得するクエリ
 */
export function useUnsubmittedEntriesQuery(
  supabase: SupabaseClient,
  userId: string | undefined,
  teams: TeamInfo[],
) {
  const teamIds = teams.map((t) => t.team_id);

  return useQuery<UnsubmittedEntry[]>({
    queryKey: notificationKeys.unsubmitted(userId ?? "", teamIds),
    queryFn: async () => {
      // 過去日の大会は resolveEntryStatus により表示上「受付終了」となり、セルフエントリー
      // 導線も塞がれる。DB の entry_status="open" が残っていても催促しないよう、
      // 大会日で今日以降 (今日は過去扱いしない = isCompetitionDateInPast と同じ境界) に絞る。
      const todayStr = format(new Date(), "yyyy-MM-dd");

      // 全チームを並列で処理
      const results = await Promise.all(
        teams.map(async (team): Promise<UnsubmittedEntry[]> => {
          const teamId = team.team_id;
          const teamName = team.team?.name || "チーム";

          const { data: openCompetitions, error: competitionsError } = await supabase
            .from("competitions")
            .select("id, title, date")
            .eq("team_id", teamId)
            .eq("entry_status", "open")
            .gte("date", todayStr)
            .order("date", { ascending: true });

          if (competitionsError) {
            console.error(`チーム ${teamName} の大会データ取得に失敗しました:`, competitionsError);
            return [];
          }

          if (!openCompetitions || openCompetitions.length === 0) return [];

          const competitionIds = openCompetitions.map((c) => c.id);
          const { data: myEntries, error: entriesError } = await supabase
            .from("entries")
            .select("competition_id")
            .eq("user_id", userId!)
            .in("competition_id", competitionIds);

          if (entriesError) {
            console.error(`チーム ${teamName} のエントリーデータ取得に失敗しました:`, entriesError);
            return [];
          }

          const submittedIds = new Set((myEntries ?? []).map((e) => e.competition_id));

          const items: UnsubmittedEntry[] = [];
          for (const competition of openCompetitions) {
            if (!submittedIds.has(competition.id)) {
              items.push({
                teamId,
                teamName,
                competitionId: competition.id,
                competitionName: competition.title || "大会",
                competitionDate: competition.date,
              });
            }
          }

          return items;
        }),
      );

      return results.flat();
    },
    enabled: !!userId && teams.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
