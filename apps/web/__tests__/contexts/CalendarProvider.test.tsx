import { waitFor } from "@testing-library/react";
import { act } from "react";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  CalendarProvider,
  useCalendar,
} from "@/app/[locale]/(authenticated)/dashboard/_providers/CalendarProvider";
import { calendarKeys } from "@/hooks/queries/calendarKeys";
import { resetShownRenderIdsForTest } from "@/components/ui/FreshServerRender";
import { dayDetailKeys } from "@/hooks/queries/dayDetailQueries";
import type { CalendarItem } from "@apps/shared/types/ui";
import {
  createTestQueryClient,
  renderWithQueryClient,
} from "@/__tests__/helpers/dashboardQueryTestUtils";

vi.mock("@/contexts");
import { useAuth } from "@/contexts";
import { buildAuthContext } from "@/__tests__/utils/authContext";

const mockGetCalendarEntries = vi.fn();
const mockGetMonthlySummary = vi.fn();

vi.mock("@apps/shared/api/dashboard", () => ({
  DashboardAPI: class {
    constructor() {}
    getCalendarEntries = mockGetCalendarEntries;
    getMonthlySummary = mockGetMonthlySummary;
  },
}));

const CalendarConsumer = ({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useCalendar>) => void;
}) => {
  const value = useCalendar();
  onReady(value);
  return null;
};

const makeItem = (id: string, date: string, title = "練習"): CalendarItem => ({
  id,
  type: "practice",
  date,
  title,
  place: "市営プール",
  note: "",
  metadata: {},
  editData: {},
});

/** getMonthlySummary(year, month) の呼び出しから取得された月 ("yyyy-MM") の一覧 */
const fetchedMonths = () =>
  mockGetMonthlySummary.mock.calls.map(
    (args: unknown[]) => `${String(args[0])}-${String(args[1]).padStart(2, "0")}`,
  );

