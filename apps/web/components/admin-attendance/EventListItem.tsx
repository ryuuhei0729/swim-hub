"use client";

import React, { memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { parseISO, isValid } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { TeamEvent } from "@swim-hub/shared/types";
import { effectiveAttendanceStatus } from "@/utils/teamAttendance";

interface EventListItemProps {
  event: TeamEvent;
  isSaving: boolean;
  /** 受付中 / 締切 を選んだとき (確認して即保存するのは呼び出し側) */
  onStatusChange: (event: TeamEvent, status: "open" | "closed") => void;
  onClick: () => void;
}

/**
 * イベントリストアイテム（React.memoで再レンダリング最適化）
 * 受付状態は選んだ時点で保存する (保存ボタンは無い)。未設定は受付中として表示する
 */
export const EventListItem = memo(function EventListItem({
  event,
  isSaving,
  onStatusChange,
  onClick,
}: EventListItemProps) {
  const t = useTranslations("teamsAdmin");
  const locale = useLocale();
  const formatEventDate = (dateStr: string) => {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) {
      return "-";
    }
    return formatDate(toZonedTime(parsed, "Asia/Tokyo"), "shortWithWeekday", locale as SupportedLocale);
  };

  const currentStatus = effectiveAttendanceStatus(event);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.key === " ") {
        e.preventDefault();
      }
      onClick?.();
    }
  };

  return (
    <div
      className={`p-4 hover:bg-gray-50 cursor-pointer ${
        event.type === "competition" ? "bg-purple-50" : "bg-white"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={t("adminAttendance.eventDetailAriaLabel", { date: formatEventDate(event.date), title: event.type === "competition" ? event.title || t("adminAttendance.eventDefault.competition") : event.title || t("adminAttendance.eventDefault.practice") })}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between gap-4">
        {/* 左側：日付、タイトル、場所 */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-base font-bold text-gray-900 whitespace-nowrap">
            {formatEventDate(event.date)}
          </span>
          <h3 className="text-sm font-medium text-gray-900">
            {event.type === "competition" ? event.title || t("adminAttendance.eventDefault.competition") : event.title || t("adminAttendance.eventDefault.practice")}
          </h3>
          {event.place && <span className="text-xs text-gray-600">@{event.place}</span>}
        </div>

        {/* 右側：受付状態の選択 (選んだら確認のうえ即保存) */}
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {(["open", "closed"] as const).map((status) => {
            const selected = currentStatus === status;
            const activeClass =
              status === "open"
                ? "bg-blue-100 text-blue-800 border-blue-500"
                : "bg-red-100 text-red-800 border-red-500";
            const hoverClass = status === "open" ? "hover:bg-blue-50" : "hover:bg-red-50";
            return (
              <button
                key={status}
                type="button"
                onClick={() => {
                  if (!selected) onStatusChange(event, status);
                }}
                disabled={isSaving}
                aria-pressed={selected}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border-2 ${
                  selected ? activeClass : `bg-gray-100 text-gray-600 border-transparent ${hoverClass}`
                } ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {t(status === "open" ? "eventListItem.openButton" : "eventListItem.closedButton")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
