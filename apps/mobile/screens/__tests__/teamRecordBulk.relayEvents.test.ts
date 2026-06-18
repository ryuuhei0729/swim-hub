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
    expect(m50.legs[0].legLabel).toContain("第1泳者");
    expect(m50.legs[0].legLabel).toContain("背泳ぎ");
    expect(m50.legs[3].legLabel).toContain("第4泳者");
    expect(m50.legs[3].legLabel).toContain("自由形");
  });
});
