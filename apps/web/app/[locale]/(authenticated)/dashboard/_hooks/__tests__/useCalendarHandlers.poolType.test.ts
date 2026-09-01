/**
 * useCalendarHandlers — editingData ビルダー #2/#3/#4/#5 の pool_type 伝搬テスト
 * (Sprint Contract D-5 / V-2)
 *
 * Ground Truth 実測 (PM):
 *   #2 (onEditItem, type="entry", チーム大会エントリー編集): SELECT に pool_type 無し
 *   #3 (onEditItem, type="entry", 個人大会エントリー編集): SELECT 自体を行わず、
 *       item.metadata.competition のみを参照
 *   #4 (onAddRecord, チームフロー): SELECT は pool_type 済みだが editingData に渡さず捨てていた
 *      (決定的証拠: :569 で select 済みなのに editingData に入れず捨てている)
 *   #5 (onEditRecord): SELECT に pool_type 無し
 *
 * D-1 (CompetitionTabModal 自身の DB 再取得) が最終防衛線のため、ここでは
 * 「暫定値としての正しさ」(D-5, 初回描画用) を検証する。
 *
 * SELECT の列文字列自体を検証する射影対応フェイク (V-8 の教訓を流用): 実際に
 * リクエストされた列だけを fixture から切り出して返すことで、developer が pool_type
 * を SELECT から落とす regression を確実に red 化できるようにする
 * (クエリ引数を捨てるモックにしない)。
 */

import { renderHookWithI18n as renderHook } from "../../../../../../__tests__/utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCalendarHandlers } from "../useCalendarHandlers";
import type { CalendarItem } from "@apps/shared/types/ui";
import type { EditingData } from "@/stores/types";
import type { RecordForEdit } from "../useCalendarHandlers";

/** 射影対応の competitions テーブル単発フェイク (select(...).eq(...).single()) */
function createProjectionAwareSupabase(row: Record<string, unknown>) {
  const selectCalls: string[] = [];
  const from = vi.fn(() => ({
    select: (cols: string) => {
      selectCalls.push(cols);
      const requestedCols = cols.split(",").map((c) => c.trim());
      const projected: Record<string, unknown> = {};
      requestedCols.forEach((c) => {
        if (c in row) projected[c] = row[c];
      });
      return {
        eq: () => ({
          single: () => Promise.resolve({ data: projected, error: null }),
        }),
      };
    },
  }));
  return { from, selectCalls };
}

function setupHandlers(supabase: ReturnType<typeof createProjectionAwareSupabase>) {
  const openCompetitionTabModal = vi.fn();
  const { result } = renderHook(() =>
    useCalendarHandlers({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      openPracticeTabModal: vi.fn(),
      openCompetitionTabModal,
      openEntryLogForm: vi.fn(),
      openRecordLogForm: vi.fn(),
      setSelectedDate: vi.fn(),
      setEditingData: vi.fn(),
      setCompetitionEditingData: vi.fn(),
      handleDeleteItem: vi.fn(),
      refreshCalendar: vi.fn(),
    }),
  );
  return { result, openCompetitionTabModal };
}

const baseEntryItem = (overrides: Partial<CalendarItem> = {}): CalendarItem =>
  ({
    id: "entry-1",
    type: "entry",
    date: "2026-08-01",
    title: "エントリー",
    metadata: {},
    ...overrides,
  }) as CalendarItem;

// NOTE: `mock.calls[0]!` を多用する。各テストは直前に `toHaveBeenCalledTimes(1)` で
// 呼び出し回数を確認済み。
describe("useCalendarHandlers — pool_type 伝搬 (D-5 #2〜#5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-2 #2] onEditItem: チーム大会のエントリー編集で pool_type=1 が editingData に渡る", async () => {
    const supabase = createProjectionAwareSupabase({
      entry_status: "open",
      date: "2026-08-01",
      title: "県大会",
      place: "県営プール",
      pool_type: 1,
    });
    const { result, openCompetitionTabModal } = setupHandlers(supabase);

    const item = baseEntryItem({
      metadata: {
        entry: { id: "entry-1", competition_id: "comp-1", user_id: "user-1", style_id: 2 },
        team_id: "team-1",
      },
    } as Partial<CalendarItem>);

    await result.current.onEditItem(item);

    expect(openCompetitionTabModal).toHaveBeenCalledTimes(1);
    const editingData = openCompetitionTabModal.mock.calls[0]![1] as EditingData;
    expect((editingData as Record<string, unknown>).pool_type).toBe(1);

    // SELECT が pool_type を落としていないことも直接検証する (V-8 と同種のクエリ形状検証)
    expect(supabase.selectCalls.some((c) => c.includes("pool_type"))).toBe(true);
  });

  it("[V-2 #3] onEditItem: 個人大会のエントリー編集で pool_type=1 が editingData に渡る (DB 問い合わせなし)", async () => {
    const supabase = createProjectionAwareSupabase({});
    const { result, openCompetitionTabModal } = setupHandlers(supabase);

    const item = baseEntryItem({
      metadata: {
        entry: { id: "entry-1", competition_id: "comp-1", user_id: "user-1", style_id: 2 },
        competition: {
          id: "comp-1",
          title: "個人大会",
          date: "2026-08-01",
          place: "",
          pool_type: 1,
        },
      },
    } as Partial<CalendarItem>);

    await result.current.onEditItem(item);

    expect(openCompetitionTabModal).toHaveBeenCalledTimes(1);
    const editingData = openCompetitionTabModal.mock.calls[0]![1] as EditingData;
    expect((editingData as Record<string, unknown>).pool_type).toBe(1);
  });

  it("[V-2 #4] onAddRecord: チーム大会フローで、SELECT 済みの pool_type=1 が editingData に渡る (決定的証拠の修正確認)", async () => {
    const supabase = createProjectionAwareSupabase({
      entry_status: "open",
      team_id: "team-1",
      date: "2026-08-01",
      title: "県大会",
      place: "",
      pool_type: 1,
    });
    const { result, openCompetitionTabModal } = setupHandlers(supabase);

    await result.current.onAddRecord({ competitionId: "comp-1" });

    expect(openCompetitionTabModal).toHaveBeenCalledTimes(1);
    const editingData = openCompetitionTabModal.mock.calls[0]![1] as EditingData;
    expect((editingData as Record<string, unknown>).pool_type).toBe(1);
  });

  it("[V-2 #5] onEditRecord: SELECT に pool_type が追加され、editingData に渡る", async () => {
    const supabase = createProjectionAwareSupabase({
      id: "comp-1",
      date: "2026-08-01",
      title: "県大会",
      place: "",
      pool_type: 1,
    });
    const { result, openCompetitionTabModal } = setupHandlers(supabase);

    const record: RecordForEdit = {
      id: "record-1",
      style_id: 2,
      competition_id: "comp-1",
    };

    await result.current.onEditRecord(record);

    expect(openCompetitionTabModal).toHaveBeenCalledTimes(1);
    const editingData = openCompetitionTabModal.mock.calls[0]![1] as EditingData;
    expect((editingData as Record<string, unknown>).pool_type).toBe(1);
    expect(supabase.selectCalls.some((c) => c.includes("pool_type"))).toBe(true);
  });
});
