"use client";

import React, { useState, useMemo } from "react";
import { addMonths, format } from "date-fns";
import { useTranslations } from "next-intl";
import type { MyAttendanceItem, MyAttendanceMonthGroup } from "@/utils/teamAttendance";
import type { MyAnswerChange } from "../hooks/useMyAttendanceSaver";
import { AttendanceAnswerRow } from "./AttendanceAnswerRow";

interface RecentAttendanceProps {
  /** 月ごとにまとめた一覧 (過去のイベントは含まない) */
  months: MyAttendanceMonthGroup[];
  onSave: (item: MyAttendanceItem, change: MyAnswerChange) => void;
  onOpen: (item: MyAttendanceItem) => void;
}

/** 直近の出欠 (今月・来月)。今月は今日以降のイベントだけ。押した時点で保存する */
export const RecentAttendance = React.memo(({ months, onSave, onOpen }: RecentAttendanceProps) => {
  const t = useTranslations("teams");
  const [selectedTab, setSelectedTab] = useState<"current" | "next">("current");

  const items = useMemo(() => {
    const now = new Date();
    const key = format(selectedTab === "current" ? now : addMonths(now, 1), "yyyy-MM");
    return months.find((month) => month.key === key)?.items ?? [];
  }, [months, selectedTab]);

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("recentAttendance.title")}</h2>

      <div className="flex border-b border-gray-200 mb-4">
        {(["current", "next"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "current" ? t("recentAttendance.thisMonth") : t("recentAttendance.nextMonth")}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">{t("recentAttendance.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
          {items.map((item) => (
            <AttendanceAnswerRow
              key={`${item.event.type}-${item.event.id}`}
              item={item}
              onSave={onSave}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
});

RecentAttendance.displayName = "RecentAttendance";
