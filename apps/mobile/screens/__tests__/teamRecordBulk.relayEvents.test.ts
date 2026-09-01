// QA Phase B: mobile 移植版 relayEvents の純粋関数検証。
// Web 正準 (apps/web/__tests__/relayEvents.test.ts) と同一の期待値で、
// モバイル移植が数値・leg境界・累計⇄区間変換・リレー逆引きで Web と一致することを確認する。
// 重点: relayEvents の数値変換 (Contract やること#3)。
import { describe, it, expect } from "vitest";
import {
  RELAY_EVENTS,
  buildRelayEvents,
  isRelayingForLeg,
  calcCumulativeTimes,
  calcLegTimesFromCumulative,
  detectRelayEventId,
  getRelayLegDistance,
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
  toCumulativeSplitTime,
  RelayEventId,
} from "../teamRecordBulk/relayEvents";

const TEST_LABELS = {
  ba: "背泳ぎ",
  br: "平泳ぎ",
  fly: "バタフライ",
  fr: "自由形",
  legLabel: (n: number, style: string) => `第${n}泳者 (${style})`,
  freeRelaySuffix: "フリーリレー",
  medleyRelaySuffix: "メドレーリレー",
};

describe("[mobile] RELAY_EVENTS 定義", () => {
  it("7種目 × 4 leg で legIndex は 0..3 連番", () => {
    expect(RELAY_EVENTS).toHaveLength(7);
    for (const event of RELAY_EVENTS) {
      expect(event.legs).toHaveLength(4);
      expect(event.legs.map((l) => l.legIndex)).toEqual([0, 1, 2, 3]);
    }
  });

  it("メドレーリレーの泳順と styleId が Web と一致 (Ba→Br→Fly→Fr)", () => {
    const m50 = RELAY_EVENTS.find((e) => e.id === "relay_4x50_medley")!;
    expect(m50.legs.map((l) => l.styleKey)).toEqual(["ba", "br", "fly", "fr"]);
    expect(m50.legs.map((l) => l.styleId)).toEqual([13, 9, 17, 2]);
    const m100 = RELAY_EVENTS.find((e) => e.id === "relay_4x100_medley")!;
    expect(m100.legs.map((l) => l.styleId)).toEqual([14, 10, 18, 3]);
    const m25 = RELAY_EVENTS.find((e) => e.id === "relay_4x25_medley")!;
    expect(m25.legs.map((l) => l.styleId)).toEqual([12, 8, 16, 1]);
  });

  it("フリーリレーは全 leg 同一 styleId", () => {
    expect(RELAY_EVENTS.find((e) => e.id === "relay_4x50_free")!.legs.map((l) => l.styleId)).toEqual([2, 2, 2, 2]);
    expect(RELAY_EVENTS.find((e) => e.id === "relay_4x200_free")!.legs.map((l) => l.styleId)).toEqual([4, 4, 4, 4]);
  });
});

describe("[mobile] isRelayingForLeg", () => {
  it("第1泳者のみ false、第2〜4泳者は true", () => {
    expect(isRelayingForLeg(0)).toBe(false);
    expect([isRelayingForLeg(1), isRelayingForLeg(2), isRelayingForLeg(3)]).toEqual([true, true, true]);
  });
});

describe("[mobile] 累計⇄区間タイム変換", () => {
  it("calcCumulativeTimes: [27.5,28.7,28.3,27.6] → [27.5,56.2,84.5,112.1]", () => {
    expect(calcCumulativeTimes([27.5, 28.7, 28.3, 27.6])).toEqual([27.5, 56.2, 84.5, 112.1]);
  });

  it("calcLegTimesFromCumulative: [27.5,56.2,84.5,112.1] → [27.5,28.7,28.3,27.6]", () => {
    expect(calcLegTimesFromCumulative([27.5, 56.2, 84.5, 112.1])).toEqual([27.5, 28.7, 28.3, 27.6]);
  });

  it("浮動小数点丸め: [0.1,0.3] → [0.1,0.2] / [27.1,54.3] → [27.1,27.2]", () => {
    expect(calcLegTimesFromCumulative([0.1, 0.3])).toEqual([0.1, 0.2]);
    expect(calcLegTimesFromCumulative([27.1, 54.3])).toEqual([27.1, 27.2]);
  });

  it("round-trip: cumulative→leg→cumulative が一致", () => {
    const legs = [29.91, 31.22, 30.08, 28.55];
    const cum = calcCumulativeTimes(legs);
    expect(calcCumulativeTimes(calcLegTimesFromCumulative(cum))).toEqual(cum);
  });

  it("空配列はどちらも空配列", () => {
    expect(calcCumulativeTimes([])).toEqual([]);
    expect(calcLegTimesFromCumulative([])).toEqual([]);
  });
});

