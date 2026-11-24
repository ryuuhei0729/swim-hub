/**
 * DashboardDataLoader テスト
 *
 * カレンダーの表示月をサーバーで React Query のキャッシュに prefetch し、HydrationBoundary で
 * クライアントへ渡す。検証すること:
 *  - prefetch したキー (calendarKeys.month(月)) と、クライアントに渡す initialCalendarMonth から
 *    CalendarProvider が組み立てるキーが同一 (SSR/CSR のキー一致)。実際にハイドレートして
 *    CalendarProvider を描画し、クライアントで取り直さずにサーバーのデータを表示することで確認する
 *  - prefetch の失敗はラベル付きでログに残り (retry:false で1回だけ)、成功として dehydrate されない
 */

import React, { type ReactElement } from "react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import { calendarKeys } from "@/hooks/queries/calendarKeys";
import {
  CalendarProvider,
  useCalendar,
} from "@/app/[locale]/(authenticated)/dashboard/_providers/CalendarProvider";
import { renderWithQueryClient } from "@/__tests__/helpers/dashboardQueryTestUtils";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
  getStyles: vi.fn(),
  getUserTags: vi.fn(),
  getUserTeams: vi.fn(),
  getCalendarEntries: vi.fn(),
  getMonthlySummary: vi.fn(),
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mocks.getServerUser,
  createAuthenticatedServerClient: mocks.createAuthenticatedServerClient,
}));

vi.mock("@/lib/data-loaders/common", () => ({
  getStyles: mocks.getStyles,
  getUserTags: mocks.getUserTags,
  getUserTeams: mocks.getUserTeams,
}));

vi.mock("@apps/shared/api/dashboard", () => ({
  DashboardAPI: class {
    getCalendarEntries = mocks.getCalendarEntries;
    getMonthlySummary = mocks.getMonthlySummary;
  },
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

// DashboardClient はこのテストの対象範囲外。props の受け渡しだけを見るため浅いスタブにする
vi.mock("../../_client/DashboardClient", () => ({
  default: () => null,
}));

import DashboardDataLoader, { getInitialCalendarMonth } from "../DashboardDataLoader";

type LoaderElement = ReactElement<{
  state: DehydratedState;
  children: ReactElement<{ initialCalendarMonth?: string }>;
}>;

const CalendarProbe = ({ onValue }: { onValue: (v: ReturnType<typeof useCalendar>) => void }) => {
  onValue(useCalendar());
  return null;
};

describe("DashboardDataLoader - カレンダーの prefetch と SSR/CSR のキー一致", () => {
  let onLineSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.getServerUser.mockResolvedValue({ id: "user-1" });
    mocks.createAuthenticatedServerClient.mockResolvedValue({});
    mocks.getStyles.mockResolvedValue([]);
    mocks.getUserTags.mockResolvedValue([]);
    mocks.getUserTeams.mockResolvedValue([]);
    mocks.getCalendarEntries.mockReset();
    mocks.getMonthlySummary.mockReset();
    // クライアント側の前後の月の先読みはこのテストの対象外
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  });

  afterEach(() => {
    onLineSpy.mockRestore();
  });

  it("表示月を日本時間で決める (UTC では前月末でも日本時間で翌月なら翌月)", () => {
    // 2025-01-31T15:30Z = 2025-02-01 00:30 JST
    expect(getInitialCalendarMonth(new Date("2025-01-31T15:30:00Z"))).toBe("2025-02");
    expect(getInitialCalendarMonth(new Date("2025-01-31T14:30:00Z"))).toBe("2025-01");
  });

  it("prefetch したキーとクライアントのキーが一致し、ハイドレート後にクライアントで取り直さない", async () => {
    const items = [
      {
        id: "p-1",
        type: "practice",
        date: "2025-03-10",
        title: "朝練",
        metadata: {},
        editData: {},
      },
    ];
    const summary = { practiceCount: 1, recordCount: 0 };
    mocks.getCalendarEntries.mockResolvedValue(items);
    mocks.getMonthlySummary.mockResolvedValue(summary);

    const element = (await DashboardDataLoader({
      currentDate: new Date("2025-03-15T03:00:00Z"),
    })) as LoaderElement;

    const initialCalendarMonth = element.props.children.props.initialCalendarMonth;
    expect(initialCalendarMonth).toBe("2025-03");

    const { queries } = element.props.state;
    expect(queries).toHaveLength(1);
    expect(queries[0]!.queryKey).toEqual(calendarKeys.month(initialCalendarMonth!));
    expect(queries[0]!.state.status).toBe("success");
    // 月間サマリーはその月 (2025年3月) で取得している
    expect(mocks.getMonthlySummary).toHaveBeenCalledWith(2025, 3);
    expect(mocks.getCalendarEntries).toHaveBeenCalledTimes(1);

    // クライアント: ハイドレートして CalendarProvider を描画する
    let value: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <HydrationBoundary state={element.props.state}>
        <CalendarProvider initialMonth={initialCalendarMonth}>
          <CalendarProbe onValue={(v) => (value = v)} />
        </CalendarProvider>
      </HydrationBoundary>,
    );

    await waitFor(() => expect(value?.calendarItems).toEqual(items));
    expect(value?.monthlySummary).toEqual(summary);
    expect(value?.loading).toBe(false);
    // 同じキーでハイドレートしたデータを使うので、クライアントでは取り直さない
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.getCalendarEntries).toHaveBeenCalledTimes(1);
  });

  it("prefetch が失敗したらラベル付きでちょうど1回ログに残し (retry:false)、成功として dehydrate しない", async () => {
    const error = new Error("network down");
    mocks.getCalendarEntries.mockRejectedValue(error);
    mocks.getMonthlySummary.mockResolvedValue({ practiceCount: 0, recordCount: 0 });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const element = (await DashboardDataLoader({
      currentDate: new Date("2025-03-15T03:00:00Z"),
    })) as LoaderElement;

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[DashboardDataLoader] Calendar prefetch エラー:", error);
    expect(mocks.getCalendarEntries).toHaveBeenCalledTimes(1);
    expect(element.props.state.queries).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it("未ログインなら prefetch しない", async () => {
    mocks.getServerUser.mockResolvedValue(null);

    const element = (await DashboardDataLoader({})) as LoaderElement;

    expect(mocks.getCalendarEntries).not.toHaveBeenCalled();
    expect(element.props.state.queries).toHaveLength(0);
  });
});
