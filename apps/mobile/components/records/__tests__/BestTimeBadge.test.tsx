// =============================================================================
// BestTimeBadge.test.tsx - 自己ベスト3状態バッジのテスト
// =============================================================================
// 新3状態モデル (web ShareBadgeState ポート) の仕様に基づく検証:
// - 初記録: 「初」(first)
// - ベスト更新 (±0含む, BEST_EPSILON=0.005): 「自己ベスト」+ 符号付き差分 (best)
// - ベストより遅い: 「自己ベスト」+ 符号付き差分 (slower)
// - 判定不能 (previousBest 不明 / ガード / エラー / 自身が現行ベスト): 非表示 (none)
//
// i18n は vitest.setup.ts のモックが実 ja.json を解決するため、
// "初" / "自己ベスト" の実値でアサートする。
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__mocks__/supabase";
import type { MockSupabaseClient } from "@/__mocks__/supabase";
import type { BestTime } from "@apps/shared/types/ui";

// --- AuthProvider モック ---
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// --- RecordAPI モック (非 precomputed パスの getPreviousBestTime) ---
const mockGetPreviousBestTime = vi.hoisted(() => vi.fn());
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getPreviousBestTime: mockGetPreviousBestTime,
  })),
}));

import BestTimeBadge, { getBadgeState } from "../BestTimeBadge";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const FIRST_LABEL = "初"; // recordMobile.bestBadge.first
const PERSONAL_BEST_LABEL = "自己ベスト"; // recordMobile.bestBadge.personalBest

/** BestTimeBadge をデフォルト props でレンダリングする */
function renderBadge(
  props: Partial<React.ComponentProps<typeof BestTimeBadge>> = {},
  supabase: MockSupabaseClient = createMockSupabaseClient(),
) {
  mockUseAuth.mockReturnValue({ supabase });

  return {
    supabase,
    ...render(
      <BestTimeBadge
        recordId={props.recordId ?? "record-1"}
        styleId={"styleId" in props ? props.styleId : 1}
        currentTime={props.currentTime ?? 60.0}
        recordDate={"recordDate" in props ? props.recordDate : "2025-03-01"}
        poolType={"poolType" in props ? props.poolType : 1}
        isRelaying={props.isRelaying ?? false}
        precomputedBestTimes={props.precomputedBestTimes}
      />,
    ),
  };
}

/** precomputedBestTimes 用エントリ生成 */
function makeBestTime(overrides: Partial<BestTime> = {}): BestTime {
  return {
    id: "bt-other",
    time: 60.0,
    created_at: "2025-01-01T00:00:00.000Z",
    pool_type: 1,
    is_relaying: false,
    style_id: 1,
    style: { name_jp: "自由形", distance: 100 },
    ...overrides,
  };
}