describe("[mobile] getRelayLegBoundaries / getRelayLegDistance", () => {
  it("各種目の leg 境界配列", () => {
    expect(getRelayLegBoundaries("relay_4x25_free")).toEqual([25, 50, 75, 100]);
    expect(getRelayLegBoundaries("relay_4x50_free")).toEqual([50, 100, 150, 200]);
    expect(getRelayLegBoundaries("relay_4x100_medley")).toEqual([100, 200, 300, 400]);
    expect(getRelayLegBoundaries("relay_4x200_free")).toEqual([200, 400, 600, 800]);
  });

  it("legDist の取得", () => {
    expect(getRelayLegDistance("relay_4x200_free")).toBe(200);
    expect(getRelayLegDistance("relay_4x50_medley")).toBe(50);
  });

  it("不正 ID は例外", () => {
    expect(() => getRelayLegDistance("relay_unknown" as RelayEventId)).toThrow();
  });
});

describe("[mobile] detectRelayEventId 逆引き", () => {
  it("フリー/メドレーの正引き", () => {
    expect(detectRelayEventId([2, 2, 2, 2])).toBe("relay_4x50_free");
    expect(detectRelayEventId([13, 9, 17, 2])).toBe("relay_4x50_medley");
    expect(detectRelayEventId([14, 10, 18, 3])).toBe("relay_4x100_medley");
  });

  it("メドレー順序違反 / 不正 styleId / 長さ != 4 は null", () => {
    expect(detectRelayEventId([2, 17, 9, 13])).toBeNull();
    expect(detectRelayEventId([99, 99, 99, 99])).toBeNull();
    expect(detectRelayEventId([2, 2, 2])).toBeNull();
    expect(detectRelayEventId([])).toBeNull();
  });
});

describe("[mobile] buildRelayEvents ラベル", () => {
  it("メドレーラベルが正しい泳順で生成される", () => {
    const m50 = buildRelayEvents(TEST_LABELS).find((e) => e.id === "relay_4x50_medley")!;
    expect(m50.label).toBe("50m×4 メドレーリレー");
    expect(m50.legs[0]!.legLabel).toContain("第1泳者"); // リレーは常に4legなので必ず存在
    expect(m50.legs[0]!.legLabel).toContain("背泳ぎ");
    expect(m50.legs[3]!.legLabel).toContain("第4泳者");
    expect(m50.legs[3]!.legLabel).toContain("自由形");
  });
});

// =============================================================================
// D1: リレー split の通算値 ⇔ leg 相対値の変換 (Sprint Contract — split_times 混入バグ修正)
// Web 正準 (apps/web/__tests__/relayEvents.test.ts) と同一の期待値で mobile 移植を検証する。
// =============================================================================
describe("[mobile] getLegStartCumulative", () => {
  it("legIdx=0 は常に 0 を返す (先頭泳者はオフセット無し)", () => {
    expect(getLegStartCumulative([57.0, 115.5, 173.3, 230.0], 0)).toBe(0);
  });

  it("legIdx=1..3 は cumulativeTimes[legIdx-1] を返す", () => {
    const cumulatives = [57.0, 115.5, 173.3, 230.0];
    expect(getLegStartCumulative(cumulatives, 1)).toBe(57.0);
    expect(getLegStartCumulative(cumulatives, 2)).toBe(115.5);
    expect(getLegStartCumulative(cumulatives, 3)).toBe(173.3);
  });
});

describe("[mobile] toLegRelativeSplitTime / toCumulativeSplitTime (互いの逆変換)", () => {
  it("legStart=0 のとき、通算値と leg相対値は等しい (第1泳者は無変換)", () => {
    expect(toLegRelativeSplitTime(57.0, 0)).toBe(57.0);
    expect(toCumulativeSplitTime(57.0, 0)).toBe(57.0);
  });

  it("通算値からleg開始タイムを引いた値がleg相対値になる (Sprint Contract 真因の修正対象)", () => {
    // 4x200mフリーリレー第4泳者の実データ相当 (Success Criteria S1)
    expect(toLegRelativeSplitTime(459.86, 399.86)).toBe(60.0);
    expect(toLegRelativeSplitTime(493.98, 399.86)).toBe(94.12);
    expect(toLegRelativeSplitTime(530.28, 399.86)).toBe(130.42);
  });

  it("toCumulativeSplitTime は toLegRelativeSplitTime の厳密な逆変換である", () => {
    const legStart = 399.86;
    for (const cumulative of [459.86, 493.98, 530.28, 536.4]) {
      const legRelative = toLegRelativeSplitTime(cumulative, legStart);
      expect(toCumulativeSplitTime(legRelative, legStart)).toBe(cumulative);
    }
  });

  it("小数第2位で丸める (浮動小数点誤差を吸収する既存規約に揃える)", () => {
    expect(toLegRelativeSplitTime(30.31, 10.11)).toBe(20.2);
    expect(toCumulativeSplitTime(20.2, 10.11)).toBe(30.31);
  });
});