describe("CalendarProvider", () => {
  let onLineSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    resetShownRenderIdsForTest();
    vi.mocked(useAuth).mockReset();
    mockGetCalendarEntries.mockReset();
    mockGetMonthlySummary.mockReset();
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: null,
        supabase: {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
        },
      }),
    );
  });

  afterEach(() => {
    onLineSpy?.mockRestore();
    onLineSpy = null;
  });

  it("サーバーがハイドレートした表示月のデータをそのまま使い、マウント直後に取り直さない", () => {
    const initialItems = [makeItem("1", "2025-01-10", "朝練")];
    const initialSummary = { practiceCount: 3, recordCount: 1 };
    const queryClient = createTestQueryClient();
    // HydrationBoundary がハイドレートした状態 (直前に取得したデータ) を再現する
    queryClient.setQueryData(calendarKeys.month("2025-01"), {
      calendarItems: initialItems,
      monthlySummary: initialSummary,
    });
    // 先読み (前後の月) は対象外にする
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    let contextValue: ReturnType<typeof useCalendar> | null = null;

    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-01">
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
      { queryClient },
    );

    expect(mockGetCalendarEntries).not.toHaveBeenCalled();
    expect(contextValue).not.toBeNull();
    const value = contextValue!;
    expect(value.calendarItems).toEqual(initialItems);
    expect(value.monthlySummary).toEqual(initialSummary);
    expect(value.loading).toBe(false);
    expect(value.currentDate.getFullYear()).toBe(2025);
    expect(value.currentDate.getMonth()).toBe(0);
  });

  it("データが無い月は取得し、月を移ると移った先の月を取得する。楽観的更新もサポートする", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchedItems = [makeItem("2", "2025-02-03", "大会")];
    const fetchedSummary = { practiceCount: 1, recordCount: 2 };

    mockGetCalendarEntries.mockResolvedValue(fetchedItems);
    mockGetMonthlySummary.mockResolvedValue(fetchedSummary);

    let contextValue: ReturnType<typeof useCalendar> | undefined;

    renderWithQueryClient(
      <CalendarProvider initialDate={new Date(2025, 1, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
    );

    // 取得中は loading
    expect(contextValue?.loading).toBe(true);

    await waitFor(() => {
      expect(contextValue?.calendarItems).toEqual(fetchedItems);
      expect(contextValue?.monthlySummary).toEqual(fetchedSummary);
    });
    expect(contextValue?.loading).toBe(false);

    const currentCallCount = mockGetCalendarEntries.mock.calls.length;

    // 同じ月への setCurrentDate は再取得しない
    act(() => {
      contextValue?.setCurrentDate(new Date(2025, 1, 15));
    });
    expect(mockGetCalendarEntries).toHaveBeenCalledTimes(currentCallCount);

    // 別月に移動すると再取得
    mockGetCalendarEntries.mockResolvedValue([makeItem("3", "2025-03-01", "合宿")]);
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 5, recordCount: 0 });

    act(() => {
      contextValue?.setCurrentDate(new Date(2025, 2, 1));
    });
    await waitFor(() => {
      expect(mockGetCalendarEntries).toHaveBeenCalledTimes(currentCallCount + 1);
      expect(contextValue?.calendarItems).toEqual([makeItem("3", "2025-03-01", "合宿")]);
    });
    expect(fetchedMonths()).toContain("2025-03");

    // 楽観的操作の検証 (React Query の通知は非同期にまとめて届くので waitFor で待つ)
    act(() => {
      contextValue?.addItem(makeItem("4", "2025-03-05", "自主練"));
    });
    await waitFor(() =>
      expect(contextValue?.calendarItems).toContainEqual(expect.objectContaining({ id: "4" })),
    );
    act(() => {
      contextValue?.updateItem("4", { title: "自主練（更新）" });
    });
    await waitFor(() =>
      expect(contextValue?.calendarItems).toContainEqual(
        expect.objectContaining({ id: "4", title: "自主練（更新）" }),
      ),
    );
    act(() => {
      contextValue?.removeItem("4");
    });
    await waitFor(() =>
      expect(contextValue?.calendarItems).not.toContainEqual(expect.objectContaining({ id: "4" })),
    );
  });

  it("表示月を読み込み終えたら前後の月を先読みし、前の月に戻るとキャッシュをすぐ表示する", async () => {
    mockGetCalendarEntries.mockImplementation(async (startDate: string) => [
      makeItem(`item-${startDate}`, startDate),
    ]);
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 0, recordCount: 0 });
    const queryClient = createTestQueryClient();

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-06" initialDate={new Date(2025, 5, 10)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
      { queryClient },
    );

    // 表示月 → 前後の月 (5月・7月) の順で取得される
    await waitFor(() => {
      expect(fetchedMonths()).toEqual(["2025-06", "2025-05", "2025-07"]);
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(calendarKeys.month("2025-05"))).toBeDefined();
      expect(queryClient.getQueryData(calendarKeys.month("2025-07"))).toBeDefined();
    });
    const mayData = queryClient.getQueryData<{ calendarItems: CalendarItem[] }>(
      calendarKeys.month("2025-05"),
    )!;

    // 前の月へ移ると、取り直しを待たずに先読みした内容をすぐ表示する (loading にしない)
    let resolveRefetch!: (items: CalendarItem[]) => void;
    mockGetCalendarEntries.mockImplementationOnce(
      () => new Promise<CalendarItem[]>((resolve) => (resolveRefetch = resolve)),
    );
    act(() => {
      contextValue?.setCurrentDate(new Date(2025, 4, 1));
    });
    expect(contextValue?.loading).toBe(false);
    expect(contextValue?.calendarItems).toEqual(mayData.calendarItems);

    // 裏で取り直した結果に置き換わる
    await waitFor(() => expect(resolveRefetch).toBeDefined());
    const refreshed = [makeItem("may-new", "2025-05-20", "更新後")];
    await act(async () => {
      resolveRefetch(refreshed);
    });
    await waitFor(() => expect(contextValue?.calendarItems).toEqual(refreshed));
  });

  it("オフラインのときは前後の月を先読みしない", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mockGetCalendarEntries.mockResolvedValue([]);
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 0, recordCount: 0 });

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-06" initialDate={new Date(2025, 5, 10)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
    );

    await waitFor(() => expect(contextValue?.loading).toBe(false));
    // 少し待っても表示月以外は取得されない
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchedMonths()).toEqual(["2025-06"]);
  });

  it("保存・削除 (refreshKey の変化) の後は取り直しが終わるまで loading にし、書き込み前の前後の月と日付詳細のキャッシュを捨てる", async () => {
    mockGetCalendarEntries.mockResolvedValue([makeItem("before", "2025-06-01", "保存前")]);
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 1, recordCount: 0 });
    const queryClient = createTestQueryClient();
    // 日付詳細のキャッシュ (書き込み前の内容)
    queryClient.setQueryData(dayDetailKeys.splitTimes("record-1"), [{ id: "old" }]);

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    const ui = (refreshKey: number) => (
      <CalendarProvider
        initialMonth="2025-06"
        initialDate={new Date(2025, 5, 10)}
        refreshKey={refreshKey}
      >
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>
    );
    const { rerender } = renderWithQueryClient(ui(0), { queryClient });

    await waitFor(() => {
      expect(queryClient.getQueryData(calendarKeys.month("2025-05"))).toBeDefined();
      expect(queryClient.getQueryData(calendarKeys.month("2025-07"))).toBeDefined();
    });

    let resolveAfterWrite!: (items: CalendarItem[]) => void;
    mockGetCalendarEntries.mockImplementationOnce(
      () => new Promise<CalendarItem[]>((resolve) => (resolveAfterWrite = resolve)),
    );
    rerender(ui(1));

    // 書き込み前の内容を見せないよう loading になる
    await waitFor(() => expect(contextValue?.loading).toBe(true));
    // 表示していない月と日付詳細のキャッシュは捨てられる
    expect(queryClient.getQueryData(calendarKeys.month("2025-05"))).toBeUndefined();
    expect(queryClient.getQueryData(calendarKeys.month("2025-07"))).toBeUndefined();
    expect(queryClient.getQueryData(dayDetailKeys.splitTimes("record-1"))).toBeUndefined();

    const afterWrite = [makeItem("after", "2025-06-02", "保存後")];
    await act(async () => {
      resolveAfterWrite(afterWrite);
    });
    await waitFor(() => {
      expect(contextValue?.loading).toBe(false);
      expect(contextValue?.calendarItems).toEqual(afterWrite);
    });
  });

  it("データが無い月の取得に失敗したら error を返し、成功として空データをキャッシュしない", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetCalendarEntries.mockRejectedValue(new Error("Not authenticated"));
    mockGetMonthlySummary.mockRejectedValue(new Error("Not authenticated"));
    const queryClient = createTestQueryClient();

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-04" initialDate={new Date(2025, 3, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
      { queryClient },
    );

    await waitFor(() => expect(contextValue?.error).toBeInstanceOf(Error));
    expect(contextValue?.loading).toBe(false);
    expect(contextValue?.calendarItems).toEqual([]);
    expect(contextValue?.monthlySummary).toEqual({ practiceCount: 0, recordCount: 0 });
    expect(queryClient.getQueryState(calendarKeys.month("2025-04"))?.status).toBe("error");
    consoleErrorSpy.mockRestore();
  });

  it("保存・削除のあとの取り直し (refetch) に失敗したら、書き込み前のデータのまま黙らずエラーにする", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetCalendarEntries
      .mockResolvedValueOnce([makeItem("5", "2025-04-01", "朝練")])
      .mockRejectedValue(new Error("Not authenticated"));
    mockGetMonthlySummary
      .mockResolvedValueOnce({ practiceCount: 2, recordCount: 0 })
      .mockRejectedValue(new Error("Not authenticated"));

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-04" initialDate={new Date(2025, 3, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
    );

    await waitFor(() => expect(contextValue?.calendarItems).toHaveLength(1));

    await act(async () => {
      await contextValue?.refetch();
    });

    expect(contextValue?.loading).toBe(false);
    // 表示中のデータは書き込み前の内容。「保存されなかった」ように見せないためエラーにする (従来と同じ)
    expect(contextValue?.error).toBeInstanceOf(Error);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Calendar data fetch error:", expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it("書き込みと関係ない裏での取り直し (フォーカス復帰など) に失敗しても、表示中のデータを隠さない", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mockGetCalendarEntries
      .mockResolvedValueOnce([makeItem("5", "2025-04-01", "朝練")])
      .mockRejectedValue(new Error("Not authenticated"));
    mockGetMonthlySummary
      .mockResolvedValueOnce({ practiceCount: 2, recordCount: 0 })
      .mockRejectedValue(new Error("Not authenticated"));

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    const { queryClient } = renderWithQueryClient(
      <CalendarProvider initialMonth="2025-04" initialDate={new Date(2025, 3, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
    );

    await waitFor(() => expect(contextValue?.calendarItems).toHaveLength(1));

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["dashboardCalendar"] });
    });

    expect(contextValue?.loading).toBe(false);
    expect(contextValue?.error).toBeNull();
    expect(contextValue?.calendarItems).toEqual([makeItem("5", "2025-04-01", "朝練")]);
    expect(contextValue?.monthlySummary).toEqual({ practiceCount: 2, recordCount: 0 });
  });

  it("保存後の取り直しが重なって前の分が取り消されても、エラーにしない (後の取り直しの結果を出す)", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetCalendarEntries
      .mockResolvedValueOnce([makeItem("5", "2025-04-01", "朝練")])
      .mockResolvedValue([makeItem("6", "2025-04-02", "夕練")]);
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 1, recordCount: 0 });

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-04" initialDate={new Date(2025, 3, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
    );
    await waitFor(() => expect(contextValue?.calendarItems).toHaveLength(1));

    await act(async () => {
      await Promise.all([contextValue?.refetch(), contextValue?.refetch()]);
    });

    expect(contextValue?.error).toBeNull();
    expect(contextValue?.calendarItems).toEqual([makeItem("6", "2025-04-02", "夕練")]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("ページ遷移のキャッシュで使い回された描画なら、取得したばかりに見えてもマウント時に取り直す", async () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mockGetCalendarEntries.mockResolvedValue([makeItem("7", "2025-04-03", "他の画面で追加した練習")]);
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 1, recordCount: 0 });
    const queryClient = createTestQueryClient();
    // 直前にダッシュボードを表示していたときのデータ (数秒前に取得したもの)
    queryClient.setQueryData(calendarKeys.month("2025-04"), {
      calendarItems: [],
      monthlySummary: { practiceCount: 0, recordCount: 0 },
    });

    const first = renderWithQueryClient(
      <CalendarProvider initialMonth="2025-04" initialDate={new Date(2025, 3, 1)} serverRenderId="render-1">
        <CalendarConsumer onReady={() => {}} />
      </CalendarProvider>,
      { queryClient },
    );
    // サーバーで描画したばかりの初回は、取得から間もないので取り直さない
    expect(mockGetCalendarEntries).not.toHaveBeenCalled();
    first.unmount(); // 他の画面へ移って練習を追加した

    let contextValue: ReturnType<typeof useCalendar> | undefined;
    renderWithQueryClient(
      <CalendarProvider initialMonth="2025-04" initialDate={new Date(2025, 3, 1)} serverRenderId="render-1">
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>,
      { queryClient },
    );

    await waitFor(() =>
      expect(contextValue?.calendarItems).toEqual([
        makeItem("7", "2025-04-03", "他の画面で追加した練習"),
      ]),
    );
  });
});
