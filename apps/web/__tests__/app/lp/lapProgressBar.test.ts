/**
 * LP v4.2 — ラッププログレスバー ロジックテスト
 *
 * Sprint Contract 検証観点:
 *   [V-03] スクロール率 0% のとき、swimmerLeft=0%、往路幅=0%、復路幅=0%
 *   [V-03] スクロール率 25% のとき、swimmerLeft=50%（往路の折り返し地点）
 *   [V-03] スクロール率 50% のとき、スイマーが右端に到達（swimmerLeft=100%）
 *   [V-03] スクロール率 75% のとき、復路に転換し swimmerLeft=50%
 *   [V-03] スクロール率 100% のとき、スイマーが左端（swimmerLeft=0%）
 *   [V-03] スクロール率 50% 超で back フラグが true になること
 *   [V-03] スクロール率 99.5% 以上で __stopStopwatch が呼ばれること
 *   [V-03] 境界値: scrollHeight === clientHeight（最大スクロール量が0）でエラーなし
 *
 * 検証手段: [unit]
 *
 * Developer への要求:
 *   以下の純粋関数を
 *   `app/[locale]/_components/lp/utils/lapProgressBarUtils.ts`
 *   に実装・export すること。
 *
 *   ```ts
 *   export type LapState = {
 *     leg1Width: number;   // 往路バー幅 (0–100)
 *     leg2Width: number;   // 復路バー幅 (0–100)
 *     swimmerLeft: number; // スイマー left% (0–100)
 *     isBack: boolean;     // 復路フラグ
 *     shouldStop: boolean; // __stopStopwatch を呼ぶべきか
 *   };
 *
 *   export function calcLapState(scrollRatio: number): LapState;
 *   // scrollRatio: 0–100 の数値 (scrollTop / (scrollHeight - clientHeight) * 100)
 *   ```
 */

import { describe, expect, it } from "vitest";
import { calcLapState } from "@/app/[locale]/_components/lp/utils/lapProgressBarUtils";

