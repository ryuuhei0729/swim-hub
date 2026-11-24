"use client";

import { useState, useCallback } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { TeamEvent } from "@swim-hub/shared/types";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import { useEventAttendanceQuery } from "@/hooks/queries/teamAttendanceQueries";

/**
 * 出欠状況モーダル (1 イベントの全員の回答) のデータ。
 *
 * 取得は React Query (`teamKeys.attendanceByPractice/Competition` + 名簿)。
 * 開くたびに再取得するが、同じイベントを前回開いたときの内容があれば先に表示する。
 */
export const useAttendanceStatus = (
  teamId: string,
  supabase: SupabaseClient,
  isOpen: boolean,
) => {
  const t = useTranslations("teams");
  const [event, setEvent] = useState<TeamEvent | null>(null);

  const { attendanceData, teamMembers, loading, error } = useEventAttendanceQuery(
    supabase,
    teamId,
    event,
    isOpen,
  );

  // 表示するイベントを切り替える (取得は useEventAttendanceQuery がキーの変化で行う)
  const loadAttendanceData = useCallback(async (nextEvent: TeamEvent) => {
    setEvent(nextEvent);
  }, []);

  return {
    attendanceData,
    teamMembers,
    loading,
    error: error ? toUserFacingMessage(error, t("attendanceStatusHook.loadError")) : null,
    loadAttendanceData,
  };
};
