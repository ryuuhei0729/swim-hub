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
  parseReactionTimeInput,
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

  // Number.parseFloat は先頭だけ解釈して "0.65abc" → 0.65 を通してしまう。
  // 数値の前置きを含むゴミ入力が DB へ書かれないことを固定する。
  it("数値の前置きを含む混在入力を数値として受け付けない", () => {
    expect(normalizeReactionTime("0.65abc")).toBe("");
    expect(normalizeReactionTime("2e")).toBe("");
    expect(normalizeReactionTime("1.2.3")).toBe("");
    expect(normalizeReactionTime("0.5 0.6")).toBe("");
    expect(normalizeReactionTime("--1")).toBe("");
    expect(normalizeReactionTime("1,5")).toBe("");
  });

  it("末尾ドットの入力途中は 0 扱いにせず空欄へ戻す", () => {
    expect(normalizeReactionTime("1.")).toBe("");
    expect(normalizeReactionTime("-1.")).toBe("");
  });

  it("前後の空白を無視する", () => {
    expect(normalizeReactionTime("  0.35  ")).toBe("0.35");
  });
});

describe("parseReactionTimeInput", () => {
  it("完全な数値表記を変換する", () => {
    expect(parseReactionTimeInput("0.65")).toBe(0.65);
    expect(parseReactionTimeInput("-0.2")).toBe(-0.2);
    expect(parseReactionTimeInput(".5")).toBe(0.5);
    expect(parseReactionTimeInput("  0.35  ")).toBe(0.35);
  });

  it("混在入力・入力途中・空値は null", () => {
    expect(parseReactionTimeInput("0.65abc")).toBeNull();
    expect(parseReactionTimeInput("2e")).toBeNull();
    expect(parseReactionTimeInput("1.2.3")).toBeNull();
    expect(parseReactionTimeInput("abc")).toBeNull();
    expect(parseReactionTimeInput("0.")).toBeNull();
    expect(parseReactionTimeInput("-")).toBeNull();
    expect(parseReactionTimeInput("")).toBeNull();
    expect(parseReactionTimeInput(null)).toBeNull();
    expect(parseReactionTimeInput(undefined)).toBeNull();
  });

  // RecordFormScreen は範囲エラーを表示する必要があるため、
  // normalizeReactionTime と違いクランプしてはいけない
  it("範囲外の値をクランプせずそのまま返す", () => {
    expect(parseReactionTimeInput("999")).toBe(999);
    expect(parseReactionTimeInput("-999")).toBe(-999);
    expect(isReactionTimeInRange(parseReactionTimeInput("2.01") as number)).toBe(false);
  });

  it("Infinity になる桁数の入力は null", () => {
    expect(parseReactionTimeInput("9".repeat(400))).toBeNull();
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
