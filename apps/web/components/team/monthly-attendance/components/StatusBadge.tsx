"use client";

import React from "react";
import { useTranslations } from "next-intl";

interface StatusBadgeProps {
  status: "has_unanswered" | "all_answered" | null;
}

export const StatusBadge = React.memo(({ status }: StatusBadgeProps) => {
  const t = useTranslations("teams");

  if (status === null) return null;

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
        status === "has_unanswered"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-green-100 text-green-800"
      }`}
    >
      {status === "has_unanswered" ? t("attendanceStatus.unknown") : t("attendanceStatus.present")}
    </span>
  );
});

StatusBadge.displayName = "StatusBadge";

/**
 * 出欠の受付状態のバッジ。受付状態は 受付中 / 締切 の 2 つだけ
 * (未設定は受付中として扱う。effectiveAttendanceStatus で丸めてから渡す)
 */
export function AttendanceStatusBadge({ status }: { status: "open" | "closed" }) {
  const t = useTranslations("teams");
  return status === "open" ? (
    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">
      {t("attendance.statusOpen")}
    </span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800">
      {t("attendance.statusClosed")}
    </span>
  );
}