describe("calcLapState — ラッププログレスバーのスクロール率→状態変換", () => {
  describe("往路フェーズ (scrollRatio 0–50%)", () => {
    it("scrollRatio=0 のとき全幅0、スイマーは左端", () => {
      const state = calcLapState(0);
      expect(state.leg1Width).toBe(0);
      expect(state.leg2Width).toBe(0);
      expect(state.swimmerLeft).toBe(0);
      expect(state.isBack).toBe(false);
      expect(state.shouldStop).toBe(false);
    });

    it("scrollRatio=25: 往路の中間点 → バー幅 50%・スイマーがレーン中央 (往路は 0→100 の映像幅に相当)", () => {
      // 往路フェーズ: leg1Width = pct*2 = 50。スイマーは leg1Width と連動して右進する
      // 視覚的に「ページ 1/4 スクロール = プールの往路を半分泳いだ」位置
      const state = calcLapState(25);
      expect(state.leg1Width).toBe(50);
      expect(state.leg2Width).toBe(0);
      expect(state.swimmerLeft).toBe(50);
      expect(state.isBack).toBe(false);
    });

    it("scrollRatio=50 のとき往路バー幅=100%、スイマーは右端 (isBack は false — 境界は > 50)", () => {
      // 実装は pct > 50 で isBack が立つ。ちょうど 50 は往路の終点 (isBack=false)
      const state = calcLapState(50);
      expect(state.leg1Width).toBe(100);
      expect(state.leg2Width).toBe(0);
      expect(state.swimmerLeft).toBe(100);
      expect(state.isBack).toBe(false);
    });

    it("scrollRatio=50.001 のとき isBack=true — 50 を超えた瞬間に復路に切り替わる", () => {
      // 確定仕様: isBack の切替境界は pct > 50 (厳密な不等号)
      const state = calcLapState(50.001);
      expect(state.isBack).toBe(true);
    });
  });

  describe("復路フェーズ (scrollRatio 50–100%)", () => {
    it("scrollRatio=50 超で isBack=true になること", () => {
      const state = calcLapState(51);
      expect(state.isBack).toBe(true);
    });

    it("scrollRatio=75 のとき復路バー幅=50%、スイマーは中央 (左方向に移動中)", () => {
      const state = calcLapState(75);
      expect(state.leg2Width).toBe(50);
      expect(state.swimmerLeft).toBe(50);
      expect(state.isBack).toBe(true);
    });

    it("scrollRatio=100 のとき復路バー幅=100%、スイマーは左端に戻る", () => {
      const state = calcLapState(100);
      expect(state.leg1Width).toBe(100);
      expect(state.leg2Width).toBe(100);
      expect(state.swimmerLeft).toBe(0);
      expect(state.isBack).toBe(true);
    });
  });

  describe("ゴールタッチ判定", () => {
    it("scrollRatio=99.5 未満では shouldStop=false", () => {
      expect(calcLapState(99).shouldStop).toBe(false);
      expect(calcLapState(99.4).shouldStop).toBe(false);
    });

    it("scrollRatio=99.5 で shouldStop=true", () => {
      expect(calcLapState(99.5).shouldStop).toBe(true);
    });

    it("scrollRatio=100 でも shouldStop=true", () => {
      expect(calcLapState(100).shouldStop).toBe(true);
    });
  });

  describe("境界値・エッジケース", () => {
    it("scrollRatio=-1: 負数は 0 にクランプ → スイマーは左端、バー幅は全て 0", () => {
      // pct = max(0, -1) = 0 なので scrollRatio=0 と同一の挙動
      const state = calcLapState(-1);
      expect(state.swimmerLeft).toBe(0);
      expect(state.leg1Width).toBe(0);
      expect(state.leg2Width).toBe(0);
      expect(state.isBack).toBe(false);
    });

    it("scrollRatio=-50: 大幅負値も 0 にクランプ → 全フィールドが 0 / false", () => {
      // pct = max(0, -50) = 0 なので同上
      const state = calcLapState(-50);
      expect(state.swimmerLeft).toBe(0);
      expect(state.leg1Width).toBe(0);
      expect(state.leg2Width).toBe(0);
      expect(state.isBack).toBe(false);
    });

    it("scrollRatio=105: 100 超はクランプされ、両バー満幅・スイマーが左端に戻る", () => {
      // pct=105: leg1Width=min(100, min(105,50)*2)=100, leg2Width=min(100,(105-50)*2)=100
      // swimmerLeft=100-leg2Width=0 (復路フラグ true)
      const s = calcLapState(105);
      expect(s.leg1Width).toBe(100);
      expect(s.leg2Width).toBe(100);
      expect(s.swimmerLeft).toBe(0);
      expect(s.isBack).toBe(true);
    });

    it("scrollRatio=200: 極端な超過値も同様に両バー満幅・スイマー左端", () => {
      // pct=200: leg1Width=min(100, min(200,50)*2)=100, leg2Width=min(100,(200-50)*2)=100
      // swimmerLeft=100-100=0
      const s = calcLapState(200);
      expect(s.leg1Width).toBe(100);
      expect(s.leg2Width).toBe(100);
      expect(s.swimmerLeft).toBe(0);
      expect(s.isBack).toBe(true);
    });
  });
});

/**
 * スクロール率計算関数のテスト
 *
 * Developer への要求:
 *   ```ts
 *   export function calcScrollRatio(
 *     scrollTop: number,
 *     scrollHeight: number,
 *     clientHeight: number
 *   ): number;
 *   // 戻り値: 0–100 の数値。scrollHeight <= clientHeight のとき 0
 *   ```
 */
import { calcScrollRatio } from "@/app/[locale]/_components/lp/utils/lapProgressBarUtils";

describe("calcScrollRatio — スクロール量→スクロール率変換", () => {
  it("scrollHeight > clientHeight のとき正規化された rate を返す", () => {
    expect(calcScrollRatio(0, 2000, 1000)).toBeCloseTo(0);
    expect(calcScrollRatio(500, 2000, 1000)).toBeCloseTo(50);
    expect(calcScrollRatio(1000, 2000, 1000)).toBeCloseTo(100);
  });

  it("scrollHeight === clientHeight（スクロール不可）のとき 0 を返す", () => {
    expect(calcScrollRatio(0, 800, 800)).toBe(0);
  });

  it("scrollHeight < clientHeight でもエラーなし、0 を返す", () => {
    expect(calcScrollRatio(0, 600, 800)).toBe(0);
  });

  it("scrollTop が max を超えてもエラーなし", () => {
    expect(() => calcScrollRatio(2000, 1500, 500)).not.toThrow();
  });
});
