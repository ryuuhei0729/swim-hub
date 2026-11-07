"use client";

import React from "react";
import { CalendarProvider } from "../_providers/CalendarProvider";
import CalendarView from "./CalendarView";
import type { CalendarProps } from "@apps/shared/types/ui";
import type { CalendarItem, MonthlySummary } from "@apps/shared/types/ui";

/** 外から日付詳細を開く依頼。同じ日でも開き直せるよう seq を進めて渡す */
export interface OpenDayRequest {
  /** YYYY-MM-DD */
  date: string;
  seq: number;
}

interface CalendarContainerProps extends Omit<
  CalendarProps,
  "currentDate" | "onCurrentDateChange"
> {
  initialCalendarItems?: CalendarItem[];
  initialMonthlySummary?: MonthlySummary;
  refreshKey?: number;
  openDayRequest?: OpenDayRequest | null;
}

// カレンダーコンテナ（データ管理）
export default function CalendarContainer({
  initialCalendarItems,
  initialMonthlySummary,
  refreshKey,
  entries: _entries,
  ...props
}: CalendarContainerProps) {
  // 初期データの月を取得（サーバー側で取得したデータは現在の月のデータなので、現在の日付を使用）
  const initialDate = new Date();

  return (
    <CalendarProvider
      initialCalendarItems={initialCalendarItems}
      initialMonthlySummary={initialMonthlySummary}
      initialDate={initialDate}
      refreshKey={refreshKey}
    >
      <CalendarView {...props} />
    </CalendarProvider>
  );
}
