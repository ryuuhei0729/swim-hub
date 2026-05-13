"use client";

import React from "react";
import BaseModal from "@/components/ui/BaseModal";
import { TeamEvent, TeamAttendanceWithDetails } from "@swim-hub/shared/types";
import { TeamMember } from "@swim-hub/shared/utils/team";
import { AttendanceGroupingDisplay } from "./AttendanceGroupingDisplay";
import { formatDate } from "@apps/shared/utils/date";
import { useTranslations } from "next-intl";

interface AttendanceStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: TeamEvent | null;
  attendanceData: TeamAttendanceWithDetails[];
  teamMembers: TeamMember[];
  loading: boolean;
}

export const AttendanceStatusModal = React.memo(
  ({
    isOpen,
    onClose,
    event,
    attendanceData,
    teamMembers,
    loading,
  }: AttendanceStatusModalProps) => {
    const t = useTranslations("teams");
    const title = event ? `${formatDate(event.date, "shortWithWeekday")}${t("attendanceStatusModal.title")}` : "";

    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title={title} size="lg">
        {loading ? (
          <div className="text-center py-6">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            <p className="mt-1.5 text-sm text-gray-500">{t("attendance.loading")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <AttendanceGroupingDisplay attendanceData={attendanceData} teamMembers={teamMembers} />
          </div>
        )}
      </BaseModal>
    );
  },
);

AttendanceStatusModal.displayName = "AttendanceStatusModal";
