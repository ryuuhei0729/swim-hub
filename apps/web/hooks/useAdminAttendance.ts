"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { SupabaseClient } from "@supabase/supabase-js";
import { TeamAttendancesAPI } from "@apps/shared/api/teams/attendances";
import { AttendanceStatusType, TeamEvent } from "@swim-hub/shared/types";
import { addMonths, endOfMonth, format } from "date-fns";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";

/**
 * 出欠の受付状態 (受付中 / 締切) の管理 (管理者)。
 *
 * mobile のチームの出欠タブ (管理者表示) と同じく、今日〜12 か月先の練習・大会を出し、
 * 受付状態は選んだ時点で保存する (確認は呼び出し側で出す)。
 */
export function useAdminAttendance(supabase: SupabaseClient, teamId: string) {
  const t = useTranslations("teams.adminAttendanceHook");
  const attendancesAPI = useMemo(() => new TeamAttendancesAPI(supabase), [supabase]);

  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingEventIds, setSavingEventIds] = useState<Set<string>>(new Set());

  const fetchEvents = useCallback(async (): Promise<TeamEvent[]> => {
    const today = new Date();
    // 過去のイベントは出さない。今日は過去扱いしない (端末のローカル日付)
    const startDate = format(today, "yyyy-MM-dd");
    const endDate = format(endOfMonth(addMonths(today, 12)), "yyyy-MM-dd");

    const [practicesResult, competitionsResult] = await Promise.all([
      supabase
        .from("practices")
        .select("*")
        .eq("team_id", teamId)
        .gte("date", startDate)
        .lte("date", endDate),
      supabase
        .from("competitions")
        .select("*")
        .eq("team_id", teamId)
        .gte("date", startDate)
        .lte("date", endDate),
    ]);

    if (practicesResult.error) throw practicesResult.error;
    if (competitionsResult.error) throw competitionsResult.error;

    const practices: TeamEvent[] = (practicesResult.data || []).map((p) => ({
      ...p,
      type: "practice" as const,
    }));
    const competitions: TeamEvent[] = (competitionsResult.data || []).map((c) => ({
      ...c,
      type: "competition" as const,
    }));
    return [...practices, ...competitions].sort((a, b) => a.date.localeCompare(b.date));
  }, [teamId, supabase]);

  const loadFutureEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setEvents(await fetchEvents());
    } catch (err) {
      console.error("イベント情報の取得に失敗:", err);
      setError(toUserFacingMessage(err, t("loadEventsError")));
    } finally {
      setLoading(false);
    }
  }, [fetchEvents, t]);

  /**
   * 受付状態を変えて保存する (1 件でも複数でも)。画面は先に切り替え、
   * 失敗したらエラーを出してサーバーの値で取り直す。成功したら true
   */
  const changeStatus = useCallback(
    async (eventIds: Iterable<string>, status: AttendanceStatusType): Promise<boolean> => {
      const ids = new Set(eventIds);
      const targets = events.filter((e) => ids.has(e.id));
      if (targets.length === 0) return true;

      setError(null);
      setEvents((prev) =>
        prev.map((e) => (ids.has(e.id) ? { ...e, attendance_status: status } : e)),
      );
      setSavingEventIds((prev) => new Set([...prev, ...ids]));
      try {
        await Promise.all(
          targets.map((event) =>
            event.type === "practice"
              ? attendancesAPI.updatePracticeAttendanceStatus(event.id, status)
              : attendancesAPI.updateCompetitionAttendanceStatus(event.id, status),
          ),
        );
        return true;
      } catch (err) {
        console.error("出欠ステータスの保存に失敗:", err);
        setError(toUserFacingMessage(err, t(targets.length > 1 ? "bulkUpdateError" : "saveError")));
        try {
          setEvents(await fetchEvents());
        } catch (reloadErr) {
          console.error("イベント情報の取得に失敗:", reloadErr);
        }
        return false;
      } finally {
        setSavingEventIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [events, attendancesAPI, fetchEvents, t],
  );

  return {
    events,
    loading,
    error,
    savingEventIds,
    loadFutureEvents,
    changeStatus,
  };
}
