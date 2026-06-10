"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TeamAttendanceWithDetails } from "@swim-hub/shared/types";
import { TeamMember } from "@swim-hub/shared/utils/team";
import { useAttendanceGrouping } from "@swim-hub/shared/hooks/useAttendanceGrouping";

interface AttendanceGroupingDisplayProps {
  attendanceData: TeamAttendanceWithDetails[];
  teamMembers: TeamMember[];
}

export function AttendanceGroupingDisplay({
  attendanceData,
  teamMembers,
}: AttendanceGroupingDisplayProps) {
  const t = useTranslations("teamsAdmin");
  const { presentMembers, absentMembers, otherMembers, unansweredMembers } = useAttendanceGrouping(
    attendanceData,
    teamMembers,
  );

  return (
    <>
      {/* 出席 */}
      <div>
        <h3 className="text-sm font-semibold text-green-800 mb-2">
          {t("attendanceGrouping.present", { count: presentMembers.length })}
        </h3>
        {presentMembers.length > 0 ? (
          <div className="bg-green-50 rounded-lg p-3 space-y-1">
            {presentMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-900">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">{t("attendanceGrouping.none")}</div>
        )}
      </div>

      {/* 欠席 */}
      <div>
        <h3 className="text-sm font-semibold text-red-800 mb-2">{t("attendanceGrouping.absent", { count: absentMembers.length })}</h3>
        {absentMembers.length > 0 ? (
          <div className="bg-red-50 rounded-lg p-3 space-y-1">
            {absentMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-900">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">{t("attendanceGrouping.none")}</div>
        )}
      </div>

      {/* その他 */}
      <div>
        <h3 className="text-sm font-semibold text-yellow-800 mb-2">
          {t("attendanceGrouping.other", { count: otherMembers.length })}
        </h3>
        {otherMembers.length > 0 ? (
          <div className="bg-yellow-50 rounded-lg p-3 space-y-1">
            {otherMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-900">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">{t("attendanceGrouping.none")}</div>
        )}
      </div>

      {/* 未回答 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          {t("attendanceGrouping.unanswered", { count: unansweredMembers.length })}
        </h3>
        {unansweredMembers.length > 0 ? (
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            {unansweredMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-600">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">{t("attendanceGrouping.none")}</div>
        )}
      </div>
    </>
  );
}
