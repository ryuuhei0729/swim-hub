/**
 * resolveAttendanceStatus 単体テスト
 *
 * 契約:
 *   resolveAttendanceStatus(date, attendanceStatus) は「イベント日が過去なら
 *   DB 値に関わらず closed、それ以外は DB 値そのまま (null は null のまま)」を
 *   返す純粋関数。DB 値は書き換えない = 表示派生のみ。
 *
 * トートロジー回避方針 (entryStatus.test.ts と同型):
 * - 日付は固定日付のハードコードではなく vi.useFakeTimers で固定した「現在」
 *   からの相対 (前日/当日/翌日) で生成する。
 * - `isCompetitionDateInPast` (既存関数) との整合性をクロスチェックし、独自の
 *   日付比較ロジックを新設していないことを behavior レベルで担保する。
 * - 境界が端末ローカル日付であること (DB の UTC-12 ジョブでは代替不能な要件) を
 *   TZ を差し替えた fake timer で確認する。
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, format, subDays } from "date-fns";
import { isCompetitionDateInPast } from "../../utils/date";
import { resolveAttendanceStatus } from "../../utils/attendanceStatus";
import type { AttendanceStatusType } from "../../types/common";

const DB_VALUES: (AttendanceStatusType | null | undefined)[] = [
  "open",
  "closed",
  null,
  undefined,
];

describe("resolveAttendanceStatus", () => {
  const FIXED_NOW = new Date("2026-03-15T12:00:00");

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  const yesterday = iso(subDays(FIXED_NOW, 1));
  const today = iso(FIXED_NOW);
  const tomorrow = iso(addDays(FIXED_NOW, 1));

  describe("過去日", () => {
    it.each(DB_VALUES)("DB値=%s でも closed を返す", (dbValue) => {
      expect(resolveAttendanceStatus(yesterday, dbValue)).toBe("closed");
    });

    it("1年前でも closed を返す", () => {
      expect(resolveAttendanceStatus(iso(subDays(FIXED_NOW, 365)), "open")).toBe("closed");
    });
  });

  describe("当日・未来日", () => {
    it.each([
      ["当日", () => today],
      ["翌日", () => tomorrow],
    ])("%s は DB の open をそのまま返す (今日は締切にしない)", (_label, getDate) => {
      expect(resolveAttendanceStatus(getDate(), "open")).toBe("open");
    });

    it.each([
      ["当日", () => today],
      ["翌日", () => tomorrow],
    ])("%s は DB の closed をそのまま返す (管理者の手動締切を尊重)", (_label, getDate) => {
      expect(resolveAttendanceStatus(getDate(), "closed")).toBe("closed");
    });

    it.each([
      ["当日", () => today],
      ["翌日", () => tomorrow],
    ])("%s の未設定 (null) は null のまま返す", (_label, getDate) => {
      expect(resolveAttendanceStatus(getDate(), null)).toBeNull();
    });

    it("undefined は null に正規化して返す (未設定表示に寄せる)", () => {
      expect(resolveAttendanceStatus(tomorrow, undefined)).toBeNull();
    });
  });

  describe("日付が無い/不正な場合", () => {
    it.each([null, undefined, "", "not-a-date"])(
      "date=%s は過去扱いせず DB 値を返す",
      (badDate) => {
        expect(resolveAttendanceStatus(badDate as string | null | undefined, "open")).toBe("open");
      },
    );
  });

  describe("isCompetitionDateInPast との整合", () => {
    it.each([
      () => iso(subDays(FIXED_NOW, 2)),
      () => yesterday,
      () => today,
      () => tomorrow,
      () => iso(addDays(FIXED_NOW, 2)),
    ])("既存の過去判定と結論が一致する", (getDate) => {
      const date = getDate();
      const expected = isCompetitionDateInPast(date) ? "closed" : "open";
      expect(resolveAttendanceStatus(date, "open")).toBe(expected);
    });
  });

  describe("境界は端末ローカル日付", () => {
    // DB 側の日次ジョブ (UTC-12) では代替できない要件。同一 UTC 時刻でも
    // 端末のローカル日付が違えば結論が変わることを確認する。
    // UTC 2026-03-15T20:00 は JST では 03-16 05:00 (翌日)。
    const UTC_EVENING = new Date("2026-03-15T20:00:00Z");

    it("ローカル日付が翌日に進んだ端末では、その前日イベントは closed になる", () => {
      vi.setSystemTime(UTC_EVENING);
      const localToday = format(UTC_EVENING, "yyyy-MM-dd");
      const localYesterday = format(subDays(UTC_EVENING, 1), "yyyy-MM-dd");

      expect(resolveAttendanceStatus(localYesterday, "open")).toBe("closed");
      expect(resolveAttendanceStatus(localToday, "open")).toBe("open");

      vi.setSystemTime(FIXED_NOW);
    });
  });
});
