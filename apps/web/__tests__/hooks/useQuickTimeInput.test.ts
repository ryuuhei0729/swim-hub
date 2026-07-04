import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useQuickTimeInput } from "../../components/forms/shared/TimeInput/hooks/useQuickTimeInput";

describe("useQuickTimeInput", () => {
  // ===========================================================================
  // 回帰テスト: 「1-12-2」確定後にフィールドを削除して「33-3」を入力すると
  // 「1:33.3」になってしまうバグ。削除時に resetContext が呼ばれることで、
  // 前回入力の「分」が新規入力に引き継がれないことを保証する。
  // ===========================================================================
  describe("コンテキストのリセット（削除→再入力バグの回帰テスト）", () => {
    it("分あり入力（1-12-2）の後に resetContext すると、2パーツ再入力（33-3）に分が引き継がれない", () => {
      const { result } = renderHook(() => useQuickTimeInput());

      // Step 1: 「1-12-2」を確定 → 72.2秒（内部 context に minutes:1 が記憶される）
      act(() => {
        const parsed = result.current.parseInput("1-12-2");
        expect(parsed.time).toBeCloseTo(72.2);
        expect(parsed.displayValue).toBe("1:12.2");
      });

      // Step 2: フィールドを空にした（削除した）= resetContext が呼ばれる
      act(() => {
        result.current.resetContext();
      });

      // Step 3: 「33-3」を再入力 → 33.3秒 でなければならない（1:33.3 = 93.3 ではない）
      act(() => {
        const parsed = result.current.parseInput("33-3");
        expect(parsed.time).toBeCloseTo(33.3);
        expect(parsed.time).not.toBeCloseTo(93.3);
        expect(parsed.displayValue).toBe("33.3");
      });
    });

    it("【現仕様の確認】resetContext を呼ばない連続入力では分が引き継がれる（この挙動は壊さない）", () => {
      const { result } = renderHook(() => useQuickTimeInput());

      // 削除せず連続入力した場合は、分引き継ぎ機能により 93.3 になるのが現仕様。
      // バグ修正は「削除（空）時に resetContext を呼ぶ」ことであり、
      // 連続入力そのものの仕様は変えない、という境界を明示する。
      act(() => {
        expect(result.current.parseInput("1-12-2").time).toBeCloseTo(72.2);
      });
      act(() => {
        expect(result.current.parseInput("33-3").time).toBeCloseTo(93.3);
      });
    });
  });

  // ===========================================================================
  // 既存の連続入力機能が壊れていないことの確認
  // ===========================================================================
  describe("連続入力機能（リグレッション防止）", () => {
    it("分引き継ぎ: 1-05-3 の後に別フィールド相当で 8-3 を入力すると 1:08.30", () => {
      const { result } = renderHook(() => useQuickTimeInput());

      act(() => {
        expect(result.current.parseInput("1-05-3").time).toBeCloseTo(65.3);
      });
      act(() => {
        // 時間計算ロジックの検証が目的。表示フォーマットは formatter 側のテストに委ねる
        const parsed = result.current.parseInput("8-3");
        expect(parsed.time).toBeCloseTo(68.3);
      });
    });

    it("十の位引き継ぎ: 31-2 の後に 2-3 を入力すると 32.3", () => {
      const { result } = renderHook(() => useQuickTimeInput());

      act(() => {
        expect(result.current.parseInput("31-2").time).toBeCloseTo(31.2);
      });
      act(() => {
        expect(result.current.parseInput("2-3").time).toBeCloseTo(32.3);
      });
    });
  });

  // ===========================================================================
  // モーダルオープン相当のリセット
  // ===========================================================================
  describe("resetContext 後の初回入力", () => {
    it("resetContext した直後の入力はデフォルトコンテキストでパースされる", () => {
      const { result } = renderHook(() => useQuickTimeInput());

      act(() => {
        result.current.parseInput("2-45-8"); // minutes:2 を記憶
      });
      act(() => {
        result.current.resetContext();
      });
      act(() => {
        // 分が残っていれば 2:46.1（166.1）になるが、リセット済みなので 46.1 になる
        const parsed = result.current.parseInput("46-1");
        expect(parsed.time).toBeCloseTo(46.1);
      });
    });
  });
});
