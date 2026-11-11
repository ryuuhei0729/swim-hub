import { describe, expect, it } from "vitest";
import {
  buildCurrentBestMap,
  computeMatrixRecords,
  findInputGridStyle,
  getCellKey,
  isEnterableCell,
  isEnteredButInvalid,
} from "../../utils/bestTimeInputGrid";

describe("isEnterableCell", () => {
  it("種目マスターに無い組み合わせ (50m個人メドレー) は入力できない", () => {
    expect(isEnterableCell(findInputGridStyle("IM", 50), 0, false)).toBe(false);
  });

  it("長水路では 25m と 100m個人メドレーを入力できない", () => {
    expect(isEnterableCell(findInputGridStyle("Fr", 25), 1, false)).toBe(false);
    expect(isEnterableCell(findInputGridStyle("IM", 100), 1, false)).toBe(false);
    expect(isEnterableCell(findInputGridStyle("Fr", 1500), 1, false)).toBe(true);
  });

  it("引き継ぎは背泳ぎ・個人メドレー・400m 以上の自由形・200m の自由形以外では入力できない", () => {
    expect(isEnterableCell(findInputGridStyle("Ba", 50), 0, true)).toBe(false);
    expect(isEnterableCell(findInputGridStyle("IM", 200), 0, true)).toBe(false);
    expect(isEnterableCell(findInputGridStyle("Fr", 400), 0, true)).toBe(false);
    expect(isEnterableCell(findInputGridStyle("Br", 200), 0, true)).toBe(false);
    expect(isEnterableCell(findInputGridStyle("Fr", 200), 0, true)).toBe(true);
    expect(isEnterableCell(findInputGridStyle("Fly", 100), 0, true)).toBe(true);
  });
});

describe("computeMatrixRecords", () => {
  it("形式が正しいタイムだけを登録用にし、キーから種目・水路・引き継ぎを戻す", () => {
    const records = computeMatrixRecords({
      [getCellKey(3, 0, false)]: { time: "53.80", note: " 市民大会 " },
      [getCellKey(2, 1, true)]: { time: "24.1", note: "" },
      [getCellKey(4, 0, false)]: { time: "abc", note: "" },
      [getCellKey(5, 0, false)]: { time: "", note: "備考だけ" },
    });
    expect(records).toEqual([
      { styleId: 3, poolType: 0, isRelaying: false, time: 53.8, note: "市民大会" },
      { styleId: 2, poolType: 1, isRelaying: true, time: 24.1, note: null },
    ]);
  });
});

describe("isEnteredButInvalid", () => {
  it("空は不正扱いしない", () => {
    expect(isEnteredButInvalid("")).toBe(false);
    expect(isEnteredButInvalid("abc")).toBe(true);
  });
});

describe("buildCurrentBestMap", () => {
  it("通常と引き継ぎを別のマスにし、同じマスは速い方を残す", () => {
    const map = buildCurrentBestMap([
      { time: 55.1, pool_type: 0, is_relaying: false, style_id: 3, style: { name_jp: "100m自由形", distance: 100 } },
      {
        time: 54.97,
        pool_type: 0,
        is_relaying: false,
        style_id: 3,
        style: { name_jp: "100m自由形", distance: 100 },
        relayingTime: { time: 53.24 },
      },
    ]);
    expect(map.get(getCellKey(3, 0, false))).toBe(54.97);
    expect(map.get(getCellKey(3, 0, true))).toBe(53.24);
  });

  it("style_id の無いデータは種目名 (name_jp) から引く", () => {
    const map = buildCurrentBestMap([
      { time: 31.79, pool_type: 1, is_relaying: false, style: { name_jp: "50m背泳ぎ", distance: 50 } },
    ]);
    expect(map.get(getCellKey(13, 1, false))).toBe(31.79);
  });
});
