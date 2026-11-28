"use client";

import React from "react";
import { isUnansweredOpen, type MyAttendanceMonthGroup } from "@/utils/teamAttendance";
import { StatusBadge } from "./StatusBadge";
import { useTranslations } from "next-intl";

interface MonthListProps {
  months: MyAttendanceMonthGroup[];
  onMonthClick: (month: MyAttendanceMonthGroup) => void;
}

/**
 * 月のバッジ。受付中で未回答のイベントがあれば「未回答」、全部答えていれば「回答済み」。
 * 締切で答えていないイベントだけが残っている月はバッジを出さない (「未回答」は受付中で未回答に統一)
 */
function monthBadgeStatus(month: MyAttendanceMonthGroup): "has_unanswered" | "all_answered" | null {
  if (month.items.some(isUnansweredOpen)) return "has_unanswered";
  if (month.items.every((item) => !!item.myAttendance?.status)) return "all_answered";
  return null;
}

export const MonthList = React.memo(({ months, onMonthClick }: MonthListProps) => {
  const t = useTranslations("teams");

  if (months.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-600">{t("monthList.empty")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {months.map((month) => (
        <button
          key={month.key}
          type="button"
          onClick={() => onMonthClick(month)}
          className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all text-left"
        >
          <span className="text-sm font-medium text-gray-900">
            {t("attendance.monthLabel", { year: month.year, month: month.month })}
          </span>
          <StatusBadge status={monthBadgeStatus(month)} />
        </button>
      ))}
    </div>
  );
});

MonthList.displayName = "MonthList";
