/**
 * チームの出欠タブで使う、表示用の組み立て (React に依存しない純粋関数)
 *
 * 受付状態は「受付中」と「締切」の 2 つだけを扱う。
 * - DB の attendance_status が null (旧データの「未設定」) のときは受付中として扱う。
 *   新しい練習・大会は DB の既定値で受付中 ('open') として作られる
 * - イベント日が過ぎていれば DB の値に関わらず締切 (resolveAttendanceStatus と同じ境界 = 端末のローカル日付)
 *
 * 「未回答」は「受付中で、自分の回答 (status) が無いイベント」に統一する。
 * ホームのお知らせ・チームタブのバッジ (useUnansweredAttendancesQuery) も同じ定義。
 */
import { parseISO, isValid, format } from "date-fns";
import type { AttendanceStatus, AttendanceStatusType, TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance, TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import type { TeamMember } from "@apps/shared/utils/team";
import { resolveAttendanceStatus } from "@swim-hub/shared/utils/attendanceStatus";
import { isCompetitionDateInPast } from "@swim-hub/shared/utils/date";

/** 一覧の 1 行 = 1 イベントと、それに対する自分の回答 */
export interface AttendanceListItem {
  event: TeamEvent;
  /** 自分の出欠の行。イベント作成後に加入した人などは行が無い (null) */
  myAttendance: TeamAttendance | null;
}

export interface AttendanceMonthGroup {
  /** "yyyy-MM" */
  key: string;
  /** 月の 1 日 (見出しの表示用) */
  monthStart: Date;
  items: AttendanceListItem[];
}

/** 表示上の受付状態 (2 値)。null (未設定) は受付中に丸める */
export function effectiveAttendanceStatus(event: TeamEvent): AttendanceStatusType {
  return resolveAttendanceStatus(event.date, event.attendance_status) ?? "open";
}

export function isAttendanceClosed(event: TeamEvent): boolean {
  return effectiveAttendanceStatus(event) === "closed";
}

/** 受付中で、自分がまだ答えていないか */
export function isUnansweredOpen(item: AttendanceListItem): boolean {
  return !isAttendanceClosed(item.event) && !item.myAttendance?.status;
}

/** イベントの日付が今日より前か (今日は含まない) */
export function isPastEvent(event: TeamEvent): boolean {
  return isCompetitionDateInPast(event.date);
}

/** イベント ID (練習・大会のどちらか) */
export function attendanceEventId(attendance: Pick<TeamAttendance, "practice_id" | "competition_id">) {
  return attendance.practice_id ?? attendance.competition_id ?? null;
}

/** 自分の出欠の行をイベントに結びつける */
export function buildAttendanceItems(
  events: TeamEvent[],
  myAttendances: TeamAttendance[],
): AttendanceListItem[] {
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
export function groupAttendanceByMonth(items: AttendanceListItem[]): AttendanceMonthGroup[] {
  const groups = new Map<string, AttendanceMonthGroup>();
  for (const item of items) {
    if (isPastEvent(item.event)) continue;
    const date = parseISO(item.event.date);
    if (!isValid(date)) continue;
    const key = format(date, "yyyy-MM");
    let group = groups.get(key);
    if (!group) {
      group = { key, monthStart: new Date(date.getFullYear(), date.getMonth(), 1), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function countUnansweredOpen(items: AttendanceListItem[]): number {
  return items.filter(isUnansweredOpen).length;
}

/** モーダルで並べる 1 人分の出欠 */
export interface AttendancePerson {
  userId: string;
  name: string;
  status: AttendanceStatus | null;
  note: string;
  /** 出欠の行の ID。行が無い人 (未回答で行も無い) は null */
  attendanceId: string | null;
  isMe: boolean;
}

export interface AttendancePeopleGroups {
  present: AttendancePerson[];
  absent: AttendancePerson[];
  other: AttendancePerson[];
  unanswered: AttendancePerson[];
}

/**
 * イベントの出欠の行とチームの名簿から、出席・欠席・その他・未回答に分ける。
 * - 並びは名簿の順 (年上順)。名簿に居ない人 (脱退済みなど) の回答は名簿の後ろに付ける
 * - 自分は各グループの先頭に置く
 */
export function groupAttendancePeople(
  rows: TeamAttendanceWithDetails[],
  members: TeamMember[],
  myUserId: string | undefined,
): AttendancePeopleGroups {
  const rowByUser = new Map(rows.map((row) => [row.user_id, row]));
  const people: AttendancePerson[] = members.map((member) => {
    const row = rowByUser.get(member.id);
    return {
      userId: member.id,
      name: member.name,
      status: row?.status ?? null,
      note: row?.note ?? "",
      attendanceId: row?.id ?? null,
      isMe: member.id === myUserId,
    };
  });
  const memberIds = new Set(members.map((m) => m.id));
  for (const row of rows) {
    // 名簿に居ない人は、答えている場合だけ出す (未回答の元メンバーは並べない)
    if (memberIds.has(row.user_id) || !row.status) continue;
    people.push({
      userId: row.user_id,
      name: row.user?.name ?? "",
      status: row.status,
      note: row.note ?? "",
      attendanceId: row.id,
      isMe: row.user_id === myUserId,
    });
  }
  const ordered = [...people.filter((p) => p.isMe), ...people.filter((p) => !p.isMe)];
  return {
    present: ordered.filter((p) => p.status === "present"),
    absent: ordered.filter((p) => p.status === "absent"),
    other: ordered.filter((p) => p.status === "other"),
    unanswered: ordered.filter((p) => !p.status),
  };
}
