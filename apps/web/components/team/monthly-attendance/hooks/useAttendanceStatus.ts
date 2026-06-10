"use client";

import { useState, useCallback } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { TeamEvent } from "@swim-hub/shared/types";
import { TeamAttendancesAPI } from "@apps/shared/api/teams/attendances";
import { fetchTeamMembers, TeamMember } from "@swim-hub/shared/utils/team";

export const useAttendanceStatus = (
  teamId: string,
  supabase: SupabaseClient,
  attendancesAPI: TeamAttendancesAPI,
) => {
  const t = useTranslations("teams");
  const [attendanceData, setAttendanceData] = useState<TeamAttendanceWithDetails[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAttendanceData = useCallback(
    async (event: TeamEvent) => {
      try {
        setError(null);
        setLoading(true);

        const attendances =
          event.type === "practice"
            ? await attendancesAPI.listByPractice(event.id)
            : await attendancesAPI.listByCompetition(event.id);
        setAttendanceData(attendances);

        const members = await fetchTeamMembers(supabase, teamId);
        setTeamMembers(members);
      } catch (err) {
        console.error("出欠情報の取得に失敗:", err);
        setError(t("attendanceStatusHook.loadError"));
      } finally {
        setLoading(false);
      }
    },
    [teamId, supabase, attendancesAPI, t],
  );

  return {
    attendanceData,
    teamMembers,
    loading,
    error,
    loadAttendanceData,
  };
};
