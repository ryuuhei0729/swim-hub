/**
 * LP v4.2 — ストップウォッチ ロジックテスト
 *
 * Sprint Contract 検証観点:
 *   [V-04] ロード直後の状態は READY / 表示 "00:00.00"
 *   [V-04] start() 後の状態は LIVE
 *   [V-04] stop() 後の状態は FINISH で時刻が停止している
 *   [V-04] started=false の状態で stop() を呼んでもエラーなし
 *   [V-04] stopped=true の状態で start() を再呼び出しても再起動しない（再開なし）
 *   [V-05] formatStopwatchTime(0) === "00:00.00"
 *   [V-05] formatStopwatchTime(61000) === "01:01.00"（1分1秒）
 *   [V-05] formatStopwatchTime(3661234) === "61:01.23"（mm が2桁以上も正しく表示）
 *   [V-05] formatStopwatchTime(999) === "00:00.99"（コンマ秒）
 *
 * 検証手段: [unit]
 *
 * Developer への要求:
 *   以下の純粋関数・型を
 *   `app/[locale]/_components/lp/utils/stopwatchUtils.ts`
 *   に実装・export すること。
 *
 *   ```ts
 *   export type StopwatchStatus = "READY" | "LIVE" | "FINISH";
 *
 *   export type StopwatchState = {
 *     status: StopwatchStatus;
 *     elapsedMs: number;  // 停止時点のミリ秒。READY 時は 0
 *   };
 *
 *   /**
 *    * performance.now() 相当のタイムスタンプを外部から受け取り、
 *    * ブラウザ環境に依存せず純粋にテスト可能な状態遷移関数。
 *    *
 *    * @param current 現在の状態
 *    * @param event   "START" | "STOP"
 *    * @param now     performance.now() の値（START 時: 開始時刻基準、STOP 時: 終了時刻）
 *    * @param t0      START イベント時に記録した開始時刻（STOP イベント時に渡す）
 *    *\/
 *   export function transitionStopwatch(
 *     current: StopwatchState,
 *     event: "START" | "STOP",
 *     now: number,
 *     t0?: number
 *   ): StopwatchState;
 *
 *   /**
 *    * 経過ミリ秒を "mm:ss.cc" 形式の文字列に変換する。
 *    * cc = 1/100秒（センチ秒）。常に2桁ゼロパディング。
 *    *\/
 *   export function formatStopwatchTime(elapsedMs: number): string;
 *   ```
 */

import { describe, expect, it } from "vitest";
import {
  transitionStopwatch,
  formatStopwatchTime,
  type StopwatchState,
} from "@/app/[locale]/_components/lp/utils/stopwatchUtils";

describe("transitionStopwatch — ストップウォッチ状態遷移", () => {
  const initialState: StopwatchState = { status: "READY", elapsedMs: 0 };

  describe("READY → LIVE (START イベント)", () => {
    it("READY 状態で START を受けると LIVE になる", () => {
      const next = transitionStopwatch(initialState, "START", 1000);
      expect(next.status).toBe("LIVE");
    });

    it("LIVE 状態で START を再呼び出しても状態変化なし（再開なし）", () => {
      const liveState: StopwatchState = { status: "LIVE", elapsedMs: 0 };
      const next = transitionStopwatch(liveState, "START", 5000);
      expect(next.status).toBe("LIVE");
    });

    it("FINISH 状態で START を呼んでも再起動しない", () => {
      const finishState: StopwatchState = { status: "FINISH", elapsedMs: 12345 };
      const next = transitionStopwatch(finishState, "START", 99999);
      expect(next.status).toBe("FINISH");
      expect(next.elapsedMs).toBe(12345);
    });
  });

  describe("LIVE → FINISH (STOP イベント)", () => {
    it("LIVE 状態で STOP を受けると FINISH になり elapsedMs が記録される", () => {
      const liveState: StopwatchState = { status: "LIVE", elapsedMs: 0 };
      const t0 = 1000;
      const now = 13500; // 12500ms 経過
      const next = transitionStopwatch(liveState, "STOP", now, t0);
      expect(next.status).toBe("FINISH");
      expect(next.elapsedMs).toBe(12500);
    });

    it("READY 状態で STOP を呼んでもエラーなし、状態変化しない", () => {
      expect(() => transitionStopwatch(initialState, "STOP", 5000)).not.toThrow();
      const next = transitionStopwatch(initialState, "STOP", 5000);
      expect(next.status).toBe("READY");
    });

    it("FINISH 状態で STOP を再呼び出ししてもエラーなし、elapsedMs 不変", () => {
      const finishState: StopwatchState = { status: "FINISH", elapsedMs: 52860 };
      const next = transitionStopwatch(finishState, "STOP", 99999, 0);
      expect(next.status).toBe("FINISH");
      expect(next.elapsedMs).toBe(52860);
    });
  });
});

describe("formatStopwatchTime — mm:ss.cc 形式フォーマット", () => {
  it("0ms は '00:00.00'", () => {
    expect(formatStopwatchTime(0)).toBe("00:00.00");
  });

  it("999ms は '00:00.99'（コンマ秒2桁）", () => {
    expect(formatStopwatchTime(999)).toBe("00:00.99");
  });

  it("1000ms は '00:01.00'（1秒）", () => {
    expect(formatStopwatchTime(1000)).toBe("00:01.00");
  });

  it("61000ms は '01:01.00'（1分1秒）", () => {
    expect(formatStopwatchTime(61000)).toBe("01:01.00");
  });

  it("52860ms は '00:52.86'（デザイン参照値: reduced-motion 表示値の回帰用 — アニメ停止時に固定表示されるデザイン指定値）", () => {
    // reduced-motion 環境では animation が無効化され、LpStopwatch はこの固定値を表示する。
    // デザイン指定値 (52860ms = 00:52.86) が将来の実装変更で変わらないことを保証するための回帰テスト。
    expect(formatStopwatchTime(52860)).toBe("00:52.86");
  });

  it("3661234ms は '61:01.23'（mm が2桁超の場合も正しく表示）", () => {
    expect(formatStopwatchTime(3661234)).toBe("61:01.23");
  });

  it("10ms は '00:00.01'（センチ秒の端数）", () => {
    expect(formatStopwatchTime(10)).toBe("00:00.01");
  });

  it("負数でもエラーなし", () => {
    expect(() => formatStopwatchTime(-1)).not.toThrow();
  });
});
