// =============================================================================
// BestTimeBadge.test.tsx - 自己ベストバッジのテスト
// =============================================================================
// 3状態モデル (web ShareBadgeState ポート。詳細画面・シェアカード向け) の検証:
// - 初記録: 「初」(first)
// - ベスト更新 (±0含む, BEST_EPSILON=0.005): 「自己ベスト」+ 符号付き差分 (best)
// - ベストより遅い: 「自己ベスト」+ 符号付き差分 (slower)
// - 判定不能 (previousBest 不明 / ガード / エラー): 非表示 (none)
//
// 一覧パス (showDiff=false。web components/ui/BestTimeBadge.tsx と同一判定) の検証:
// - グループ単位の共有キャッシュクエリ (useListBestCandidatesQuery →
//   RecordAPI.getListBestCandidates) で候補を一括取得し、
//   computeListPreviousBest (shared/utils/bestTimeBadge、純関数テストは shared 側)
//   が「記録日時点の過去ベスト」をメモリ上で判定
// - 2026-07-22 Sprint: shared getBestBadgeState により「初/Best-X.XX/Best+X.XX」の
//   3状態を常時表示する(以前は「自己ベストのときのみ表示・それ以外は非表示」の2状態だった)。
//   「Best」「±」はASCII固定・i18n しない。i18n されるのは「初」(recordMobile.bestBadge.first
//   を流用)のみ。判定不能・ガード・エラー時のみ非表示のまま。
// - 同一グループの複数行でフェッチが1回に集約される (N+1 回避)
//
// i18n は vitest.setup.ts のモックが実 ja.json を解決するため、
// "初" / "自己ベスト" の実値でアサートする。
// =============================================================================

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__mocks__/supabase";
import type { MockSupabaseClient } from "@/__mocks__/supabase";
import { createQueryWrapper } from "@/__tests__/helpers/testUtils";
import type { ListBestCandidates } from "@apps/shared/api/records";

// --- AuthProvider モック ---
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// --- RecordAPI モック (3状態パス: getPreviousBestTime / 一覧パス: getListBestCandidates) ---
const mockGetPreviousBestTime = vi.hoisted(() => vi.fn());
const mockGetListBestCandidates = vi.hoisted(() => vi.fn());
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getPreviousBestTime: mockGetPreviousBestTime,
    getListBestCandidates: mockGetListBestCandidates,
  })),
}));

import BestTimeBadge, { getBadgeState } from "../BestTimeBadge";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const FIRST_LABEL = "初"; // recordMobile.bestBadge.first
const PERSONAL_BEST_LABEL = "自己ベスト"; // recordMobile.bestBadge.personalBest

/** 一覧パス用の候補フィクスチャ */
function candidates(partial: Partial<ListBestCandidates> = {}): ListBestCandidates {
  return { competitionRows: [], bulkRows: [], ...partial };
}

/** BestTimeBadge をデフォルト props でレンダリングする */
function renderBadge(
  props: Partial<React.ComponentProps<typeof BestTimeBadge>> = {},
  supabase: MockSupabaseClient = createMockSupabaseClient(),
  user: { id: string } | null = { id: "user-1" },
) {
  // 一覧パスは supabase.auth.getUser() ではなく AuthProvider の user を参照する
  mockUseAuth.mockReturnValue({ supabase, user });

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
      { wrapper: createQueryWrapper() },
    ),
  };
}

/**
 * バッジが一切表示されていないことを確認。
 * 2026-07-22 3状態化: 一覧パスは「Best-X.XX」/「Best+X.XX」/「Best±0.00」も新たに
 * 表示され得るため、FIRST_LABEL/PERSONAL_BEST_LABEL だけでなく "Best" 接頭辞パターンの
 * 不在も確認する(でないと一覧パスの新表示を見逃して偽陽性 pass になる)。
 */
