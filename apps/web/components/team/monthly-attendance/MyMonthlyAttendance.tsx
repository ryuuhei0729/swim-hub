"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts";
import { useTranslations } from "next-intl";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import { TeamEvent } from "@swim-hub/shared/types";
import { MonthList } from "./components/MonthList";
import { RecentAttendance } from "./components/RecentAttendance";
import { MonthDetailModal } from "./components/MonthDetailModal";
import { AttendanceStatusModal } from "./components/AttendanceStatusModal";
import { useMonthList } from "./hooks/useMonthList";
import { useRecentAttendance } from "./hooks/useRecentAttendance";
import { useMonthDetail } from "./hooks/useMonthDetail";
import { useAttendanceEdit } from "./hooks/useAttendanceEdit";
import { useAttendanceStatus } from "./hooks/useAttendanceStatus";
import { invalidateTeamAttendanceAnswerQueries } from "@/hooks/queries/teamDetailKeys";

export interface MyMonthlyAttendanceProps {
  teamId: string;
}

export default function MyMonthlyAttendance({ teamId }: MyMonthlyAttendanceProps) {
  const { supabase, user } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("teams");
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);

  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<TeamEvent | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    monthList,
    loading: loadingMonthList,
    error: monthListError,
    loadMonthList,
    updateMonthStatus,
  } = useMonthList(teamId, supabase, attendanceAPI, user?.id ?? null);

  const {
    events: recentEvents,
    attendances: recentAttendances,
    editStates: recentEditStates,
    loading: loadingRecent,
    savingEventIds,
    error: recentError,
    loadRecentAttendances,
    handleStatusChange: handleRecentStatusChange,
    handleNoteChange: handleRecentNoteChange,
    saveEvent: handleSaveRecentEvent,
  } = useRecentAttendance(teamId, supabase, attendanceAPI, updateMonthStatus);

  const {
    events: monthEvents,
    attendances: monthAttendances,
    loading: loadingMonth,
    error: monthError,
    loadAttendances: loadMonthAttendances,
  } = useMonthDetail(teamId, supabase, attendanceAPI);

  const {
    editStates: monthEditStates,
    saving: savingMonth,
    error: editError,
    handleStatusChange: handleMonthStatusChange,
    handleNoteChange: handleMonthNoteChange,
    initializeEditStates,
    saveAll,
    setEditStates,
  } = useAttendanceEdit(teamId, supabase, attendanceAPI);

  const {
    attendanceData,
    teamMembers,
    loading: loadingAttendance,
    loadAttendanceData,
  } = useAttendanceStatus(teamId, supabase, isAttendanceModalOpen);

  // 月別サマリは useMonthList (React Query) がマウント時に取得する。
  // 直近の出欠は回答フォームの初期値になるので、キャッシュせず毎回最新を読み込む
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    loadRecentAttendances(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [loadRecentAttendances]);

  useEffect(() => {
    if (selectedMonth && isModalOpen) {
      const loadData = async () => {
        const result = await loadMonthAttendances(selectedMonth.year, selectedMonth.month);
        if (result) {
          initializeEditStates(result.events, result.attendances);
        }
      };
      loadData();
    }
  }, [selectedMonth, isModalOpen, loadMonthAttendances, initializeEditStates]);

  const handleMonthClick = (year: number, month: number) => {
    setSelectedMonth({ year, month });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMonth(null);
    setEditStates({});
  };

  const handleSaveAll = async () => {
    await saveAll(monthEvents, monthAttendances, async () => {
      // 出欠状況モーダル (全員の回答) のキャッシュに保存前の回答が残らないよう落とす
      await invalidateTeamAttendanceAnswerQueries(queryClient, monthEvents);
      if (selectedMonth) {
        await loadMonthAttendances(selectedMonth.year, selectedMonth.month);
      }
      await loadMonthList();
      handleCloseModal();
    });
  };

  const handleOpenAttendanceModal = async (event: TeamEvent) => {
    setSelectedEventForAttendance(event);
    setIsAttendanceModalOpen(true);
    await loadAttendanceData(event);
  };

  const handleCloseAttendanceModal = () => {
    setIsAttendanceModalOpen(false);
    setSelectedEventForAttendance(null);
  };

  // 直近の出欠を 1 件保存したら、そのイベントの出欠状況モーダルのキャッシュも落とす
  // (月別サマリは useRecentAttendance が updateMonthStatus で更新する)
  const handleSaveRecentEventAndInvalidate = useCallback(
    async (eventId: string) => {
      await handleSaveRecentEvent(eventId);
      const event = recentEvents.find((e) => e.id === eventId);
      if (event) {
        await invalidateTeamAttendanceAnswerQueries(queryClient, [event]);
      }
    },
    [handleSaveRecentEvent, recentEvents, queryClient],
  );

  const getMonthLabel = (year: number, month: number) => {
    return t("attendance.monthLabel", { year, month });
  };

  const error = monthListError || recentError || monthError || editError;

  if (loadingMonthList) {
    return (
      <div className="p-4">
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">{t("attendance.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <MonthList monthList={monthList} onMonthClick={handleMonthClick} />

      <RecentAttendance
        events={recentEvents}
        editStates={recentEditStates}
        savingEventIds={savingEventIds}
        loading={loadingRecent}
        onStatusChange={handleRecentStatusChange}
        onNoteChange={handleRecentNoteChange}
        onSave={handleSaveRecentEventAndInvalidate}
        attendances={recentAttendances}
      />

      <MonthDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedMonth ? getMonthLabel(selectedMonth.year, selectedMonth.month) : ""}
        events={monthEvents}
        editStates={monthEditStates}
        loading={loadingMonth}
        error={monthError}
        saving={savingMonth}
        onStatusChange={handleMonthStatusChange}
        onNoteChange={handleMonthNoteChange}
        onSaveAll={handleSaveAll}
        onEventClick={handleOpenAttendanceModal}
      />

      <AttendanceStatusModal
        isOpen={isAttendanceModalOpen}
        onClose={handleCloseAttendanceModal}
        event={selectedEventForAttendance}
        attendanceData={attendanceData}
        teamMembers={teamMembers}
        loading={loadingAttendance}
      />
    </div>
  );
}
