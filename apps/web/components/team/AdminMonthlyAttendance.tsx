"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useAdminAttendance } from "@/hooks/useAdminAttendance";
import { useAttendanceModal } from "@/hooks/useAttendanceModal";
import { EventListItem } from "@/components/admin-attendance/EventListItem";
import { BulkChangeModal } from "@/components/admin-attendance/BulkChangeModal";
import { AttendanceStatusModal } from "@/components/admin-attendance/AttendanceStatusModal";

export interface AdminMonthlyAttendanceProps {
  teamId: string;
}

export default function AdminMonthlyAttendance({ teamId }: AdminMonthlyAttendanceProps) {
  const t = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const {
    events,
    loading,
    error,
    editStates,
    savingEventIds,
    loadFutureEvents,
    handleStatusChange,
    handleSaveEvent,
    handleBulkUpdate,
  } = useAdminAttendance(supabase, teamId);

  const attendanceModal = useAttendanceModal(supabase, teamId);

  useEffect(() => {
    loadFutureEvents();
  }, [loadFutureEvents]);

  const handleBulkUpdateWrapper = async (
    selectedEventIds: Set<string>,
    status: "open" | "closed",
  ) => {
    await handleBulkUpdate(selectedEventIds, status);
    setIsBulkModalOpen(false);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">{t("adminAttendance.loading")}</p>
        </div>
      </div>
    );
  }

  if (error && !events.length) {
    if (error) console.error("AdminMonthlyAttendance error:", error);
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{t("adminAttendance.error")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{t("adminAttendance.error")}</p>
        </div>
      )}

      {/* 一括変更ボタン */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsBulkModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {t("adminAttendance.bulkChangeButton")}
        </button>
      </div>

      {/* イベント一覧 */}
      {events.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">{t("adminAttendance.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
          {events.map((event) => {
            const editState = editStates[event.id] || {
              attendanceStatus: event.attendance_status || null,
            };
            const isSaving = savingEventIds.has(event.id);
            const hasChanges = event.attendance_status !== editState.attendanceStatus;

            return (
              <EventListItem
                key={`${event.type}-${event.id}`}
                event={event}
                editState={editState}
                isSaving={isSaving}
                hasChanges={hasChanges}
                onStatusChange={handleStatusChange}
                onSave={handleSaveEvent}
                onClick={() => attendanceModal.openModal(event)}
              />
            );
          })}
        </div>
      )}

      {/* 一括変更モーダル */}
      <BulkChangeModal
        isOpen={isBulkModalOpen}
        events={events}
        onClose={() => setIsBulkModalOpen(false)}
        onBulkUpdate={handleBulkUpdateWrapper}
      />

      {/* 出欠状況モーダル */}
      <AttendanceStatusModal
        isOpen={attendanceModal.isOpen}
        event={attendanceModal.selectedEvent}
        attendanceData={attendanceModal.attendanceData}
        teamMembers={attendanceModal.teamMembers}
        loading={attendanceModal.loading}
        onClose={attendanceModal.closeModal}
      />
    </div>
  );
}
