// =============================================================================
// time.test.ts - Result of Swimming のタイム文字列 <-> ms 変換
// =============================================================================
// Phase 0 実測で確認した入力フォーマット (result.swim.or.jp /api/v1):
//   result_time            "49.52" (ss.cc) / "3:49.31" (m:ss.cc) / "15:27.00" (mm:ss.cc)
//   passing_time.record    "0:23.74" (先頭が 0: の m:ss.cc)
//   DSQ/DNS 時             "" (空文字)
// 検証観点:
//   [V-T1] 3種のフォーマットを ms 整数へ誤差なく変換する
//   [V-T2] 欠損 ("" / null / 不正文字列) は null を返し、0 を返さない
//   [V-T3] float 経由の実装では落ちる精度ケースを ms 整数で通す
//   [V-T4] formatMsToTime は 60秒未満を ss.cc、以上を m:ss.cc で表示する
//   [V-T5] parse -> format -> parse が往復で一致する
// =============================================================================

import { describe, expect, it } from "vitest";
import { formatMsToTime, parseTimeToMs } from "../../../utils/racePace/time";

describe("parseTimeToMs", () => {
  it("[V-T1] ss.cc を ms へ変換する", () => {
    expect(parseTimeToMs("49.52")).toBe(49520);
    expect(parseTimeToMs("23.80")).toBe(23800);
  });

  it("[V-T1] m:ss.cc / mm:ss.cc を ms へ変換する", () => {
    expect(parseTimeToMs("0:23.74")).toBe(23740);
    expect(parseTimeToMs("1:50.25")).toBe(110250);
    expect(parseTimeToMs("3:49.31")).toBe(229310);
    expect(parseTimeToMs("15:27.00")).toBe(927000);
  });

  it("[V-T1] h:mm:ss.cc を ms へ変換する", () => {
    expect(parseTimeToMs("1:02:03.04")).toBe(3723040);
  });

  it("[V-T2] 欠損・不正入力は null を返す (0 ではない)", () => {
    for (const bad of ["", "   ", "DSQ", "失格", "--", "abc", ":", "1:2:3:4"]) {
      expect(parseTimeToMs(bad), `input=${JSON.stringify(bad)}`).toBeNull();
    }
    expect(parseTimeToMs(null)).toBeNull();
    expect(parseTimeToMs(undefined)).toBeNull();
  });

  it("[V-T2] 秒が60以上/分が負などの構造的異常は null を返す", () => {
    expect(parseTimeToMs("1:60.00")).toBeNull();
    expect(parseTimeToMs("-1:00.00")).toBeNull();
  });

  it("[V-T3] centisecond を float 経由せず厳密に扱う", () => {
    // 下記は (秒 + parseFloat("0."+小数)) * 1000 で計算すると float 誤差が出る実在タイム。
    //   32.01   -> float: 32009.999999999996 / 整数: 32010
    //   1:04.01 -> float: 64009.999999999993 / 整数: 64010
    // Math.round を挟めば救えるが、切り捨て表示と組み合わせると 1cs ずれる。
    expect(parseTimeToMs("32.01")).toBe(32010);
    expect(parseTimeToMs("32.02")).toBe(32020);
    expect(parseTimeToMs("32.76")).toBe(32760);
    expect(parseTimeToMs("1:04.01")).toBe(64010);
    expect(parseTimeToMs("1:04.24")).toBe(64240);
    expect(parseTimeToMs("2:00.07")).toBe(120070);
    // 1桁/3桁の小数も受ける (3桁は ms そのもの)
    expect(parseTimeToMs("49.5")).toBe(49500);
    expect(parseTimeToMs("49.523")).toBe(49523);
  });

  it("[V-T3] 1500m の30ラップを合計しても誤差が出ない", () => {
    // Phase 0 実測 (r1500 1着) の 50m 区間タイム全30本
    const segments = [
      "0:28.23", "0:30.05", "0:30.84", "0:30.67", "0:30.76", "0:30.95",
      "0:31.02", "0:30.89", "0:30.98", "0:31.01", "0:30.93", "0:30.95",
      "0:30.97", "0:31.03", "0:31.23", "0:31.01", "0:31.31", "0:31.54",
      "0:31.01", "0:31.55", "0:31.08", "0:31.18", "0:31.59", "0:31.60",
      "0:30.68", "0:31.12", "0:31.13", "0:31.13", "0:30.40", "0:30.16",
    ];
    const total = segments.reduce((acc, s) => acc + (parseTimeToMs(s) ?? 0), 0);
    expect(total).toBe(parseTimeToMs("15:27.00"));
    expect(total).toBe(927000);
  });
});

describe("formatMsToTime", () => {
  it("[V-T4] 60秒未満は ss.cc、以上は m:ss.cc", () => {
    expect(formatMsToTime(49520)).toBe("49.52");
    expect(formatMsToTime(9870)).toBe("9.87");
    expect(formatMsToTime(110250)).toBe("1:50.25");
    expect(formatMsToTime(927000)).toBe("15:27.00");
    expect(formatMsToTime(60000)).toBe("1:00.00");
  });

  it("[V-T4] ms 端数は centisecond へ切り捨てる (繰り上げで嘘のタイムを作らない)", () => {
    expect(formatMsToTime(49529)).toBe("49.52");
  });

  it("[V-T5] parse -> format -> parse が往復一致する", () => {
    for (const s of ["49.52", "1:50.25", "3:49.31", "15:27.00"]) {
      const ms = parseTimeToMs(s);
      expect(ms).not.toBeNull();
      expect(parseTimeToMs(formatMsToTime(ms as number))).toBe(ms);
    }
  });
});
