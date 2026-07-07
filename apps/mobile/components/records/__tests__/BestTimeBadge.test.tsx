// =============================================================================
// BestTimeBadge.test.tsx - 自己ベストバッジのテスト
// =============================================================================
// 3状態モデル (web ShareBadgeState ポート。詳細画面・シェアカード向け) の検証:
// - 初記録: 「初」(first)
// - ベスト更新 (±0含む, BEST_EPSILON=0.005): 「自己ベスト」+ 符号付き差分 (best)
// - ベストより遅い: 「自己ベスト」+ 符号付き差分 (slower)
// - 判定不能 (previousBest 不明 / ガード / エラー): 非表示 (none)
//
// 一覧パス (showDiff=false。web components/ui/BestTimeBadge.tsx と同一アルゴリズム) の検証:
// - 「その記録の記録日時点で自己ベストだったか」を2クエリ (大会/一括) の min で判定
// - ベストのときのみ「自己ベスト」バッジ (差分なし)、それ以外・判定不能は非表示
//
// i18n は vitest.setup.ts のモックが実 ja.json を解決するため、
// "初" / "自己ベスト" の実値でアサートする。
// =============================================================================

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { createMockSupabaseClient, createMockQueryBuilder } from "@/__mocks__/supabase";
import type { MockSupabaseClient, MockQueryBuilder } from "@/__mocks__/supabase";

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
        showDiff={props.showDiff}
      />,
    ),
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
  // 2. 一覧パス（showDiff=false: web 一覧 BestTimeBadge と同一の非同期履歴判定）
  // ------------------------------------------------------------------

  describe("一覧パス (showDiff=false)", () => {
    /**
     * 一覧パス用の Supabase モックを生成する。
     * from() の呼び出し順 = 実装のクエリ構築順（1回目: 大会記録, 2回目: 一括登録）。
     */
    function createListSupabase(
      options: {
        userId?: string;
        competitionRows?: Array<{ id: string; time: number }>;
        bulkRows?: Array<{ id: string; time: number }>;
        queryError?: unknown;
      } = {},
    ) {
      const supabase = createMockSupabaseClient({ userId: options.userId ?? "user-1" });
      const builders: MockQueryBuilder<unknown>[] = [];
      (supabase.from as unknown as Mock).mockImplementation(() => {
        const data =
          builders.length === 0 ? (options.competitionRows ?? []) : (options.bulkRows ?? []);
        const builder = createMockQueryBuilder<unknown>(data, options.queryError ?? null);
        builders.push(builder);
        return builder;
      });
      return { supabase, builders };
    }

    /** 2クエリ (大会/一括) の実行完了と state 反映を待つ */
    async function waitForListQueries(supabase: MockSupabaseClient) {
      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledTimes(2);
      });
      // Promise.all → setState のマイクロタスクを flush する
      await act(async () => {});
    }

    it("過去記録がないとき（記録日時点で初ベスト）「自己ベスト」バッジのみ表示する", async () => {
      const { supabase } = createListSupabase();

      renderBadge({ currentTime: 55.0, showDiff: false }, supabase);

      expect(await screen.findByText(PERSONAL_BEST_LABEL)).toBeTruthy();
      // 一覧パスは「初」バッジ・差分ラベルを出さない (web 一覧に存在しないため)
      expect(screen.queryByText(FIRST_LABEL)).toBeNull();
      expect(supabase.from).toHaveBeenCalledTimes(2);
      expect(supabase.from).toHaveBeenCalledWith("records");
      // 一覧パスは RecordAPI.getPreviousBestTime を使わない
      expect(mockGetPreviousBestTime).not.toHaveBeenCalled();
    });

    it("過去ベスト (大会/一括の min) より速いとき「自己ベスト」を表示する", async () => {
      const { supabase } = createListSupabase({
        competitionRows: [{ id: "other-1", time: 55.0 }],
        bulkRows: [{ id: "other-2", time: 50.0 }],
      });

      renderBadge({ currentTime: 49.5, showDiff: false }, supabase);

      expect(await screen.findByText(PERSONAL_BEST_LABEL)).toBeTruthy();
    });

    it("過去ベスト (min=一括 50.0) 以上のタイムのとき何も表示しない", async () => {
      // 大会ベスト 55.0 よりは速いが一括ベスト 50.0 より遅い → min 比較で非表示
      const { supabase } = createListSupabase({
        competitionRows: [{ id: "other-1", time: 55.0 }],
        bulkRows: [{ id: "other-2", time: 50.0 }],
      });

      renderBadge({ currentTime: 52.0, showDiff: false }, supabase);

      await waitForListQueries(supabase);
      expectNoBadge();
    });

    it("同タイムのとき何も表示しない (web と同じ currentTime < previousBest 判定)", async () => {
      const { supabase } = createListSupabase({
        competitionRows: [{ id: "other-1", time: 55.0 }],
      });

      renderBadge({ currentTime: 55.0, showDiff: false }, supabase);

      await waitForListQueries(supabase);
      expectNoBadge();
    });

    it("クエリ条件が web 一覧判定と一致する (自己除外・水路・リレー・記録日比較)", async () => {
      const { supabase, builders } = createListSupabase();

      renderBadge(
        {
          recordId: "record-1",
          styleId: 1,
          currentTime: 55.0,
          recordDate: "2025-03-01",
          poolType: 1,
          isRelaying: true,
          showDiff: false,
        },
        supabase,
      );

      await waitForListQueries(supabase);
      const [competitionQuery, bulkQuery] = builders;

      // 1. 大会記録クエリ: competitions.date < recordDate
      expect(competitionQuery.select).toHaveBeenCalledWith(
        "id, time, competition:competitions!inner(date)",
      );
      expect(competitionQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(competitionQuery.eq).toHaveBeenCalledWith("style_id", 1);
      expect(competitionQuery.eq).toHaveBeenCalledWith("is_relaying", true);
      expect(competitionQuery.eq).toHaveBeenCalledWith("pool_type", 1);
      expect(competitionQuery.neq).toHaveBeenCalledWith("id", "record-1");
      expect(competitionQuery.lt).toHaveBeenCalledWith("competition.date", "2025-03-01");
      expect(competitionQuery.order).toHaveBeenCalledWith("time", { ascending: true });
      expect(competitionQuery.limit).toHaveBeenCalledWith(1);

      // 2. 一括登録クエリ: created_at < 正規化 recordDate (YYYY-MM-DD → T00:00:00.000Z)
      expect(bulkQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(bulkQuery.eq).toHaveBeenCalledWith("style_id", 1);
      expect(bulkQuery.eq).toHaveBeenCalledWith("is_relaying", true);
      expect(bulkQuery.eq).toHaveBeenCalledWith("pool_type", 1);
      expect(bulkQuery.is).toHaveBeenCalledWith("competition_id", null);
      expect(bulkQuery.neq).toHaveBeenCalledWith("id", "record-1");
      expect(bulkQuery.lt).toHaveBeenCalledWith("created_at", "2025-03-01T00:00:00.000Z");
      expect(bulkQuery.order).toHaveBeenCalledWith("time", { ascending: true });
      expect(bulkQuery.limit).toHaveBeenCalledWith(1);
    });

    it("poolType が null のとき pool_type フィルタを適用しない (web と同一の分岐)", async () => {
      const { supabase, builders } = createListSupabase();

      renderBadge({ currentTime: 55.0, poolType: null, showDiff: false }, supabase);

      await waitForListQueries(supabase);
      const [competitionQuery, bulkQuery] = builders;
      expect(competitionQuery.eq).not.toHaveBeenCalledWith("pool_type", expect.anything());
      expect(bulkQuery.eq).not.toHaveBeenCalledWith("pool_type", expect.anything());
    });

    it("recordDate が ISO タイムスタンプのときはそのまま created_at と比較する", async () => {
      const { supabase, builders } = createListSupabase();

      renderBadge(
        { currentTime: 55.0, recordDate: "2025-03-01T10:00:00.000Z", showDiff: false },
        supabase,
      );

      await waitForListQueries(supabase);
      const [, bulkQuery] = builders;
      expect(bulkQuery.lt).toHaveBeenCalledWith("created_at", "2025-03-01T10:00:00.000Z");
    });

    it("styleId がないとき何も表示せずクエリも実行しない", async () => {
      const { supabase } = createListSupabase();

      renderBadge({ styleId: undefined, showDiff: false }, supabase);

      await act(async () => {});
      expectNoBadge();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("recordDate がないとき何も表示せずクエリも実行しない", async () => {
      const { supabase } = createListSupabase();

      renderBadge({ recordDate: null, showDiff: false }, supabase);

      await act(async () => {});
      expectNoBadge();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("未認証のとき何も表示せずクエリも実行しない", async () => {
      const { supabase } = createListSupabase({ userId: "" });

      renderBadge({ currentTime: 55.0, showDiff: false }, supabase);

      await waitFor(() => {
        expect(supabase.auth.getUser).toHaveBeenCalled();
      });
      await act(async () => {});
      expectNoBadge();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("クエリエラー時は console.error を呼び何も表示しない", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { supabase } = createListSupabase({ queryError: new Error("DB error") });

      renderBadge({ currentTime: 55.0, showDiff: false }, supabase);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("ベストタイムチェックエラー:", expect.any(Error));
      });
      expectNoBadge();

      consoleSpy.mockRestore();
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
  });
});
