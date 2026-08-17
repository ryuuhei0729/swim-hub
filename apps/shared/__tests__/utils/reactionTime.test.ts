// =============================================================================
// reactionTime.test.ts - リアクションタイム検証ユーティリティのテスト
// =============================================================================
// normalizeReactionTime は web RecordLogEntry の step=0.01 min=-1 max=2 と
// 同一の範囲を JS 側で再現する。mobile TeamRecordBulkFormScreen の blur /
// 保存前ガードが依存している。
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  REACTION_TIME_MAX,
  REACTION_TIME_MIN,
  isReactionTimeInRange,
  normalizeReactionTime,
  toReactionTimeValue,
} from "../../utils/reactionTime";

describe("normalizeReactionTime", () => {
  it("有効な RT はそのまま通す", () => {
    expect(normalizeReactionTime("0.35")).toBe("0.35");
    expect(normalizeReactionTime("0.65")).toBe("0.65");
    expect(normalizeReactionTime("0")).toBe("0");
  });

  it("リレー引き継ぎのマイナス反応を許容する", () => {
    expect(normalizeReactionTime("-0.2")).toBe("-0.2");
  });

  it("上限・下限を超えた値をクランプする", () => {
    expect(normalizeReactionTime("999")).toBe(String(REACTION_TIME_MAX));
    expect(normalizeReactionTime("-999")).toBe(String(REACTION_TIME_MIN));
    expect(normalizeReactionTime("2.5")).toBe("2");
    expect(normalizeReactionTime("-1.5")).toBe("-1");
  });

  it("境界値はクランプせず保持する", () => {
    expect(normalizeReactionTime("2")).toBe("2");
    expect(normalizeReactionTime("-1")).toBe("-1");
  });

  it("numeric(10,2) に合わせて小数第2位へ丸める", () => {
    expect(normalizeReactionTime("0.353")).toBe("0.35");
    expect(normalizeReactionTime("0.358")).toBe("0.36");
  });

  it("未入力・入力途中の文字列は空欄に戻す", () => {
    expect(normalizeReactionTime("")).toBe("");
    expect(normalizeReactionTime("   ")).toBe("");
    expect(normalizeReactionTime("-")).toBe("");
    expect(normalizeReactionTime(".")).toBe("");
    expect(normalizeReactionTime("0.")).toBe("");
    expect(normalizeReactionTime("-0.")).toBe("");
    expect(normalizeReactionTime(null)).toBe("");
    expect(normalizeReactionTime(undefined)).toBe("");
  });

  it("数値にならない入力は空欄に戻す", () => {
    expect(normalizeReactionTime("abc")).toBe("");
    expect(normalizeReactionTime("NaN")).toBe("");
    expect(normalizeReactionTime("Infinity")).toBe("");
  });

  it("前後の空白を無視する", () => {
    expect(normalizeReactionTime("  0.35  ")).toBe("0.35");
  });
});

describe("isReactionTimeInRange", () => {
  it("範囲内の値を通す", () => {
    expect(isReactionTimeInRange(0.35)).toBe(true);
    expect(isReactionTimeInRange(0)).toBe(true);
    expect(isReactionTimeInRange(-0.2)).toBe(true);
  });

  it("境界値を含む", () => {
    expect(isReactionTimeInRange(REACTION_TIME_MIN)).toBe(true);
    expect(isReactionTimeInRange(REACTION_TIME_MAX)).toBe(true);
  });

  it("範囲外の値を弾く", () => {
    expect(isReactionTimeInRange(2.01)).toBe(false);
    expect(isReactionTimeInRange(-1.01)).toBe(false);
    expect(isReactionTimeInRange(999)).toBe(false);
  });

  it("normalizeReactionTime のクランプ結果は必ず範囲内になる", () => {
    for (const input of ["999", "-999", "0.35", "2.5", "-1.5"]) {
      const normalized = normalizeReactionTime(input);
      expect(isReactionTimeInRange(Number.parseFloat(normalized))).toBe(true);
    }
  });
});

describe("toReactionTimeValue", () => {
  it("有効な RT を数値へ変換する", () => {
    expect(toReactionTimeValue("0.35")).toBe(0.35);
  });

  it("blur を経ずに保存された範囲外の値もクランプする", () => {
    expect(toReactionTimeValue("999")).toBe(REACTION_TIME_MAX);
    expect(toReactionTimeValue("-999")).toBe(REACTION_TIME_MIN);
  });

  it("空欄・入力途中・無効値は null にする", () => {
    expect(toReactionTimeValue("")).toBeNull();
    expect(toReactionTimeValue("0.")).toBeNull();
    expect(toReactionTimeValue("abc")).toBeNull();
    expect(toReactionTimeValue(null)).toBeNull();
  });
});
