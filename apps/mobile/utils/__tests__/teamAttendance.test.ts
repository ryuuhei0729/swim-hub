// =============================================================================
// teamAttendance.test.ts - チームの出欠タブの表示の組み立て
// =============================================================================
//   [TA-1] 受付状態は 受付中 / 締切 の 2 つ。null (未設定) は受付中、過去日は DB の値に関わらず締切
//   [TA-2] 未回答 = 受付中で自分の status が無いもの (締切の未回答は数えない)
//   [TA-3] 自分の出欠の行をイベントに結びつけ、日付順に並べる (行が無いイベントは null)
//   [TA-4] 月ごとにまとめる。過去 (今日より前) は含めない。今日は過去に入れない
//   [TA-5] 全員の出欠: 名簿の順で 出席・欠席・その他・未回答 に分け、自分は先頭。
//          名簿に居ない人は答えている場合だけ後ろに付ける

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance, TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";

import {
  buildAttendanceItems,
  countUnansweredOpen,
  effectiveAttendanceStatus,
  groupAttendanceByMonth,
  groupAttendancePeople,
  isUnansweredOpen,
} from "../teamAttendance";

const practice = (id: string, date: string, attendance_status: "open" | "closed" | null = "open") =>
  ({ id, date, attendance_status, type: "practice" }) as TeamEvent;
const competition = (id: string, date: string, attendance_status: "open" | "closed" | null = "open") =>
  ({ id, date, attendance_status, type: "competition" }) as TeamEvent;
const answer = (
  eventId: string,
  status: TeamAttendance["status"],
  kind: "practice" | "competition" = "practice",
) =>
  ({
    id: `att-${eventId}`,
    user_id: "me",
    practice_id: kind === "practice" ? eventId : null,
    competition_id: kind === "competition" ? eventId : null,
    status,
    note: null,
  }) as TeamAttendance;

describe("teamAttendance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 9, 0, 0)); // 2026-11-14 (ローカル)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("[TA-1] null は受付中、過去日は締切、それ以外は DB の値", () => {
    expect(effectiveAttendanceStatus(practice("a", "2026-11-20", null))).toBe("open");
    expect(effectiveAttendanceStatus(practice("b", "2026-11-20", "closed"))).toBe("closed");
    expect(effectiveAttendanceStatus(practice("c", "2026-11-13", "open"))).toBe("closed");
    expect(effectiveAttendanceStatus(practice("d", "2026-11-14", "open"))).toBe("open");
  });

  it("[TA-2] 未回答は受付中で自分の status が無いものだけ", () => {
    const items = buildAttendanceItems(
      [
        practice("open-unanswered", "2026-11-20"),
        practice("open-answered", "2026-11-21"),
        practice("open-null-row", "2026-11-22"),
        practice("closed-unanswered", "2026-11-23", "closed"),
        practice("past-unanswered", "2026-11-10"),
      ],
      [answer("open-answered", "present"), answer("open-null-row", null)],
    );
    expect(items.filter(isUnansweredOpen).map((i) => i.event.id)).toEqual([
      "open-unanswered",
      "open-null-row",
    ]);
    expect(countUnansweredOpen(items)).toBe(2);
  });

  it("[TA-3] 自分の行を練習・大会それぞれに結びつけ、日付順に並べる", () => {
    const items = buildAttendanceItems(
      [competition("c1", "2026-11-25"), practice("p1", "2026-11-18"), practice("p2", "2026-11-30")],
      [answer("c1", "absent", "competition"), answer("p1", "present")],
    );
    expect(items.map((i) => [i.event.id, i.myAttendance?.status ?? null])).toEqual([
      ["p1", "present"],
      ["c1", "absent"],
      ["p2", null],
    ]);
  });

  it("[TA-4] 月ごとにまとめ、過去は含めない (今日は過去に入れない)", () => {
    const items = buildAttendanceItems(
      [
        practice("oct", "2026-10-30"),
        practice("yesterday", "2026-11-13"),
        practice("today", "2026-11-14"),
        practice("dec", "2026-12-02"),
      ],
      [],
    );
    expect(groupAttendanceByMonth(items).map((g) => [g.key, g.items.map((i) => i.event.id)])).toEqual([
      ["2026-11", ["today"]],
      ["2026-12", ["dec"]],
    ]);
  });

  it("[TA-5] 全員の出欠を名簿の順に分け、自分を先頭、名簿外は答えた人だけ後ろに付ける", () => {
    const row = (userId: string, status: TeamAttendance["status"], note: string | null = null, name = userId) =>
      ({
        id: `row-${userId}`,
        user_id: userId,
        status,
        note,
        user: { name },
      }) as TeamAttendanceWithDetails;
    const groups = groupAttendancePeople(
      [
        row("u1", "present"),
        row("me", "present", "30分遅れます"),
        row("u2", "absent", "試験期間"),
        row("u3", null),
        row("left-answered", "other", null, "元メンバー"),
        row("left-unanswered", null),
      ],
      [
        { id: "u1", name: "田中" },
        { id: "me", name: "自分" },
        { id: "u2", name: "佐藤" },
        { id: "u3", name: "鈴木" },
        { id: "u4", name: "高橋" },
      ],
      "me",
    );
    expect(groups.present.map((p) => [p.name, p.isMe, p.note])).toEqual([
      ["自分", true, "30分遅れます"],
      ["田中", false, ""],
    ]);
    expect(groups.absent.map((p) => [p.name, p.note])).toEqual([["佐藤", "試験期間"]]);
    expect(groups.other.map((p) => p.name)).toEqual(["元メンバー"]);
    // 行が無い人 (高橋) も未回答。行の ID が無いことで、管理者が直すときに新しく作れる
    expect(groups.unanswered.map((p) => [p.name, p.attendanceId])).toEqual([
      ["鈴木", "row-u3"],
      ["高橋", null],
    ]);
  });
});
