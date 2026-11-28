"use client";

import React from "react";
import { useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import type { MyAttendanceItem } from "@/utils/teamAttendance";
import type { MyAnswerChange } from "../hooks/useMyAttendanceSaver";
import { AttendanceAnswerRow } from "./AttendanceAnswerRow";

interface MonthDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** その月の今日以降のイベント */
  items: MyAttendanceItem[];
  onSave: (item: MyAttendanceItem, change: MyAnswerChange) => void;
  onEventClick: (item: MyAttendanceItem) => void;
}

/** 月の詳細。出席 / 欠席 / その他 は押した時点で保存する (まとめて保存のボタンは無い) */
export const MonthDetailModal = React.memo(
  ({ isOpen, onClose, title, items, onSave, onEventClick }: MonthDetailModalProps) => {
    const t = useTranslations("teams");

    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title={title} size="xl">
        {items.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-600">{t("monthList.empty")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
            {items.map((item) => (
              <AttendanceAnswerRow
                key={`${item.event.type}-${item.event.id}`}
                item={item}
                onSave={onSave}
                onOpen={onEventClick}
              />
            ))}
          </div>
        )}
      </BaseModal>
    );
  },
);

MonthDetailModal.displayName = "MonthDetailModal";
