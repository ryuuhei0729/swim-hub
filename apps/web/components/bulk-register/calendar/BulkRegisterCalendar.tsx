"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { format, getDay, isToday } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import {
  buildMonthCells,
  competitionEndDate,
  findDraftCovering,
  toDateKey,
  weekdayLabels,
  type CompetitionDraft,
  type ExistingScheduleMap,
} from "@apps/shared/utils/bulkRegisterCalendar";

interface BulkRegisterCalendarProps {
  mode: "practice" | "competition";
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  existing: ExistingScheduleMap;
  /** 練習: 選択中の日付 */
  selectedDates: readonly string[];
  /** 大会: 追加予定の大会 (期間を帯で表示する) */
  drafts: readonly CompetitionDraft[];
  onPressDate: (date: string) => void;
  /** 練習のみ: 曜日見出しのクリック (その月の同じ曜日をまとめて選択) */
  onPressWeekday?: (weekday: number) => void;
}

const weekdayColor = (weekday: number): string =>
  weekday === 0 ? "text-red-500" : weekday === 6 ? "text-blue-500" : "text-gray-700";

/**
 * 一括登録のカレンダー (練習: 複数日選択 / 大会: 期間の帯表示)。
 * mobile components/teams/bulkRegister/BulkRegisterCalendar.tsx と同じ表示・操作にする。
 * 登録済みの練習は緑、大会は青の点で示す。
 */
export default function BulkRegisterCalendar({
  mode,
  month,
  onPrevMonth,
  onNextMonth,
  existing,
  selectedDates,
  drafts,
  onPressDate,
  onPressWeekday,
}: BulkRegisterCalendarProps) {
  const t = useTranslations("teams.mobile.bulkRegister");
  const tDatePicker = useTranslations("common.datePicker");
  const locale = useLocale() as SupportedLocale;
  const weekdays = weekdayLabels(locale);
  const selected = new Set(selectedDates);
  const cells = buildMonthCells(month);
  const isPractice = mode === "practice";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          aria-label={tDatePicker("prevMonth")}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-gray-900">{formatDate(month, "yearMonth", locale)}</p>
        <button
          type="button"
          onClick={onNextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          aria-label={tDatePicker("nextMonth")}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {weekdays.map((w, i) =>
          isPractice && onPressWeekday ? (
            <button
              key={i}
              type="button"
              onClick={() => onPressWeekday(i)}
              className={`py-1 text-center text-xs font-bold underline decoration-dotted underline-offset-2 hover:bg-gray-50 rounded ${weekdayColor(i)}`}
              aria-label={t("selectWeekdayAria", { weekday: w })}
            >
              {w}
            </button>
          ) : (
            <div key={i} className={`py-1 text-center text-xs font-bold ${weekdayColor(i)}`}>
              {w}
            </div>
          ),
        )}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const key = toDateKey(day);
          const ex = existing[key];
          const isSelected = isPractice && selected.has(key);
          const draft = !isPractice ? findDraftCovering(drafts, key) : undefined;
          const isDraftStart = !!draft && draft.date === key;
          const isDraftEnd = !!draft && competitionEndDate(draft.date, draft.days) === key;
          const weekday = getDay(day);

          const fillClass = isSelected
            ? "bg-green-600 text-white rounded-lg"
            : draft
              ? `bg-blue-100 text-blue-800 ${isDraftStart ? "rounded-l-lg" : ""} ${isDraftEnd ? "rounded-r-lg" : ""}`
              : `rounded-lg hover:bg-gray-100 ${weekdayColor(weekday)}`;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onPressDate(key)}
              aria-pressed={isSelected || !!draft}
              aria-label={formatDate(day, "long", locale)}
              data-testid={`bulk-calendar-day-${key}`}
              className={`flex h-11 flex-col items-center justify-center ${fillClass}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday(day) && !isSelected ? "ring-1 ring-gray-400" : ""
                }`}
              >
                {format(day, "d")}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {ex?.practice && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-green-500"}`}
                    data-testid={`bulk-calendar-existing-practice-${key}`}
                  />
                )}
                {ex?.competition && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`}
                    data-testid={`bulk-calendar-existing-competition-${key}`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <LegendItem colorClass="bg-green-500" label={t("legendExistingPractice")} />
        <LegendItem colorClass="bg-blue-500" label={t("legendExistingCompetition")} />
        {isPractice ? (
          <LegendItem colorClass="bg-green-600" label={t("legendSelected")} />
        ) : (
          <LegendItem colorClass="bg-blue-600" label={t("legendNewCompetition")} />
        )}
      </div>
    </div>
  );
}

function LegendItem({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      {label}
    </span>
  );
}
