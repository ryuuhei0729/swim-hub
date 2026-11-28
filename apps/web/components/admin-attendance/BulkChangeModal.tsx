"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import { TeamEvent } from "@swim-hub/shared/types";
import { isValid, parseISO } from "date-fns";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import type { EventGroupedByMonth } from "@/types/admin-attendance";
import { effectiveAttendanceStatus } from "@/utils/teamAttendance";

interface BulkChangeModalProps {
  isOpen: boolean;
  events: TeamEvent[];
  onClose: () => void;
  /** 選んだイベントの受付状態をまとめて変える。成功したら true */
  onBulkUpdate: (
    selectedEventIds: Set<string>,
    status: "open" | "closed",
  ) => Promise<boolean>;
}

function groupEventsByMonth(events: TeamEvent[]): EventGroupedByMonth[] {
  const grouped: Record<string, EventGroupedByMonth> = {};

  events.forEach((event) => {
    const date = parseISO(event.date);
    if (!isValid(date)) return;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${month}`;

    if (!grouped[key]) {
      grouped[key] = {
        year,
        month,
        events: [],
      };
    }

    grouped[key].events.push(event);
  });

  return Object.values(grouped).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

/**
 * 受付状態をまとめて変える。mobile と同じく対象は 1 件ずつ選ぶ (月ごとにまとめて選ぶ操作は無い)。
 * 月の見出しは並びの区切りとしてだけ出す
 */
export function BulkChangeModal({
  isOpen,
  events,
  onClose,
  onBulkUpdate,
}: BulkChangeModalProps) {
  const t = useTranslations("teamsAdmin");
  const locale = useLocale() as SupportedLocale;
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    new Set(),
  );
  const [updating, setUpdating] = useState(false);

  const groupedEvents = groupEventsByMonth(events);

  const handleToggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const getMonthLabel = (year: number, month: number) => {
    return formatDate(new Date(year, month - 1, 1), "yearMonth", locale);
  };

  const getDayLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    return isValid(date) ? formatDate(date, "dayWithWeekday", locale) : "-";
  };

  const handleUpdate = async (status: "open" | "closed") => {
    setUpdating(true);
    try {
      const ok = await onBulkUpdate(selectedEventIds, status);
      if (ok) setSelectedEventIds(new Set());
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = () => {
    setSelectedEventIds(new Set());
    onClose();
  };

  const isDisabled = selectedEventIds.size === 0 || updating;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("bulkChange.title")}
      size="xl"
    >
      <div className="space-y-6">
        {groupedEvents.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-600">{t("bulkChange.empty")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {groupedEvents.map((group) => (
                <div key={`${group.year}-${group.month}`} className="space-y-2">
                  {/* 月の見出し (区切りとしてだけ出す) */}
                  <div className="pb-2 border-b border-gray-200">
                    <h3 className="text-base font-medium text-gray-900">
                      {getMonthLabel(group.year, group.month)}
                    </h3>
                  </div>

                  {/* 日付リスト */}
                  <div className="space-y-1">
                    {group.events.map((event) => {
                      const isSelected = selectedEventIds.has(event.id);
                      // 未設定は受付中として扱う
                      const currentStatus = effectiveAttendanceStatus(event);
                      const statusLabel =
                        currentStatus === "open"
                          ? t("bulkChange.statusOpen")
                          : t("bulkChange.statusClosed");
                      const statusColor =
                        currentStatus === "open"
                          ? "text-blue-600"
                          : "text-red-600";

                      return (
                        <label
                          key={event.id}
                          className="flex items-start gap-2 py-1 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleEvent(event.id)}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900">
                                {getDayLabel(event.date)}
                              </span>
                              {event.type === "competition" && (
                                <span className="text-xs text-purple-600">
                                  {t("bulkChange.competitionLabel")}
                                </span>
                              )}
                              <span className="text-sm text-gray-700">
                                {event.type === "competition"
                                  ? event.title ||
                                    t(
                                      "adminAttendance.eventDefault.competition",
                                    )
                                  : event.title ||
                                    t("adminAttendance.eventDefault.practice")}
                              </span>
                              {event.place && (
                                <span className="text-xs text-gray-600">
                                  @{event.place}
                                </span>
                              )}
                              <span
                                className={`text-xs font-medium ${statusColor}`}
                              >
                                [{statusLabel}]
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 一括操作ボタン */}
            <div className="flex justify-center gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => handleUpdate("open")}
                type="button"
                disabled={isDisabled}
                className={`px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ${
                  isDisabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {t("bulkChange.openButton")}
              </button>
              <button
                onClick={() => handleUpdate("closed")}
                type="button"
                disabled={isDisabled}
                className={`px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors ${
                  isDisabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {t("bulkChange.closedButton")}
              </button>
            </div>
          </>
        )}
      </div>
    </BaseModal>
  );
}
