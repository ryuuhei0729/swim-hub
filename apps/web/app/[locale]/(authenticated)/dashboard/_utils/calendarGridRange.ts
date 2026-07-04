import { startOfMonth, endOfMonth, getDay, format } from "date-fns";

/**
 * カレンダーグリッドの可視範囲（日曜起点）を計算する。
 * CalendarView.tsx の calendarDays 計算と完全に一致するアルゴリズム。
 *
 * startDate = monthStart - getDay(monthStart) 日
 * endDate   = monthEnd  + (6 - getDay(monthEnd)) 日
 */
export function getCalendarGridRange(date: Date): { startDate: string; endDate: string } {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - getDay(monthStart));

  const calendarEnd = new Date(monthEnd);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - getDay(monthEnd)));

  return {
    startDate: format(calendarStart, "yyyy-MM-dd"),
    endDate: format(calendarEnd, "yyyy-MM-dd"),
  };
}
