/**
 * localizeCalendarItemTitle: calendar_view が日本語で返すタイトル (「練習」「大会」「100m × 4本」) を、
 * metadata の元の行から表示言語の文言で組み立て直す
 */
import { describe, expect, it } from "vitest";
import {
  localizeCalendarItemTitle,
  type CalendarItemTitleLabels,
} from "../../utils/calendarItemTitle";
import type { CalendarItem } from "../../types/ui";

const en: CalendarItemTitleLabels = {
  practice: "Practice",
  teamPractice: "Team practice",
  competition: "Meet",
  practiceLog: ({ distance, reps, sets }) =>
    sets === 1 ? `${distance}m × ${reps}` : `${distance}m × ${reps} × ${sets}`,
};

const item = (
  type: CalendarItem["type"],
  title: string,
  metadata: Record<string, unknown>,
): Pick<CalendarItem, "type" | "title" | "metadata"> => ({
  type,
  title,
  metadata: metadata as CalendarItem["metadata"],
});

describe("localizeCalendarItemTitle", () => {
  it("練習ログは距離・本数・セット数から組み立てる (「本」「セット」を残さない)", () => {
    expect(
      localizeCalendarItemTitle(
        item("practice_log", "100m × 4本", { practice_log: { distance: 100, rep_count: 4, set_count: 1 } }),
        en,
      ),
    ).toBe("100m × 4");
    expect(
      localizeCalendarItemTitle(
        item("practice_log", "50m × 8本 × 2セット", {
          practice_log: { distance: 50, rep_count: 8, set_count: 2 },
        }),
        en,
      ),
    ).toBe("50m × 8 × 2");
  });

  it("タイトル未設定の大会は表示言語の既定名にする。タイトルがあればそのまま", () => {
    expect(
      localizeCalendarItemTitle(item("competition", "大会", { competition: { title: null } }), en),
    ).toBe("Meet");
    expect(
      localizeCalendarItemTitle(item("record", "大会", { competition: { title: "" } }), en),
    ).toBe("Meet");
    expect(
      localizeCalendarItemTitle(
        item("entry", "冬季記録会", { competition: { title: "冬季記録会" } }),
        en,
      ),
    ).toBe("冬季記録会");
  });

  it("タイトル未設定の練習・チーム練習は表示言語の既定名にする。タイトルがあればそのまま", () => {
    expect(localizeCalendarItemTitle(item("practice", "練習", { practice: { title: null } }), en)).toBe(
      "Practice",
    );
    expect(
      localizeCalendarItemTitle(item("team_practice", "チーム練習", { practice: { title: null } }), en),
    ).toBe("Team practice");
    expect(
      localizeCalendarItemTitle(item("practice", "朝練", { practice: { title: "朝練" } }), en),
    ).toBe("朝練");
  });

  it("metadata が無い・形が違うときは、ビューの title をそのまま使う", () => {
    expect(localizeCalendarItemTitle(item("practice_log", "100m × 4本", {}), en)).toBe("100m × 4本");
    expect(
      localizeCalendarItemTitle(
        item("practice_log", "100m × 4本", { practice_log: { distance: "100" } }),
        en,
      ),
    ).toBe("100m × 4本");
    expect(localizeCalendarItemTitle(item("practice", "朝練", {}), en)).toBe("朝練");
  });
});
