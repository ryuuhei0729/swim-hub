"use client";

import React from "react";
import { CalendarProvider } from "../_providers/CalendarProvider";
import CalendarView from "./CalendarView";
import type { CalendarProps } from "@apps/shared/types/ui";

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
  /**
   * 最初に表示する月 ("yyyy-MM")。サーバーがこの月のカレンダーデータを prefetch して
   * HydrationBoundary で渡している (SSR と CSR のクエリキーを一致させるため、そのまま使う)
   */
  initialMonth?: string;
  /** サーバーの描画ごとの ID (CalendarProvider の serverRenderId を参照) */
  serverRenderId?: string;
  refreshKey?: number;
  openDayRequest?: OpenDayRequest | null;
}

// カレンダーコンテナ（データ管理）
export default function CalendarContainer({
  initialMonth,
  serverRenderId,
  refreshKey,
  entries: _entries,
  ...props
}: CalendarContainerProps) {
  return (
    <CalendarProvider
      initialMonth={initialMonth}
      refreshKey={refreshKey}
      serverRenderId={serverRenderId}
    >
      <CalendarView {...props} />
    </CalendarProvider>
  );
}
