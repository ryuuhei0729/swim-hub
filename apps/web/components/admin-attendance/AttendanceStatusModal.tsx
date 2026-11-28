"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import { isValid } from "date-fns";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import BaseModal from "@/components/ui/BaseModal";
import type {
  AttendanceStatus,
  TeamEvent,
  TeamAttendanceWithDetails,
} from "@swim-hub/shared/types";
import { TeamMember } from "@swim-hub/shared/utils/team";
import type { MemberAnswerTarget } from "@/hooks/useMemberAnswerEditor";
import { AttendanceGroupingDisplay } from "./AttendanceGroupingDisplay";

interface AttendanceStatusModalProps {
  isOpen: boolean;
  event: TeamEvent | null;
  attendanceData: TeamAttendanceWithDetails[];
  teamMembers: TeamMember[];
  loading: boolean;
  onClose: () => void;
  /** メンバーの回答を代わりに変更する (管理者ビュー)。失敗したら例外を投げる */
  onChangeMemberStatus?: (
    event: TeamEvent,
    target: MemberAnswerTarget,
    status: AttendanceStatus,
  ) => Promise<void>;
  /** 自分には「変更」を出さない */
  currentUserId?: string;
}

export function AttendanceStatusModal({
  isOpen,
  event,
  attendanceData,
  teamMembers,
  loading,
  onClose,
  onChangeMemberStatus,
  currentUserId,
}: AttendanceStatusModalProps) {
  const t = useTranslations("teamsAdmin");
  const locale = useLocale();
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return isValid(date) ? formatDate(date, "shortWithWeekday", locale as SupportedLocale) : "-";
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
          <AttendanceGroupingDisplay
            attendanceData={attendanceData}
            teamMembers={teamMembers}
            currentUserId={currentUserId}
            onChangeMemberStatus={
              onChangeMemberStatus && event
                ? (target, status) => onChangeMemberStatus(event, target, status)
                : undefined
            }
          />
        </div>
      )}
    </BaseModal>
  );
}
