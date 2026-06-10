"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import { format, isValid } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import BaseModal from "@/components/ui/BaseModal";
import { TeamEvent, TeamAttendanceWithDetails } from "@swim-hub/shared/types";
import { TeamMember } from "@swim-hub/shared/utils/team";
import { AttendanceGroupingDisplay } from "./AttendanceGroupingDisplay";

interface AttendanceStatusModalProps {
  isOpen: boolean;
  event: TeamEvent | null;
  attendanceData: TeamAttendanceWithDetails[];
  teamMembers: TeamMember[];
  loading: boolean;
  onClose: () => void;
}

export function AttendanceStatusModal({
  isOpen,
  event,
  attendanceData,
  teamMembers,
  loading,
  onClose,
}: AttendanceStatusModalProps) {
  const t = useTranslations("teamsAdmin");
  const locale = useLocale();
  const dateLocale = locale === "ja" ? ja : enUS;
  const datePattern = locale === "ja" ? "MMMM d日 (EEE)" : "MMMM d (EEE)";
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return isValid(date) ? format(date, datePattern, { locale: dateLocale }) : "-";
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? `${formatEventDate(event.date)}${t("attendanceStatus.titleSuffix")}` : ""}
      size="lg"
    >
      {loading ? (
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">{t("attendanceStatus.loading")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AttendanceGroupingDisplay attendanceData={attendanceData} teamMembers={teamMembers} />
        </div>
      )}
    </BaseModal>
  );
}
