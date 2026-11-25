"use client";

// =============================================================================
// チームの出欠 (出欠タブの月別サマリ・出欠状況モーダル) の取得
// =============================================================================

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, endOfMonth, format, isValid, parse, parseISO, startOfMonth } from "date-fns";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import { TeamAttendancesAPI } from "@apps/shared/api/teams/attendances";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { getMonthDateRange } from "@swim-hub/shared/utils/date";
import { fetchTeamMembers, type TeamMember } from "@swim-hub/shared/utils/team";
import {
  TEAM_HEAVY_VIEW_QUERY_OPTIONS,
  TEAM_VIEW_QUERY_OPTIONS,
  teamDetailKeys,
} from "./teamDetailKeys";

// -----------------------------------------------------------------------------
// 月別サマリ (出欠タブ)
// -----------------------------------------------------------------------------

export interface MonthItem {
  year: number;
  month: number;
  status: "has_unanswered" | "all_answered" | null;
  eventCount: number;
  answeredCount: number;
}

export type MonthStatus = Pick<MonthItem, "eventCount" | "answeredCount" | "status">;

/** 指定月のイベント数・自分の回答数・回答状況を計算する */
export async function calculateMyMonthStatus(
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI,
  teamId: string,
  year: number,
  month: number,
): Promise<MonthStatus> {
  const [startDateStr, endDateStr] = getMonthDateRange(year, month);

  const [practicesResult, competitionsResult] = await Promise.all([
    supabase
      .from("practices")
      .select("id")
      .eq("team_id", teamId)
      .gte("date", startDateStr)
      .lte("date", endDateStr),
    supabase
      .from("competitions")
      .select("id")
      .eq("team_id", teamId)
      .gte("date", startDateStr)
      .lte("date", endDateStr),
  ]);

  if (practicesResult.error) throw practicesResult.error;
  if (competitionsResult.error) throw competitionsResult.error;

  const practiceIds = (practicesResult.data || []).map((p) => p.id);
  const competitionIds = (competitionsResult.data || []).map((c) => c.id);
  const eventCount = practiceIds.length + competitionIds.length;

  const attendanceData = await attendanceAPI.getMyAttendancesByMonth(teamId, year, month);
  const answeredCount = attendanceData.filter((a) => a.status !== null).length;

  const eventIds = new Set([...practiceIds, ...competitionIds]);
  const answeredEventIds = new Set(
    attendanceData
      .filter((a) => a.status !== null)
      .map((a) => a.practice_id || a.competition_id)
      .filter((id): id is string => id !== null),
  );

  const allAnswered =
    eventCount > 0 && Array.from(eventIds).every((id) => answeredEventIds.has(id));

  return {
    eventCount,
    answeredCount,
    status: eventCount === 0 ? null : allAnswered ? "all_answered" : "has_unanswered",
  };
}

/** 今月から 1 年先までの、イベントがある月の一覧とそれぞれの回答状況を取得する */
export async function fetchMyMonthList(
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI,
  teamId: string,
  now: Date = new Date(),
): Promise<MonthItem[]> {
  const oneYearLater = addMonths(now, 12);
  const startDateStr = format(startOfMonth(now), "yyyy-MM-dd");
  const endDateStr = format(endOfMonth(oneYearLater), "yyyy-MM-dd");

  const [practicesResult, competitionsResult] = await Promise.all([
    supabase
      .from("practices")
      .select("date")
      .eq("team_id", teamId)
      .gte("date", startDateStr)
      .lte("date", endDateStr),
    supabase
      .from("competitions")
      .select("date")
      .eq("team_id", teamId)
      .gte("date", startDateStr)
      .lte("date", endDateStr),
  ]);

  if (practicesResult.error) throw practicesResult.error;
  if (competitionsResult.error) throw competitionsResult.error;

  const monthSet = new Set<string>();
  const allDates = [
    ...(practicesResult.data || []).map((p) => p.date),
    ...(competitionsResult.data || []).map((c) => c.date),
  ];

  allDates.forEach((dateStr) => {
    const date = parseISO(dateStr);
    // 日付が壊れている行は月の一覧に含めない (format が例外を投げて一覧全体が失敗しないように)
    if (!isValid(date)) return;
    monthSet.add(format(date, "yyyy-MM"));
  });

  const monthList: MonthItem[] = [];
  const sortedMonthKeys = Array.from(monthSet).sort();

  for (const monthKey of sortedMonthKeys) {
    const [yearStr, monthStr] = monthKey.split("-");
    if (!yearStr || !monthStr) continue; // monthKey は同関数内で
    // format(date, "yyyy-MM") により生成されるため常に2要素に分割されるが、
    // split() の型上は保証されないため防御的にスキップする
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const status = await calculateMyMonthStatus(supabase, attendanceAPI, teamId, year, month);
    monthList.push({
      year,
      month,
      ...status,
    });
  }

  return monthList;
}

