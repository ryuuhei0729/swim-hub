import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance } from "@swim-hub/shared/types/attendance";
import {
  buildMyAttendanceItems,
  effectiveAttendanceStatus,
  groupMyAttendanceByMonth,
  isUnansweredOpen,
} from "@/utils/teamAttendance";

const makeEvent = (
  id: string,
  date: string,
  attendance_status: "open" | "closed" | null = "open",
): TeamEvent => ({ id, type: "practice", date, attendance_status }) as unknown as TeamEvent;

const makeAttendance = (eventId: string, status: "present" | null): TeamAttendance =>
  ({ id: `att-${eventId}`, practice_id: eventId, competition_id: null, status }) as TeamAttendance;

describe("teamAttendance (mobile と同じ定義)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 28, 12, 0, 0)); // 2026-11-28 (ローカル)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("effectiveAttendanceStatus", () => {
    it("未設定 (null) は受付中として扱う", () => {
      expect(effectiveAttendanceStatus(makeEvent("e", "2026-12-01", null))).toBe("open");
    });

    it("DB の値をそのまま使う", () => {
      expect(effectiveAttendanceStatus(makeEvent("e", "2026-12-01", "closed"))).toBe("closed");
      expect(effectiveAttendanceStatus(makeEvent("e", "2026-12-01", "open"))).toBe("open");
    });

    it("過去のイベントは DB の値・未設定に関わらず締切", () => {
      expect(effectiveAttendanceStatus(makeEvent("e", "2026-11-27", "open"))).toBe("closed");
      expect(effectiveAttendanceStatus(makeEvent("e", "2026-11-27", null))).toBe("closed");
    });

    it("今日は過去扱いしない", () => {
      expect(effectiveAttendanceStatus(makeEvent("e", "2026-11-28", null))).toBe("open");
    });
  });

  it("未回答は「受付中で自分の回答が無い」 (締切は数えない、未設定は受付中)", () => {
    expect(isUnansweredOpen({ event: makeEvent("a", "2026-12-01", null), myAttendance: null })).toBe(
      true,
    );
    expect(
      isUnansweredOpen({ event: makeEvent("b", "2026-12-01", "closed"), myAttendance: null }),
    ).toBe(false);
    expect(
      isUnansweredOpen({
        event: makeEvent("c", "2026-12-01"),
        myAttendance: makeAttendance("c", "present"),
      }),
    ).toBe(false);
  });

  it("月ごとにまとめる。過去 (今日より前) のイベントは含めず、日付の近い順", () => {
    const items = buildMyAttendanceItems(
      [
        makeEvent("jan", "2027-01-05"),
        makeEvent("past", "2026-11-27"),
        makeEvent("today", "2026-11-28"),
        makeEvent("dec", "2026-12-10"),
      ],
      [makeAttendance("dec", "present")],
    );
    const groups = groupMyAttendanceByMonth(items);

    expect(groups.map((g) => g.key)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(groups[0]!.items.map((i) => i.event.id)).toEqual(["today"]);
    expect(groups[1]!.items[0]!.myAttendance?.status).toBe("present");
    expect(groups[2]).toMatchObject({ year: 2027, month: 1 });
  });
});
