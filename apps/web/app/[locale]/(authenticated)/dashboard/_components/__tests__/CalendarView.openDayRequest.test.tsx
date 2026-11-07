/**
 * CalendarView の openDayRequest (ダッシュボードの次の大会から、その日の詳細を開く依頼)。
 * 詳細モーダルとカレンダーのデータ取得は差し替え、開く・月を移す・seq で開き直すことだけを見る。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { format } from "date-fns";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";
import type { OpenDayRequest } from "../CalendarContainer";

// setCurrentDate は描画のたびに新しい関数を返す。本物 (CalendarProvider) は currentDate が変わるたびに
// 作り直されるので、それより厳しい条件で「同じ依頼では開き直さない」を確かめる
const mocks = vi.hoisted(() => ({ setCurrentDate: vi.fn() }));

vi.mock("@/contexts");
vi.mock("@/i18n/navigation");
vi.mock("@apps/shared/hooks", () => ({
  useCalendarColorSettingsQuery: () => ({ settings: undefined }),
}));
vi.mock("../../_providers/CalendarProvider", () => ({
  useCalendar: () => ({
    currentDate: new Date(2026, 10, 7),
    calendarItems: [],
    monthlySummary: { practiceCount: 0, recordCount: 0 },
    loading: false,
    error: null,
    setCurrentDate: (date: Date) => mocks.setCurrentDate(date),
    refetch: vi.fn(),
  }),
}));
vi.mock("../DayDetailModal", () => ({
  __esModule: true,
  default: ({ date, onClose }: { date: Date; onClose: () => void }) => (
    <div data-testid="day-detail">
      {format(date, "yyyy-MM-dd")}
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import CalendarView from "../CalendarView";

function renderView(openDayRequest: OpenDayRequest | null) {
  return renderWithI18n(<CalendarView openDayRequest={openDayRequest} />);
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext());
});

describe("CalendarView openDayRequest", () => {
  it("依頼が無ければ詳細を開かない", () => {
    renderView(null);
    expect(screen.queryByTestId("day-detail")).toBeNull();
    expect(mocks.setCurrentDate).not.toHaveBeenCalled();
  });

  it("依頼の日の詳細を開き、カレンダーをその日の月へ移す", () => {
    renderView({ date: "2026-12-06", seq: 1 });
    expect(screen.getByTestId("day-detail")).toHaveTextContent("2026-12-06");
    expect(mocks.setCurrentDate).toHaveBeenCalledTimes(1);
    expect(format(mocks.setCurrentDate.mock.calls[0]![0] as Date, "yyyy-MM-dd")).toBe("2026-12-06");
  });

  it("閉じたあと、同じ日でも seq が進めば開き直す。seq が同じ再描画では開かない", () => {
    const { rerender } = renderView({ date: "2026-11-19", seq: 1 });
    fireEvent.click(screen.getByText("close"));
    expect(screen.queryByTestId("day-detail")).toBeNull();

    act(() => rerender(<CalendarView openDayRequest={{ date: "2026-11-19", seq: 1 }} />));
    expect(screen.queryByTestId("day-detail")).toBeNull();

    act(() => rerender(<CalendarView openDayRequest={{ date: "2026-11-19", seq: 2 }} />));
    expect(screen.getByTestId("day-detail")).toHaveTextContent("2026-11-19");
  });
});
