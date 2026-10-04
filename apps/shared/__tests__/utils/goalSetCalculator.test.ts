// =============================================================================
// shared/utils/goalSetCalculator.test.ts  (S5, D1)
// =============================================================================
// 既存 apps/web/__tests__/utils/goalSetCalculator.test.ts (19件) は web 側 re-export 経由で
// 同じ関数を検証済み。ここでは重複を増やさず「web と mobile が同じ単一実装を参照する」こと
// (係数の二重管理禁止) と、手計算リテラルの固定値・境界のみを持つ。
// 何を壊したら赤くなるべきか:
//   - shared の係数 (1.72 / 7.32 / 0.13 / 2.37 / 1.5) を変える      -> 固定値ケース赤
//   - web 側ファイルが係数を再定義 (re-export でなくなる)            -> fs 検査赤
//   - mobile 配下に calculateGoalSetTargetTime の自前実装が現れる     -> fs 検査赤
// =============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  calculateAge,
  calculateGoalSetTargetTime,
  getStyleCoefficient,
} from "../../utils/goalSetCalculator";

const APPS = path.resolve(__dirname, "../../..");

describe("calculateGoalSetTargetTime (手計算リテラル)", () => {
  it("男20歳 SCM Fr (Y=60): (60-4.95)/1.72 = 32.01", () => {
    expect(calculateGoalSetTargetTime({ Y: 60, X2: 20, X4: 1, X5: 0, X6: 0, X7: 0 })).toBe(32.01);
  });
  it("実施水路が長水路(X5=1): (60-2.58)/1.72 = 33.38", () => {
    expect(calculateGoalSetTargetTime({ Y: 60, X2: 20, X4: 1, X5: 1, X6: 0, X7: 0 })).toBe(33.38);
  });
  it("女15歳 Ba 両水路長水路 (Y=70, X7=1.53): (70-7.71)/1.72 = 36.22", () => {
    expect(calculateGoalSetTargetTime({ Y: 70, X2: 15, X4: 0, X5: 1, X6: 1, X7: 1.53 })).toBe(36.22);
  });
  it("X3 省略は 3 と同値 (主観的達成度の既定)", () => {
    const base = { Y: 60, X2: 20, X4: 1, X5: 0, X6: 0, X7: 0 };
    expect(calculateGoalSetTargetTime(base)).toBe(calculateGoalSetTargetTime({ ...base, X3: 3 }));
  });
  it("戻り値は小数第2位まで (3桁目以降を持たない)", () => {
    const v = calculateGoalSetTargetTime({ Y: 61.234, X2: 17, X4: 1, X5: 0, X6: 1, X7: 0 });
    expect(Number(v.toFixed(2))).toBe(v);
  });
  it("Y=0 でも有限数 (NaN/Infinity にならない)", () => {
    expect(Number.isFinite(calculateGoalSetTargetTime({ Y: 0, X2: 20, X4: 1, X5: 0, X6: 0, X7: 0 }))).toBe(true);
  });
});

describe("getStyleCoefficient", () => {
  it.each([
    ["Fr", 0], ["Fly", 0], ["IM", 0], ["Ba", 1.53], ["Br", 2.34],
    ["ba", 1.53], ["br", 2.34], ["fly", 0],
  ])("%s -> %s (canonical と legacy 全小文字。toStyleCode の対応範囲)", (style, expected) => {
    expect(getStyleCoefficient(style)).toBe(expected);
  });
  it("未知・空文字は 0 (現行 default 分岐。呼び出し側が種目必須を担保する)", () => {
    expect(getStyleCoefficient("xyz")).toBe(0);
    expect(getStyleCoefficient("")).toBe(0);
  });
});

describe("calculateAge", () => {
  afterEach(() => vi.useRealTimers());
  it("誕生日当日に加算される境界 (2026-06-15 を基準)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(calculateAge("2010-06-15")).toBe(16);
    expect(calculateAge("2010-06-16")).toBe(15);
  });
  it("ISO 文字列 (先頭が YYYY-MM-DD) も受理", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(calculateAge("2010-06-15T00:00:00.000Z")).not.toBeNull();
  });
  it.each([null, "", "not-a-date"])("%s -> null", (v) => {
    expect(calculateAge(v as string | null)).toBeNull();
  });
});

describe("定義元の単一性 (fs で現在のファイル内容を読む)", () => {
  it("web の goalSetCalculator.ts は re-export のみで、係数 1.72 / 式を持たない", () => {
    const src = readFileSync(path.join(APPS, "web/utils/goalSetCalculator.ts"), "utf8");
    expect(src).toMatch(/from\s+["']@apps\/shared\/utils\/goalSetCalculator["']/);
    expect(src).not.toContain("1.72");
    expect(src).not.toMatch(/function\s+calculateGoalSetTargetTime/);
  });

  it("apps/mobile 配下 (テスト除く) に calculateGoalSetTargetTime の自前定義が無い", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (["node_modules", "__tests__", "ios", "android", ".expo"].includes(e)) continue;
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e) && /function\s+calculateGoalSetTargetTime|const\s+calculateGoalSetTargetTime\s*=|\b1\.72\b/.test(readFileSync(full, "utf8"))) offenders.push(full);
      }
    };
    walk(path.join(APPS, "mobile"));
    expect(offenders).toEqual([]);
  });
});
