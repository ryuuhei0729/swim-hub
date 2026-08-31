/**
 * useBestTimes フックテスト (マイページ ベストタイム表用データ取得フック)
 *
 * Sprint Contract 検証観点 (バグ2: メンバー詳細では備考がそもそも取得されていない):
 *   [V-HOOK-01] .select() に渡されるクエリ文字列そのものに note 列が含まれる
 *               (クエリ引数を捨てるモックは使わない。文字列そのものを assert する)
 *   [V-HOOK-02] 非リレー経路 (useBestTimes.ts の bestTimesByStyleAndPool 構築部分) で
 *               note が BestTime.note まで到達する。境界値: note="" は undefined 扱い
 *   [V-HOOK-03] リレー経路: 非リレー記録に relayingTime が付随するとき、
 *               relayingTime.note が引き継ぎ記録自身の note であり、
 *               非リレー記録側の note と取り違えられない
 *   [V-HOOK-04] 「引き継ぎのみ」フォールバック経路 (bestTimesByStyleAndPool に該当なし) でも
 *               note がそのまま (取り違えなく) BestTime.note まで到達する (回帰防止)
 *
 * ## モック方針
 * `apps/web/__tests__/hooks/useMemberBestTimes.test.ts` と同じ Supabase モックヘルパーを
 * 踏襲する。クエリ引数を捨てるモックは使わず、`.select()` に渡された引数そのものを
 * `mockSelect.mock.calls` から取得して assert する (feedback_swimhub_test_mock_discards_query_args
 * の前科を踏まえた対策)。
 *
 * useBestTimes 自身は useTranslations を呼ばないため、i18n ラッパーは不要
 * (他の hook テスト (useTimeInput.test.ts 等) と同様、素の renderHook を使う)。
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBestTimes } from "../../hooks/useBestTimes";

// useMemberBestTimes.test.ts と同じ Supabase モックヘルパー（重複実装せず踏襲）
const createMockSupabase = (mockData: unknown[] | null = [], mockError: Error | null = null) => {
  const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: mockError });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
  return {
    supabase: { from: mockFrom },
    mocks: { mockFrom, mockSelect, mockEq, mockOrder },
  };
};

describe("useBestTimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------
  // [V-HOOK-01] クエリ文字列そのものに note 列が含まれる (バグ2回帰防止)
  // ---------------------------------------------------------------------
  describe("[V-HOOK-01] select クエリに note 列が含まれる (バグ2回帰防止)", () => {
    it(".select() に渡されるクエリ文字列そのものに note 列が含まれる", async () => {
      const { supabase, mocks } = createMockSupabase([], null);
      const { result } = renderHook(() => useBestTimes(supabase as never));

      await act(async () => {
        await result.current.loadBestTimes("user-1");
      });

      expect(mocks.mockSelect).toHaveBeenCalledTimes(1);
      const queryArg = mocks.mockSelect.mock.calls[0][0] as string;
      expect(queryArg).toMatch(/\bnote\b/);
      // スコープ確認: user_id での絞り込みも同時に行われていること
      expect(mocks.mockEq).toHaveBeenCalledWith("user_id", "user-1");
    });
  });

  // ---------------------------------------------------------------------
  // [V-HOOK-02] 非リレー経路: note が BestTime.note まで到達する
  // ---------------------------------------------------------------------
  describe("[V-HOOK-02] 非リレー経路: note が BestTime.note まで到達する", () => {
    it("非リレー記録の note がそのまま bestTimes[].note に反映される", async () => {
      const { supabase } = createMockSupabase(
        [
          {
            id: "nonrelay-1",
            time: 30.5,
            created_at: "2025-01-15T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            note: "非リレー備考ABC123",
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        null,
      );
      const { result } = renderHook(() => useBestTimes(supabase as never));

      await act(async () => {
        await result.current.loadBestTimes("user-1");
      });

      expect(result.current.bestTimes).toHaveLength(1);
      expect(result.current.bestTimes[0].note).toBe("非リレー備考ABC123");
    });

    it("境界値: note='' は note=undefined 扱いになる (空文字はフォールバックで捨てられる)", async () => {
      const { supabase } = createMockSupabase(
        [
          {
            id: "nonrelay-empty",
            time: 30.5,
            created_at: "2025-01-15T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            note: "",
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        null,
      );
      const { result } = renderHook(() => useBestTimes(supabase as never));

      await act(async () => {
        await result.current.loadBestTimes("user-1");
      });

      expect(result.current.bestTimes).toHaveLength(1);
      expect(result.current.bestTimes[0].note).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------
  // [V-HOOK-03] リレー経路: relayingTime.note が取り違えなく到達する
  // (親note・引き継ぎnoteは意図的に異なる値にする。トートロジー回避)
  // ---------------------------------------------------------------------
  describe("[V-HOOK-03] リレー経路: relayingTime.note が取り違えなく到達する", () => {
    it("非リレー記録の note と、付随する引き継ぎ記録の note が別々に正しく反映される", async () => {
      const { supabase } = createMockSupabase(
        [
          {
            id: "nonrelay-1",
            time: 30.5,
            created_at: "2025-01-15T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            note: "親ノートDEF456",
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
          {
            id: "relay-1",
            time: 29.0, // 非リレーより速い
            created_at: "2025-01-10T00:00:00Z",
            pool_type: 0,
            is_relaying: true,
            note: "引き継ぎノートGHI789",
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        null,
      );
      const { result } = renderHook(() => useBestTimes(supabase as never));

      await act(async () => {
        await result.current.loadBestTimes("user-1");
      });

      expect(result.current.bestTimes).toHaveLength(1);
      const bestTime = result.current.bestTimes[0];
      expect(bestTime.note).toBe("親ノートDEF456");
      expect(bestTime.relayingTime?.note).toBe("引き継ぎノートGHI789");
      expect(bestTime.relayingTime?.note).not.toBe(bestTime.note);
    });

    it("長水路(pool_type=1)でも同様に、非リレー note と引き継ぎ note が取り違えられない", async () => {
      const { supabase } = createMockSupabase(
        [
          {
            id: "nonrelay-lcm",
            time: 60.0,
            created_at: "2025-01-15T00:00:00Z",
            pool_type: 1,
            is_relaying: false,
            note: "親ノートLCM-MNO345",
            styles: { name_jp: "100m背泳ぎ", distance: 100 },
            competitions: null,
          },
          {
            id: "relay-lcm",
            time: 58.0,
            created_at: "2025-01-10T00:00:00Z",
            pool_type: 1,
            is_relaying: true,
            note: "引き継ぎノートLCM-PQR678",
            styles: { name_jp: "100m背泳ぎ", distance: 100 },
            competitions: null,
          },
        ],
        null,
      );
      const { result } = renderHook(() => useBestTimes(supabase as never));

      await act(async () => {
        await result.current.loadBestTimes("user-1");
      });

      expect(result.current.bestTimes).toHaveLength(1);
      const bestTime = result.current.bestTimes[0];
      expect(bestTime.note).toBe("親ノートLCM-MNO345");
      expect(bestTime.relayingTime?.note).toBe("引き継ぎノートLCM-PQR678");
      expect(bestTime.relayingTime?.note).not.toBe(bestTime.note);
    });
  });

  // ---------------------------------------------------------------------
  // [V-HOOK-04] 「引き継ぎのみ」フォールバック経路: note がそのまま到達する (回帰防止)
  // ---------------------------------------------------------------------
  describe("[V-HOOK-04] 引き継ぎのみフォールバック経路: note がそのまま到達する", () => {
    it("非リレー記録が無い種目でも、引き継ぎ記録自身の note が bestTimes[].note に反映される", async () => {
      const { supabase } = createMockSupabase(
        [
          {
            id: "relay-only-1",
            time: 29.0,
            created_at: "2025-01-10T00:00:00Z",
            pool_type: 0,
            is_relaying: true,
            note: "単独引き継ぎノートJKL012",
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        null,
      );
      const { result } = renderHook(() => useBestTimes(supabase as never));

      await act(async () => {
        await result.current.loadBestTimes("user-1");
      });

      expect(result.current.bestTimes).toHaveLength(1);
      expect(result.current.bestTimes[0].is_relaying).toBe(true);
      expect(result.current.bestTimes[0].note).toBe("単独引き継ぎノートJKL012");
    });
  });
});
