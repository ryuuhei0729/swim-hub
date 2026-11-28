"use client";

// =============================================================================
// チームの出欠 (出欠タブの自分の出欠一覧・出欠状況モーダル) の取得
// =============================================================================

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, endOfMonth, format, isValid, parse, startOfDay } from "date-fns";
import { TeamAttendancesAPI } from "@apps/shared/api/teams/attendances";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance, TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { fetchTeamMembers, type TeamMember } from "@swim-hub/shared/utils/team";
import { buildMyAttendanceItems, type MyAttendanceItem } from "@/utils/teamAttendance";
import {
  TEAM_HEAVY_VIEW_QUERY_OPTIONS,
  TEAM_VIEW_QUERY_OPTIONS,
  teamDetailKeys,
} from "./teamDetailKeys";

// -----------------------------------------------------------------------------
// 自分の出欠一覧 (出欠タブ)
// -----------------------------------------------------------------------------

/**
 * 今日〜12 か月先 (の月末) の練習・大会と、それぞれに対する自分の出欠を取得する。
 * mobile (useTeamAttendanceList) と同じ範囲。過去のイベントは出さない (今日は含む)。
 */
export async function fetchMyAttendanceList(
  supabase: SupabaseClient,
  teamId: string,
  userId: string,
  today: Date = new Date(),
): Promise<MyAttendanceItem[]> {
  const startDateStr = format(today, "yyyy-MM-dd");
  const endDateStr = format(endOfMonth(addMonths(today, 12)), "yyyy-MM-dd");

  const [practicesResult, competitionsResult] = await Promise.all([
    supabase
      .from("practices")
      .select("*")
      .eq("team_id", teamId)
      .gte("date", startDateStr)
      .lte("date", endDateStr),
    supabase
      .from("competitions")
      .select("*")
      .eq("team_id", teamId)
      .gte("date", startDateStr)
      .lte("date", endDateStr),
  ]);
  if (practicesResult.error) throw practicesResult.error;
  if (competitionsResult.error) throw competitionsResult.error;

  const events: TeamEvent[] = [
    ...(practicesResult.data ?? []).map((p) => ({ ...p, type: "practice" as const })),
    ...(competitionsResult.data ?? []).map((c) => ({ ...c, type: "competition" as const })),
  ];
  const practiceIds = events.filter((e) => e.type === "practice").map((e) => e.id);
  const competitionIds = events.filter((e) => e.type === "competition").map((e) => e.id);

  const [practiceAttendances, competitionAttendances] = await Promise.all([
    practiceIds.length > 0
      ? supabase
          .from("team_attendance")
          .select("*")
          .eq("user_id", userId)
          .in("practice_id", practiceIds)
      : Promise.resolve({ data: [] as TeamAttendance[], error: null }),
    competitionIds.length > 0
      ? supabase
          .from("team_attendance")
          .select("*")
          .eq("user_id", userId)
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [] as TeamAttendance[], error: null }),
  ]);
  if (practiceAttendances.error) throw practiceAttendances.error;
  if (competitionAttendances.error) throw competitionAttendances.error;

  return buildMyAttendanceItems(events, [
    ...((practiceAttendances.data ?? []) as TeamAttendance[]),
    ...((competitionAttendances.data ?? []) as TeamAttendance[]),
  ]);
}

/** 一覧の基準日 (今日)。キーに含めて日付が替わったら別キャッシュにする */
export function currentBaseDate(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

/**
 * 基準日 (yyyy-MM-dd) を Date にする。クエリキーと取得範囲を一致させるため、
 * 取得側はこれを起点にする。形式が不正なら今日を起点にする。
 */
export function baseDateToDate(baseDate: string): Date {
  const date = parse(baseDate, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : startOfDay(new Date());
}

/**
 * 自分の出欠一覧のクエリオプション。
 * 回答は押した時点で一覧のキャッシュを書き換えて保存するので、保存中にフォーカスで
 * 取り直して表示が戻らないよう、フォーカスでは再取得しない。タブを開くたびには再取得する。
 */
export function myMonthListQueryOptions(
  supabase: SupabaseClient,
  teamId: string,
  userId: string | null,
  baseDate: string = currentBaseDate(),
) {
  return {
    queryKey: teamDetailKeys.myMonthList(teamId, userId, baseDate),
    // キーの基準日と同じ日を起点に取得する (キーとデータの範囲がずれないように)
    // enabled で userId !== null を保証済み
    queryFn: () => fetchMyAttendanceList(supabase, teamId, userId!, baseDateToDate(baseDate)),
    // 自分の回答を取るので、ユーザーが確定するまで (AuthProvider の初期値は null) 取得しない
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
