import { describe, expect, it } from "vitest";

import {
  formatQuickBuffer,
  quickBufferToSeconds,
  quickTimeContextFromSeconds,
  quickTypedCapacity,
  seedFromSeconds,
  splitQuickSeed,
} from "../../utils/quickTimeMask";

describe("quickTimeMask (練習タイムの2本目以降のマスク入力)", () => {
  describe("seedFromSeconds", () => {
    it("60秒未満は十の位だけをシードにする", () => {
      expect(seedFromSeconds(33.2)).toBe("3");
      expect(seedFromSeconds(8.5)).toBe("0");
    });

    it("60秒以上は「分.十の位」をシードにする", () => {
      expect(seedFromSeconds(65.3)).toBe("1.0");
      expect(seedFromSeconds(132.4)).toBe("2.1");
    });
  });

  describe("splitQuickSeed", () => {
    it("分と十の位に分ける", () => {
      expect(splitQuickSeed("1.2")).toEqual({ minutePart: "1", tensDigitPart: "2" });
      expect(splitQuickSeed("3")).toEqual({ minutePart: "", tensDigitPart: "3" });
      expect(splitQuickSeed("")).toEqual({ minutePart: "", tensDigitPart: "" });
    });
  });

  describe("formatQuickBuffer", () => {
    it("十の位+一の位の2桁が揃った直後に「.」を自動で入れる", () => {
      expect(formatQuickBuffer("3", "")).toBe("3");
      expect(formatQuickBuffer("3", "2")).toBe("32.");
      expect(formatQuickBuffer("3", "25")).toBe("32.5");
    });

    it("分つきのシードでも同じ位置に「.」が入る", () => {
      expect(formatQuickBuffer("1.0", "8")).toBe("1.08.");
      expect(formatQuickBuffer("1.0", "83")).toBe("1.08.3");
    });

    it("シードが空なら打った2桁目の後に「.」が入る", () => {
      expect(formatQuickBuffer("", "3")).toBe("3");
      expect(formatQuickBuffer("", "33")).toBe("33.");
      expect(formatQuickBuffer("", "332")).toBe("33.2");
    });
  });

  describe("quickBufferToSeconds", () => {
    it("一の位まで揃っていなければ0 (未確定)", () => {
      expect(quickBufferToSeconds("3", "")).toBe(0);
      expect(quickBufferToSeconds("1.2", "")).toBe(0);
      expect(quickBufferToSeconds("", "3")).toBe(0);
    });

    it("シードと打った数字から秒数を組み立てる", () => {
      expect(quickBufferToSeconds("3", "2")).toBe(32);
      expect(quickBufferToSeconds("3", "25")).toBeCloseTo(32.5);
      expect(quickBufferToSeconds("1.0", "83")).toBeCloseTo(68.3);
      expect(quickBufferToSeconds("", "332")).toBeCloseTo(33.2);
    });
  });

  describe("quickTypedCapacity", () => {
    it("十の位がシードに入っていれば残り2桁、空なら3桁まで打てる", () => {
      expect(quickTypedCapacity("3")).toBe(2);
      expect(quickTypedCapacity("1.2")).toBe(2);
      expect(quickTypedCapacity("")).toBe(3);
    });
  });

  describe("quickTimeContextFromSeconds", () => {
    it("「2-3」形式の引き継ぎに使う分と十の位を取り出す", () => {
      expect(quickTimeContextFromSeconds(33.2)).toEqual({ minutes: 0, tensDigit: 3 });
      expect(quickTimeContextFromSeconds(72.2)).toEqual({ minutes: 1, tensDigit: 1 });
    });
  });
});