/** 月別サマリの基準月 (今月)。キーに含めて月が替わったら別キャッシュにする */
export function currentBaseMonth(now: Date = new Date()): string {
  return format(now, "yyyy-MM");
}

/**
 * 基準月 (yyyy-MM) をその月の 1 日の Date にする。クエリキーと取得範囲を一致させるため、
 * 取得側はこれを起点にする。形式が不正なら今月を起点にする。
 */
export function baseMonthToDate(baseMonth: string): Date {
  const date = parse(baseMonth, "yyyy-MM", new Date());
  return isValid(date) ? date : startOfMonth(new Date());
}

/**
 * 月別サマリのクエリオプション。月の数 × 数クエリを順に投げる重いクエリなので、
 * フォーカスでは再取得しない (以前もしていなかった)。タブを開くたびには再取得する。
 */
export function myMonthListQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  userId: string | null,
  baseMonth: string = currentBaseMonth(),
) {
  return {
    queryKey: teamDetailKeys.myMonthList(teamId, userId, baseMonth),
    // キーの基準月と同じ月を起点に取得する (キーとデータの月がずれないように)
    queryFn: () =>
      fetchMyMonthList(supabase, new AttendanceAPI(supabase), teamId, baseMonthToDate(baseMonth)),
    // 自分の回答を数えるので、ユーザーが確定するまで (AuthProvider の初期値は null) 取得しない。
    // null で 1 回、実 ID でもう 1 回と重いクエリを 2 回投げないため
    enabled: userId !== null,
    ...TEAM_HEAVY_VIEW_QUERY_OPTIONS,
  };
}

// -----------------------------------------------------------------------------
// 出欠状況モーダル (1 イベントの全員の回答 + 名簿)
// -----------------------------------------------------------------------------

/**
 * 1 イベントの全員の回答。shared の useAttendanceByPracticeQuery /
 * useAttendanceByCompetitionQuery と同じキー・同じ形のデータにしている
 * (shared の出欠更新ミューテーションの invalidate がそのまま効くように)。
 */
function eventAttendanceQueryKey(event: Pick<TeamEvent, "id" | "type">) {
  return event.type === "practice"
    ? teamKeys.attendanceByPractice(event.id)
    : teamKeys.attendanceByCompetition(event.id);
}

/**
 * 出欠状況モーダルのデータ。開くたびに再取得するが、前回開いたときの内容があれば先に表示する。
 *
 * 閉じるときに呼び出し側が event を null に戻しても、閉じアニメーション中に
 * クエリキーが変わって表示が空にならないよう、最後に開いていたイベントを保持して使う。
 */
export function useEventAttendanceQuery(
  supabase: SupabaseClient,
  teamId: string,
  event: TeamEvent | null,
  isOpen: boolean,
) {
  // React 公式の「レンダー中に state を調整する」パターン
  const [lastEvent, setLastEvent] = useState<TeamEvent | null>(event);
  if (event && event !== lastEvent) {
    setLastEvent(event);
  }
  const displayEvent = event ?? lastEvent;

  const attendancesQuery = useQuery({
    queryKey: displayEvent
      ? eventAttendanceQueryKey(displayEvent)
      : teamKeys.attendanceByPractice(""),
    queryFn: (): Promise<TeamAttendanceWithDetails[]> => {
      const api = new TeamAttendancesAPI(supabase);
      // enabled で displayEvent !== null を保証済み
      return displayEvent!.type === "practice"
        ? api.listByPractice(displayEvent!.id)
        : api.listByCompetition(displayEvent!.id);
    },
    enabled: isOpen && displayEvent !== null,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });

  const membersQuery = useQuery({
    queryKey: teamDetailKeys.attendanceMembers(teamId),
    queryFn: (): Promise<TeamMember[]> => fetchTeamMembers(supabase, teamId),
    enabled: isOpen && displayEvent !== null,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });

  const error = attendancesQuery.error ?? membersQuery.error;
  useEffect(() => {
    if (error) console.error("出欠情報の取得に失敗:", error);
  }, [error]);

  const hasData = attendancesQuery.data !== undefined && membersQuery.data !== undefined;
  return {
    attendanceData: attendancesQuery.data ?? EMPTY_ATTENDANCES,
    teamMembers: membersQuery.data ?? EMPTY_TEAM_MEMBERS,
    // 読み込み表示は表示できる内容が無いときだけ。開いた直後でまだ取得が始まっていない
    // (イベントが未確定でクエリが無効な) 描画でも、エラーでなければ読み込み中として扱う
    // (一瞬「回答なし」の空のモーダルが見えないように)
    loading:
      !hasData &&
      (attendancesQuery.isFetching || membersQuery.isFetching || (isOpen && !error)),
    error: hasData ? null : error,
  };
}

const EMPTY_ATTENDANCES: TeamAttendanceWithDetails[] = [];
const EMPTY_TEAM_MEMBERS: TeamMember[] = [];
