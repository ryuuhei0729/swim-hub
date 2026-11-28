"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type { AttendanceStatus, TeamEvent } from "@swim-hub/shared/types";
import { notificationKeys } from "@apps/shared/hooks/queries/keys";
import {
  invalidateTeamAttendanceAnswerQueries,
  teamDetailKeys,
} from "@/hooks/queries/teamDetailKeys";

/** 管理者が回答を直すメンバー。出欠の行が無い (DB トリガーで作られていない) 人は attendanceId が null */
export interface MemberAnswerTarget {
  userId: string;
  attendanceId: string | null;
  note: string | null;
}

/**
 * 管理者がメンバーの出欠を代わりに変更する (mobile の useMemberAnswerEditor と同じ)。
 * 行がある人は更新し、無い人は作る (どちらも AttendanceAPI が管理者権限を確認する。
 * RLS も team_attendance の INSERT / UPDATE をチームの管理者に許している)。
 * 備考は本人のものをそのまま残す。
 *
 * 失敗したら例外をそのまま投げる (表示は呼び出し側)。
 */
export function useMemberAnswerEditor(supabase: SupabaseClient, teamId: string) {
  const queryClient = useQueryClient();
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);

  return useCallback(
    async (event: TeamEvent, target: MemberAnswerTarget, status: AttendanceStatus) => {
      if (target.attendanceId) {
        await attendanceAPI.updateAttendance(target.attendanceId, { status });
      } else {
        await attendanceAPI.createAttendance({
          user_id: target.userId,
          practice_id: event.type === "practice" ? event.id : null,
          competition_id: event.type === "competition" ? event.id : null,
          status,
          note: target.note || null,
        });
      }
      // 全員の出欠 (このモーダル)・ホームの未回答・サイドバー等のバッジ・本人の出欠一覧を最新にする
      await Promise.all([
        invalidateTeamAttendanceAnswerQueries(queryClient, [event]),
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
        queryClient.invalidateQueries({ queryKey: teamDetailKeys.myMonthListAll(teamId) }),
      ]);
    },
    [attendanceAPI, queryClient, teamId],
  );
}
