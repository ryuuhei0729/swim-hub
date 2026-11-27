"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { SupabaseClient } from "@supabase/supabase-js";
import { TeamEvent } from "@swim-hub/shared/types";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { useEventAttendanceQuery } from "@/hooks/queries/teamAttendanceQueries";

/**
 * 管理者の出欠タブの「出欠状況モーダル」。
 *
 * 取得は React Query (`teamKeys.attendanceByPractice/Competition` + 名簿)。
 * 開くたびに再取得するが、同じイベントを前回開いたときの内容があれば先に表示する。
 * 閉じたあとも最後のイベントのキーを保持する (閉じる途中で表示が空にならないように)。
 */
export function useAttendanceModal(supabase: SupabaseClient, teamId: string) {
  const t = useTranslations("teams.attendanceStatusHook");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TeamEvent | null>(null);

  const { attendanceData, teamMembers, loading, error } = useEventAttendanceQuery(
    supabase,
    teamId,
    selectedEvent,
    isOpen,
  );

  const openModal = useCallback(async (event: TeamEvent) => {
    setSelectedEvent(event);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSelectedEvent(null);
  }, []);

  return {
    isOpen,
    selectedEvent,
    attendanceData,
    teamMembers,
    loading,
    error: error ? toUserFacingMessage(error, t("loadError")) : null,
    openModal,
    closeModal,
  };
}