function expectNoBadge() {
  expect(screen.queryByText(FIRST_LABEL)).toBeNull();
  expect(screen.queryByText(PERSONAL_BEST_LABEL)).toBeNull();
  expect(screen.queryByText(/^Best[-+±]/)).toBeNull();
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
  // 2. 一覧パス（showDiff=false: グループ共有クエリ + メモリ上判定）
  //    computeListPreviousBest 純関数の詳細は shared/__tests__/utils/bestTimeBadge.test.ts
  // ------------------------------------------------------------------

  describe("一覧パス (showDiff=false)", () => {
    it("過去記録がないとき（記録日時点で初ベスト）「初」バッジを表示する", async () => {
      mockGetListBestCandidates.mockResolvedValue(candidates());

      renderBadge({ currentTime: 55.0, showDiff: false });

      expect(await screen.findByText(FIRST_LABEL)).toBeTruthy();
      // 「自己ベスト」(3状態パス専用ラベル)は一覧パスには出ない
      expect(screen.queryByText(PERSONAL_BEST_LABEL)).toBeNull();
      // (userId, styleId, isRelaying, poolType) のグループ単位で候補を一括取得する
      expect(mockGetListBestCandidates).toHaveBeenCalledWith("user-1", 1, false, 1);
      // 一覧パスは RecordAPI.getPreviousBestTime を使わない
      expect(mockGetPreviousBestTime).not.toHaveBeenCalled();
    });

    it("過去ベスト (大会/一括の min) より速いとき「Best-X.XX」(改善・マイナス符号) を表示する", async () => {
      mockGetListBestCandidates.mockResolvedValue(
        candidates({
          competitionRows: [{ id: "other-1", time: 55.0, date: "2025-02-01" }],
          bulkRows: [{ id: "other-2", time: 50.0, created_at: "2025-02-15T00:00:00.000Z" }],
        }),
      );

      // min(55.0, 50.0)=50.0 が過去ベスト。49.5 - 50.0 = -0.5 改善
      renderBadge({ currentTime: 49.5, showDiff: false });

      expect(await screen.findByText("Best-0.50")).toBeTruthy();
    });

    it(
      "[2026-07-22 3状態化] 過去ベスト (min=一括 50.0) 以上のタイムのとき「Best+X.XX」" +
        "(悪化・プラス符号) を表示する(旧仕様の非表示から変更)",
      async () => {
        // 大会ベスト 55.0 よりは速いが一括ベスト 50.0 より遅い → min=50.0 が過去ベスト
        mockGetListBestCandidates.mockResolvedValue(
          candidates({
            competitionRows: [{ id: "other-1", time: 55.0, date: "2025-02-01" }],
            bulkRows: [{ id: "other-2", time: 50.0, created_at: "2025-02-15T00:00:00.000Z" }],
          }),
        );

        // 52.0 - 50.0 = +2.0 悪化
        renderBadge({ currentTime: 52.0, showDiff: false });

        expect(await screen.findByText("Best+2.00")).toBeTruthy();
        expect(screen.queryByText(FIRST_LABEL)).toBeNull();
      },
    );

    it(
      "[2026-07-22 3状態化] 同タイムのとき「Best±0.00」(同値=ベスト扱い・amber。" +
        "2026-07-22追加変更: best配色はblue→amberに変更され初と同色になった) を表示する" +
        "(旧仕様の非表示から変更)",
      async () => {
        mockGetListBestCandidates.mockResolvedValue(
          candidates({
            competitionRows: [{ id: "other-1", time: 55.0, date: "2025-02-01" }],
          }),
        );

        renderBadge({ currentTime: 55.0, showDiff: false });

        expect(await screen.findByText("Best±0.00")).toBeTruthy();
      },
    );

    it("記録日以降の候補と自分自身はメモリ上のフィルタで除外される(=記録日時点で初ベスト→「初」表示)", async () => {
      mockGetListBestCandidates.mockResolvedValue(
        candidates({
          competitionRows: [
            { id: "record-1", time: 40.0, date: "2025-02-01" }, // 自分自身
            { id: "other-1", time: 45.0, date: "2025-03-01" }, // 記録日と同日
          ],
          bulkRows: [
            { id: "other-2", time: 48.0, created_at: "2025-04-01T00:00:00.000Z" }, // 記録日より後
          ],
        }),
      );

      // 全候補が除外される = 記録日時点で初ベスト → 「初」バッジ表示
      renderBadge({ recordId: "record-1", currentTime: 55.0, showDiff: false });

      expect(await screen.findByText(FIRST_LABEL)).toBeTruthy();
    });

    it("poolType が null のとき poolType なし (null) のグループとして取得する", async () => {
      mockGetListBestCandidates.mockResolvedValue(candidates());

      renderBadge({ currentTime: 55.0, poolType: null, showDiff: false });

      await waitFor(() => {
        expect(mockGetListBestCandidates).toHaveBeenCalledWith("user-1", 1, false, null);
      });
    });

    it("同一グループの複数バッジでフェッチが1回に集約される (N+1 回避)", async () => {
      mockGetListBestCandidates.mockResolvedValue(
        candidates({
          competitionRows: [{ id: "other-1", time: 55.0, date: "2025-02-01" }],
        }),
      );
      mockUseAuth.mockReturnValue({
        supabase: createMockSupabaseClient(),
        user: { id: "user-1" },
      });

      render(
        <>
          <BestTimeBadge
            recordId="record-1"
            styleId={1}
            currentTime={50.0}
            recordDate="2025-03-01"
            poolType={1}
            isRelaying={false}
            showDiff={false}
          />
          <BestTimeBadge
            recordId="record-2"
            styleId={1}
            currentTime={60.0}
            recordDate="2025-03-05"
            poolType={1}
            isRelaying={false}
            showDiff={false}
          />
        </>,
        { wrapper: createQueryWrapper() },
      );

      // record-1 は過去ベスト 55.0 より速い(50.0 - 55.0 = -5.0) → 「Best-5.00」
      // record-2 は過去ベスト 55.0 より遅い(60.0 - 55.0 = +5.0) → 「Best+5.00」
      // 2026-07-22 3状態化: 以前は非ベストの record-2 は非表示だったが、今は両方常時表示される
      expect(await screen.findByText("Best-5.00")).toBeTruthy();
      expect(screen.getByText("Best+5.00")).toBeTruthy();
      // 同一 (userId, styleId, isRelaying, poolType) グループなのでフェッチは1回
      expect(mockGetListBestCandidates).toHaveBeenCalledTimes(1);
    });

    it("styleId がないとき何も表示せずフェッチもしない", async () => {
      renderBadge({ styleId: undefined, showDiff: false });

      await act(async () => {});
      expectNoBadge();
      expect(mockGetListBestCandidates).not.toHaveBeenCalled();
    });

    it("recordDate がないとき何も表示せずフェッチもしない", async () => {
      renderBadge({ recordDate: null, showDiff: false });

      await act(async () => {});
      expectNoBadge();
      expect(mockGetListBestCandidates).not.toHaveBeenCalled();
    });

    it("未認証のとき何も表示せずフェッチもしない", async () => {
      const { supabase } = renderBadge({ currentTime: 55.0, showDiff: false }, undefined, null);

      await act(async () => {});
      expectNoBadge();
      expect(mockGetListBestCandidates).not.toHaveBeenCalled();
      // AuthProvider の user を使うため、行ごとの getUser() は発行しない
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });

    it("クエリエラー時は console.error を呼び何も表示しない", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetListBestCandidates.mockRejectedValue(new Error("DB error"));

      renderBadge({ currentTime: 55.0, showDiff: false });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("ベストタイムチェックエラー:", expect.any(Error));
      });
      expectNoBadge();

      consoleSpy.mockRestore();
    });
  });

  // ------------------------------------------------------------------
  // 3. 非一覧パス（RecordAPI.getPreviousBestTime 経由）
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
        { wrapper: createQueryWrapper() },
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
