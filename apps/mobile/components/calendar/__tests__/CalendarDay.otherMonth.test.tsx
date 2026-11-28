/**
 * CalendarDay: 前月末・翌月初めの日 (月の外の日) も押せて、予定も出す (web と同じ)
 * ryuuhei0729/swimhub-tasks#88
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";
import { CalendarDay } from "../CalendarDay";

const colorSettings = { personal: { practice_color: null, competition_color: null }, byTeam: {} };

function makeEntry(): CalendarItem {
  return {
    id: "practice-1",
    type: "practice",
    date: "2025-02-01",
    title: "朝練",
    metadata: {},
  } as CalendarItem;
}

describe("CalendarDay (月の外の日)", () => {
  it("翌月初めの日を押すと onPress が呼ばれ、予定も表示される", () => {
    const onPress = vi.fn();
    const day = new Date(2025, 1, 1);
    render(
      <CalendarDay
        date={day}
        currentDate={new Date(2025, 0, 15)}
        entries={[makeEntry()]}
        onPress={onPress}
        colorSettings={colorSettings}
      />,
    );

    expect(screen.getByText("朝練")).toBeTruthy();
    fireEvent.click(screen.getByText("1").closest("button")!);
    expect(onPress).toHaveBeenCalledWith(day);
  });
});
