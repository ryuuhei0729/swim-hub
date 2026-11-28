"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import type { AttendanceStatus } from "@swim-hub/shared/types";
import { formatDate } from "@apps/shared/utils/date";
import { effectiveAttendanceStatus, type MyAttendanceItem } from "@/utils/teamAttendance";
import { ATTENDANCE_NOTE_MAX_LENGTH, type MyAnswerChange } from "../hooks/useMyAttendanceSaver";
import { AttendanceStatusBadge } from "./StatusBadge";

interface AttendanceAnswerRowProps {
  item: MyAttendanceItem;
  /** 押した時点で保存する */
  onSave: (item: MyAttendanceItem, change: MyAnswerChange) => void;
  /** 行を押したとき (全員の出欠を開く)。無ければ行は押せない */
  onOpen?: (item: MyAttendanceItem) => void;
}

const ANSWER_BUTTONS: ReadonlyArray<{
  status: AttendanceStatus;
  labelKey: "attendanceList.statusPresent" | "attendanceList.statusAbsent" | "attendanceList.statusOther";
  activeClass: string;
  hoverClass: string;
}> = [
  {
    status: "present",
    labelKey: "attendanceList.statusPresent",
    activeClass: "bg-green-100 text-green-800 border-green-500",
    hoverClass: "hover:bg-green-50",
  },
  {
    status: "absent",
    labelKey: "attendanceList.statusAbsent",
    activeClass: "bg-red-100 text-red-800 border-red-500",
    hoverClass: "hover:bg-red-50",
  },
  {
    status: "other",
    labelKey: "attendanceList.statusOther",
    activeClass: "bg-yellow-100 text-yellow-800 border-yellow-500",
    hoverClass: "hover:bg-yellow-50",
  },
];

/**
 * 自分の出欠の 1 行 (直近の出欠・月の詳細で共通)。
 * 出席 / 欠席 / その他 は押した時点で保存する。備考は入力欄から離れたとき・Enter で保存する。
 */
export const AttendanceAnswerRow = React.memo(
  ({ item, onSave, onOpen }: AttendanceAnswerRowProps) => {
    const t = useTranslations("teams");
    const { event, myAttendance } = item;
    const savedStatus = myAttendance?.status ?? null;
    const savedNote = myAttendance?.note ?? "";

    // 備考の入力中の値。保存された備考が変わったら (締切後編集の印が付いた・失敗して戻った等) 合わせる
    const [draftNote, setDraftNote] = useState(savedNote);
    const [prevSavedNote, setPrevSavedNote] = useState(savedNote);
    if (prevSavedNote !== savedNote) {
      setPrevSavedNote(savedNote);
      setDraftNote(savedNote);
    }

    const title =
      event.type === "competition" ? (event.title ?? "") : t("monthDetail.practiceLabel");

    const handleAnswer = (status: AttendanceStatus) => {
      if (savedStatus === status) return;
      onSave(item, { status, note: draftNote });
    };

    const commitNote = () => {
      if (draftNote.trim() === savedNote.trim()) return;
      onSave(item, { status: savedStatus, note: draftNote });
    };

    const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen?.(item);
      }
    };

    const interactiveProps = onOpen
      ? {
          onClick: () => onOpen(item),
          onKeyDown: handleRowKeyDown,
          tabIndex: 0,
          role: "button" as const,
          "aria-label": t("monthDetail.openAttendanceAriaLabel", {
            date: formatDate(event.date, "shortWithWeekday"),
            title,
          }),
        }
      : {};

    return (
      <div
        className={`p-4 ${onOpen ? "hover:bg-gray-50 cursor-pointer" : ""} ${
          event.type === "competition" ? "bg-purple-50" : "bg-white"
        }`}
        {...interactiveProps}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
              {formatDate(event.date, "shortWithWeekday")}
            </span>
            <h3 className="text-xs font-medium text-gray-900">{title}</h3>
            {event.place && <span className="text-xs text-gray-600">@{event.place}</span>}
          </div>

          <div
            className="flex flex-col items-end gap-1.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <AttendanceStatusBadge status={effectiveAttendanceStatus(event)} />
            <div className="flex items-center gap-1.5">
              {ANSWER_BUTTONS.map((button) => (
                <button
                  key={button.status}
                  type="button"
                  onClick={() => handleAnswer(button.status)}
                  aria-pressed={savedStatus === button.status}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors border-2 ${
                    savedStatus === button.status
                      ? button.activeClass
                      : `bg-gray-100 text-gray-600 border-transparent ${button.hoverClass}`
                  }`}
                >
                  {t(button.labelKey)}
                </button>
              ))}
              <input
                type="text"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value.slice(0, ATTENDANCE_NOTE_MAX_LENGTH))}
                onBlur={(e) => {
                  // 同じ行の出席 / 欠席 / その他 へ移ったときは、そちらの保存で備考も一緒に送る
                  const next = e.relatedTarget;
                  if (next instanceof Node && e.currentTarget.parentElement?.contains(next)) return;
                  commitNote();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder={t("monthDetail.notePlaceholder")}
                maxLength={ATTENDANCE_NOTE_MAX_LENGTH}
                aria-label={t("monthDetail.notePlaceholder")}
                className="w-60 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

AttendanceAnswerRow.displayName = "AttendanceAnswerRow";