/** バッジが一切表示されていないことを確認 */
function expectNoBadge() {
  expect(screen.queryByText(FIRST_LABEL)).toBeNull();
  expect(screen.queryByText(PERSONAL_BEST_LABEL)).toBeNull();
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("BestTimeBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. getBadgeState 純関数のユニットテスト
  // ------------------------------------------------------------------

  describe("getBadgeState (純関数)", () => {
    it("isFirstRecord=true のとき previousBest に関係なく first を返す", () => {
      expect(getBadgeState(60.0, 55.0, true)).toEqual({ kind: "first" });
      expect(getBadgeState(60.0, undefined, true)).toEqual({ kind: "first" });
    });

    it("previousBest が null / undefined のとき none を返す（判定不能）", () => {
      expect(getBadgeState(60.0, null)).toEqual({ kind: "none" });
      expect(getBadgeState(60.0, undefined)).toEqual({ kind: "none" });
    });

    it("previousBest より速いとき best + マイナス符号の差分ラベルを返す", () => {
      expect(getBadgeState(58.77, 60.0)).toEqual({ kind: "best", label: "-1.23" });
    });

    it("同タイム（±0）のとき best + 「±0.00」ラベルを返す", () => {
      expect(getBadgeState(60.0, 60.0)).toEqual({ kind: "best", label: "±0.00" });
    });

    it("差が BEST_EPSILON(0.005) 以内の悪化は best + 「±0.00」扱い", () => {
      expect(getBadgeState(60.004, 60.0)).toEqual({ kind: "best", label: "±0.00" });
    });

    it("previousBest より遅いとき slower + プラス符号の差分ラベルを返す", () => {
      expect(getBadgeState(62.5, 60.0)).toEqual({ kind: "slower", label: "+2.50" });
      // 境界: epsilon をわずかに超える悪化は slower
      expect(getBadgeState(60.01, 60.0)).toEqual({ kind: "slower", label: "+0.01" });
    });
  });

  // ------------------------------------------------------------------
  // 2. precomputedBestTimes パス（同期判定・Supabase 不使用）
  // ------------------------------------------------------------------

  describe("precomputedBestTimes パス", () => {
    it("同条件の記録が存在しないとき「初」を表示し Supabase クエリが走らない", () => {
      const { supabase } = renderBadge({
        currentTime: 55.0,
        precomputedBestTimes: [], // マッチなし = 初記録
      });

      expect(screen.getByText(FIRST_LABEL)).toBeTruthy();
      expect(supabase.from).not.toHaveBeenCalled();
      expect(mockGetPreviousBestTime).not.toHaveBeenCalled();
    });

    it("style_id は一致しても pool_type が異なるならマッチせず「初」を表示する", () => {
      renderBadge({
        currentTime: 55.0,
        poolType: 1,
        precomputedBestTimes: [makeBestTime({ pool_type: 0, time: 50.0 })],
      });

      expect(screen.getByText(FIRST_LABEL)).toBeTruthy();
    });

    it("自身が現行ベスト（マッチした id === recordId）のとき何も表示しない", () => {
      const { supabase } = renderBadge({
        recordId: "record-1",
        currentTime: 55.0,
        precomputedBestTimes: [makeBestTime({ id: "record-1", time: 55.0 })],
      });

      expectNoBadge();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("既存ベストより速いとき「自己ベスト」+ マイナス差分を表示する", () => {
      const { supabase } = renderBadge({
        currentTime: 58.77,
        precomputedBestTimes: [makeBestTime({ time: 60.0 })],
      });

      expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
      expect(screen.getByText("-1.23")).toBeTruthy();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("既存ベストより遅いとき「自己ベスト」+ プラス差分を表示する", () => {
      renderBadge({
        currentTime: 62.5,
        precomputedBestTimes: [makeBestTime({ time: 60.0 })],
      });

      expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
      expect(screen.getByText("+2.50")).toBeTruthy();
    });

    it("poolType 未指定 (null) は pool_type=0 のエントリとマッチする", () => {
      renderBadge({
        currentTime: 62.5,
        poolType: null,
        precomputedBestTimes: [makeBestTime({ pool_type: 0, time: 60.0 })],
      });

      expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
      expect(screen.getByText("+2.50")).toBeTruthy();
    });

    // --- リレー区分の選択ロジック ---

    it("isRelaying=true + 主エントリ非リレーのとき relayingTime.time と比較する（time=60 ではなく 50）", () => {
      // relayingTime.time=50 と比較: 55 > 50 → slower "+5.00"
      // 誤って match.time=60 と比較すると 55 < 60 → best になりテストが FAIL する
      renderBadge({
        currentTime: 55.0,
        isRelaying: true,
        precomputedBestTimes: [
          makeBestTime({
            time: 60.0,
            is_relaying: false,
            relayingTime: { id: "bt-r-1", time: 50.0, created_at: "2025-01-01T00:00:00.000Z" },
          }),
        ],
      });

      expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
      expect(screen.getByText("+5.00")).toBeTruthy();
    });

    it("isRelaying=true + 主エントリ非リレーで relayingTime がないとき「初」を表示する", () => {
      renderBadge({
        currentTime: 55.0,
        isRelaying: true,
        precomputedBestTimes: [makeBestTime({ time: 50.0, is_relaying: false })],
      });

      expect(screen.getByText(FIRST_LABEL)).toBeTruthy();
    });

    it("isRelaying=true + フォールバックエントリ（is_relaying=true）のとき本体 time と比較する", () => {
      renderBadge({
        currentTime: 55.0,
        isRelaying: true,
        precomputedBestTimes: [makeBestTime({ time: 50.0, is_relaying: true })],
      });

      expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
      expect(screen.getByText("+5.00")).toBeTruthy();
    });

    it("isRelaying=false + エントリがリレー記録（is_relaying=true）のとき「初」を表示する", () => {
      renderBadge({
        currentTime: 55.0,
        isRelaying: false,
        precomputedBestTimes: [makeBestTime({ time: 50.0, is_relaying: true })],
      });

      expect(screen.getByText(FIRST_LABEL)).toBeTruthy();
    });

    it("isRelaying=true で relayingTime.id === recordId（自身が現行リレーベスト）のとき何も表示しない", () => {
      renderBadge({
        recordId: "record-1",
        currentTime: 50.0,
        isRelaying: true,
        precomputedBestTimes: [
          makeBestTime({
            time: 60.0,
            is_relaying: false,
            relayingTime: { id: "record-1", time: 50.0, created_at: "2025-01-01T00:00:00.000Z" },
          }),
        ],
      });

      expectNoBadge();
    });
  });

  // ------------------------------------------------------------------
  // 3. 非 precomputed パス（RecordAPI.getPreviousBestTime 経由）
  // ------------------------------------------------------------------

  describe("getPreviousBestTime パス", () => {
    it("過去ベストより速いとき「自己ベスト」+ マイナス差分を表示する（引数も検証）", async () => {
      mockGetPreviousBestTime.mockResolvedValue(60.0);

      renderBadge({ currentTime: 58.77 });

      await waitFor(() => {
        expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
        expect(screen.getByText("-1.23")).toBeTruthy();
      });

      // styleId, poolType(??0), recordId, isRelaying(??false), recordDate の順で呼ばれる
      expect(mockGetPreviousBestTime).toHaveBeenCalledWith(1, 1, "record-1", false, "2025-03-01");
    });

    it("過去ベストより遅いとき「自己ベスト」+ プラス差分を表示する", async () => {
      mockGetPreviousBestTime.mockResolvedValue(55.0);

      renderBadge({ currentTime: 57.5 });

      await waitFor(() => {
        expect(screen.getByText(PERSONAL_BEST_LABEL)).toBeTruthy();
        expect(screen.getByText("+2.50")).toBeTruthy();
      });
    });

    it("過去ベストが null（初記録）のとき「初」を表示する", async () => {
      mockGetPreviousBestTime.mockResolvedValue(null);

      renderBadge({ currentTime: 60.0 });

      await waitFor(() => {
        expect(screen.getByText(FIRST_LABEL)).toBeTruthy();
      });
    });

    it("poolType=null / isRelaying 未指定のときデフォルト (0, false) で問い合わせる", async () => {
      mockGetPreviousBestTime.mockResolvedValue(null);

      const supabase = createMockSupabaseClient();
      mockUseAuth.mockReturnValue({ supabase });
      render(
        <BestTimeBadge
          recordId="record-1"
          styleId={2}
          currentTime={60.0}
          recordDate="2025-03-01"
          poolType={null}
        />,
      );

      await waitFor(() => {
        expect(mockGetPreviousBestTime).toHaveBeenCalledWith(2, 0, "record-1", false, "2025-03-01");
      });
    });

    it("取得エラー時は console.error を呼び何も表示しない（初の誤表示防止）", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetPreviousBestTime.mockRejectedValue(new Error("DB error"));

      renderBadge({ currentTime: 60.0 });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("ベストタイムチェックエラー:", expect.any(Error));
      });
      expectNoBadge();

      consoleSpy.mockRestore();
    });
  });

  // ------------------------------------------------------------------
  // 4. ガード条件（判定不能時は非表示 + API 未呼び出し）
  // ------------------------------------------------------------------

  describe("ガード条件", () => {
    it("styleId が undefined のとき何も表示せず API を呼ばない", () => {
      renderBadge({ styleId: undefined });

      expectNoBadge();
      expect(mockGetPreviousBestTime).not.toHaveBeenCalled();
    });

    it("recordDate が null のとき何も表示せず API を呼ばない", () => {
      renderBadge({ recordDate: null });

      expectNoBadge();
      expect(mockGetPreviousBestTime).not.toHaveBeenCalled();
    });

    it("currentTime が 0 のとき何も表示せず API を呼ばない", () => {
      renderBadge({ currentTime: 0 });

      expectNoBadge();
      expect(mockGetPreviousBestTime).not.toHaveBeenCalled();
    });

    it("precomputed パスでも currentTime=0 なら何も表示しない", () => {
      renderBadge({
        currentTime: 0,
        precomputedBestTimes: [makeBestTime({ time: 60.0 })],
      });

      expectNoBadge();
    });
  });
});
