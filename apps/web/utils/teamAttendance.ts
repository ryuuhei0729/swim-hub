/**
 * チームの出欠の表示用の判定と組み立て (React に依存しない純粋関数)
 *
 * mobile (apps/mobile/utils/teamAttendance.ts) と同じ定義にそろえている。
 * - 受付状態は「受付中」と「締切」の 2 つだけを扱う。DB の attendance_status が null
 *   (旧データの「未設定」) のときは受付中として扱う。新しい練習・大会は DB の既定値で
 *   受付中 ('open') として作られる
 * - イベント日が過ぎていれば DB の値に関わらず締切 (resolveAttendanceStatus と同じ境界 = 端末のローカル日付)
 * - 「未回答」は「受付中で、自分の回答 (status) が無いイベント」
 */
import { format, isValid, parseISO } from "date-fns";
import type { AttendanceStatusType, TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance } from "@swim-hub/shared/types/attendance";
import { resolveAttendanceStatus } from "@swim-hub/shared/utils/attendanceStatus";
import { isCompetitionDateInPast } from "@swim-hub/shared/utils/date";

/** 一覧の 1 行 = 1 イベントと、それに対する自分の回答 */
export interface MyAttendanceItem {
  event: TeamEvent;
  /** 自分の出欠の行。イベント作成後に加入した人などは行が無い (null) */
  myAttendance: TeamAttendance | null;
}

export interface MyAttendanceMonthGroup {
  /** "yyyy-MM" */
  key: string;
  year: number;
  /** 1〜12 */
  month: number;
  items: MyAttendanceItem[];
}

/** 表示上の受付状態 (2 値)。null (未設定) は受付中に丸める */
export function effectiveAttendanceStatus(
  event: Pick<TeamEvent, "date" | "attendance_status">,
): AttendanceStatusType {
  return resolveAttendanceStatus(event.date, event.attendance_status) ?? "open";
}

export function isAttendanceClosed(event: Pick<TeamEvent, "date" | "attendance_status">): boolean {
  return effectiveAttendanceStatus(event) === "closed";
}

/** 受付中で、自分がまだ答えていないか */
export function isUnansweredOpen(item: MyAttendanceItem): boolean {
  return !isAttendanceClosed(item.event) && !item.myAttendance?.status;
}

/** イベントの日付が今日より前か (今日は含まない) */
export function isPastEvent(event: Pick<TeamEvent, "date">): boolean {
  return isCompetitionDateInPast(event.date);
}

/** イベント ID (練習・大会のどちらか) */
export function attendanceEventId(
  attendance: Pick<TeamAttendance, "practice_id" | "competition_id">,
): string | null {
  return attendance.practice_id ?? attendance.competition_id ?? null;
}

/** 自分の出欠の行をイベントに結びつける (日付の近い順) */
export function buildMyAttendanceItems(
  events: TeamEvent[],
  myAttendances: TeamAttendance[],
): MyAttendanceItem[] {
  const byEventId = new Map<string, TeamAttendance>();
  for (const attendance of myAttendances) {
    const eventId = attendanceEventId(attendance);
    if (eventId) byEventId.set(eventId, attendance);
  }
  return [...events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((event) => ({ event, myAttendance: byEventId.get(event.id) ?? null }));
}

/** 一覧を月ごとにまとめる。過去 (今日より前) のイベントは含めない。日付の近い順 */
export function groupMyAttendanceByMonth(items: MyAttendanceItem[]): MyAttendanceMonthGroup[] {
  const groups = new Map<string, MyAttendanceMonthGroup>();
  for (const item of items) {
    if (isPastEvent(item.event)) continue;
    const date = parseISO(item.event.date);
    if (!isValid(date)) continue;
    const key = format(date, "yyyy-MM");
    let group = groups.get(key);
    if (!group) {
      group = { key, year: date.getFullYear(), month: date.getMonth() + 1, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
