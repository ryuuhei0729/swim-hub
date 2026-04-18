import { describe, it, expect } from "vitest";
import {
  RELAY_EVENTS,
  isRelayingForLeg,
  calcCumulativeTimes,
  calcLegTimesFromCumulative,
  detectRelayEventId,
  RelayEventId,
} from "../app/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/relayEvents";

// Sprint Contract Issue #19 検証テスト
// V-01: RELAY_EVENTS が 7 種目 × 4 leg 構成か
// V-02: isRelayingForLeg の純粋関数ロジック
// V-03: メドレーリレーの泳順と styleId マッピング (Ba→Br→Fly→Fr)

describe("RELAY_EVENTS", () => {
  it("[V-01] 7種目定義されている", () => {
    expect(RELAY_EVENTS).toHaveLength(7);
  });

  it("[V-01] 各種目が4 legを持つ", () => {
    for (const event of RELAY_EVENTS) {
      expect(event.legs).toHaveLength(4);
    }
  });

  it("[V-01] フリーリレー種目が4種類存在する", () => {
    const freeRelays = RELAY_EVENTS.filter((e) => e.id.includes("free"));
    expect(freeRelays).toHaveLength(4);
    const ids: RelayEventId[] = [
      "relay_4x25_free",
      "relay_4x50_free",
      "relay_4x100_free",
      "relay_4x200_free",
    ];
    for (const id of ids) {
      expect(RELAY_EVENTS.find((e) => e.id === id)).toBeDefined();
    }
  });

  it("[V-01] メドレーリレー種目が3種類存在する", () => {
    const medleyRelays = RELAY_EVENTS.filter((e) => e.id.includes("medley"));
    expect(medleyRelays).toHaveLength(3);
  });

  it("[V-01] legIndex が 0..3 の連番になっている", () => {
    for (const event of RELAY_EVENTS) {
      const indices = event.legs.map((l) => l.legIndex);
      expect(indices).toEqual([0, 1, 2, 3]);
    }
  });
});

describe("フリーリレーの styleId マッピング", () => {
  it("25m×4フリーリレー: 全 leg が styleId=1 (fr 25m)", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x25_free")!;
    for (const leg of event.legs) {
      expect(leg.styleId).toBe(1);
      expect(leg.styleKey).toBe("fr");
    }
  });

  it("50m×4フリーリレー: 全 leg が styleId=2 (fr 50m)", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x50_free")!;
    for (const leg of event.legs) {
      expect(leg.styleId).toBe(2);
      expect(leg.styleKey).toBe("fr");
    }
  });

  it("100m×4フリーリレー: 全 leg が styleId=3 (fr 100m)", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x100_free")!;
    for (const leg of event.legs) {
      expect(leg.styleId).toBe(3);
      expect(leg.styleKey).toBe("fr");
    }
  });

  it("200m×4フリーリレー: 全 leg が styleId=4 (fr 200m)", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x200_free")!;
    for (const leg of event.legs) {
      expect(leg.styleId).toBe(4);
      expect(leg.styleKey).toBe("fr");
    }
  });
});

describe("[V-03] メドレーリレーの泳順と styleId マッピング (Ba→Br→Fly→Fr)", () => {
  it("25m×4メドレーリレー: ba=12, br=8, fly=16, fr=1", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x25_medley")!;
    expect(event.legs[0].styleKey).toBe("ba");
    expect(event.legs[0].styleId).toBe(12);
    expect(event.legs[1].styleKey).toBe("br");
    expect(event.legs[1].styleId).toBe(8);
    expect(event.legs[2].styleKey).toBe("fly");
    expect(event.legs[2].styleId).toBe(16);
    expect(event.legs[3].styleKey).toBe("fr");
    expect(event.legs[3].styleId).toBe(1);
  });

  it("50m×4メドレーリレー: ba=13, br=9, fly=17, fr=2", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x50_medley")!;
    expect(event.legs[0].styleKey).toBe("ba");
    expect(event.legs[0].styleId).toBe(13);
    expect(event.legs[1].styleKey).toBe("br");
    expect(event.legs[1].styleId).toBe(9);
    expect(event.legs[2].styleKey).toBe("fly");
    expect(event.legs[2].styleId).toBe(17);
    expect(event.legs[3].styleKey).toBe("fr");
    expect(event.legs[3].styleId).toBe(2);
  });

  it("100m×4メドレーリレー: ba=14, br=10, fly=18, fr=3", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x100_medley")!;
    expect(event.legs[0].styleKey).toBe("ba");
    expect(event.legs[0].styleId).toBe(14);
    expect(event.legs[1].styleKey).toBe("br");
    expect(event.legs[1].styleId).toBe(10);
    expect(event.legs[2].styleKey).toBe("fly");
    expect(event.legs[2].styleId).toBe(18);
    expect(event.legs[3].styleKey).toBe("fr");
    expect(event.legs[3].styleId).toBe(3);
  });

  it("メドレーリレーの泳者ラベルが正しい順序で表示される", () => {
    const event = RELAY_EVENTS.find((e) => e.id === "relay_4x50_medley")!;
    expect(event.legs[0].legLabel).toContain("第1泳者");
    expect(event.legs[0].legLabel).toContain("背泳ぎ");
    expect(event.legs[1].legLabel).toContain("第2泳者");
    expect(event.legs[1].legLabel).toContain("平泳ぎ");
    expect(event.legs[2].legLabel).toContain("第3泳者");
    expect(event.legs[2].legLabel).toContain("バタフライ");
    expect(event.legs[3].legLabel).toContain("第4泳者");
    expect(event.legs[3].legLabel).toContain("自由形");
  });
});

describe("[V-02] isRelayingForLeg 純粋関数", () => {
  it("legIndex=0 (第1泳者) は false を返す", () => {
    expect(isRelayingForLeg(0)).toBe(false);
  });

  it("legIndex=1 (第2泳者) は true を返す", () => {
    expect(isRelayingForLeg(1)).toBe(true);
  });

  it("legIndex=2 (第3泳者) は true を返す", () => {
    expect(isRelayingForLeg(2)).toBe(true);
  });

  it("legIndex=3 (第4泳者) は true を返す", () => {
    expect(isRelayingForLeg(3)).toBe(true);
  });
});

describe("calcCumulativeTimes 純粋関数", () => {
  it("空配列は空配列を返す", () => {
    expect(calcCumulativeTimes([])).toEqual([]);
  });

  it("1要素: [27.50] → [27.50]", () => {
    expect(calcCumulativeTimes([27.5])).toEqual([27.5]);
  });

  it("4要素: [27.50, 28.70, 28.30, 27.60] → [27.50, 56.20, 84.50, 112.10]", () => {
    expect(calcCumulativeTimes([27.5, 28.7, 28.3, 27.6])).toEqual([27.5, 56.2, 84.5, 112.1]);
  });

  it("同一値: [30, 30, 30, 30] → [30, 60, 90, 120]", () => {
    expect(calcCumulativeTimes([30, 30, 30, 30])).toEqual([30, 60, 90, 120]);
  });
});

describe("calcLegTimesFromCumulative 純粋関数", () => {
  it("空配列は空配列を返す", () => {
    expect(calcLegTimesFromCumulative([])).toEqual([]);
  });

  it("1要素: [27.50] → [27.50]", () => {
    expect(calcLegTimesFromCumulative([27.5])).toEqual([27.5]);
  });

  it("4要素: [27.50, 56.20, 84.50, 112.10] → [27.50, 28.70, 28.30, 27.60]", () => {
    expect(calcLegTimesFromCumulative([27.5, 56.2, 84.5, 112.1])).toEqual([27.5, 28.7, 28.3, 27.6]);
  });

  it("往復: [30, 60, 90, 120] → [30, 30, 30, 30]", () => {
    expect(calcLegTimesFromCumulative([30, 60, 90, 120])).toEqual([30, 30, 30, 30]);
  });

  it("浮動小数点丸め: [27.1, 54.3] → [27.1, 27.2]", () => {
    expect(calcLegTimesFromCumulative([27.1, 54.3])).toEqual([27.1, 27.2]);
  });

  it("浮動小数点丸め: [0.1, 0.3] → [0.1, 0.2]", () => {
    expect(calcLegTimesFromCumulative([0.1, 0.3])).toEqual([0.1, 0.2]);
  });
});

describe("detectRelayEventId 純粋関数", () => {
  it("フリーリレー: 50m×4 (styleId=2×4) → relay_4x50_free", () => {
    expect(detectRelayEventId([2, 2, 2, 2])).toBe("relay_4x50_free");
  });

  it("フリーリレー: 25m×4 (styleId=1×4) → relay_4x25_free", () => {
    expect(detectRelayEventId([1, 1, 1, 1])).toBe("relay_4x25_free");
  });

  it("フリーリレー: 100m×4 (styleId=3×4) → relay_4x100_free", () => {
    expect(detectRelayEventId([3, 3, 3, 3])).toBe("relay_4x100_free");
  });

  it("フリーリレー: 200m×4 (styleId=4×4) → relay_4x200_free", () => {
    expect(detectRelayEventId([4, 4, 4, 4])).toBe("relay_4x200_free");
  });

  it("メドレーリレー: 50m×4 (ba=13, br=9, fly=17, fr=2) → relay_4x50_medley", () => {
    expect(detectRelayEventId([13, 9, 17, 2])).toBe("relay_4x50_medley");
  });

  it("メドレーリレー: 25m×4 (ba=12, br=8, fly=16, fr=1) → relay_4x25_medley", () => {
    expect(detectRelayEventId([12, 8, 16, 1])).toBe("relay_4x25_medley");
  });

  it("メドレーリレー: 100m×4 (ba=14, br=10, fly=18, fr=3) → relay_4x100_medley", () => {
    expect(detectRelayEventId([14, 10, 18, 3])).toBe("relay_4x100_medley");
  });

  it("順番違い (fr先頭) → null", () => {
    // フリーリレーと見なされないようにメドレーの順番違い
    expect(detectRelayEventId([2, 13, 9, 17])).toBeNull();
  });

  it("メドレー順序違反: [fr, fly, br, ba] の逆順 → null", () => {
    // 50m×4メドレーの正しい順序 [ba=13, br=9, fly=17, fr=2] を逆順にした場合
    expect(detectRelayEventId([2, 17, 9, 13])).toBeNull();
  });

  it("不正 styleId 配列 → null", () => {
    expect(detectRelayEventId([99, 99, 99, 99])).toBeNull();
  });

  it("長さ != 4 (3要素) → null", () => {
    expect(detectRelayEventId([2, 2, 2])).toBeNull();
  });

  it("長さ != 4 (5要素) → null", () => {
    expect(detectRelayEventId([2, 2, 2, 2, 2])).toBeNull();
  });

  it("空配列 → null", () => {
    expect(detectRelayEventId([])).toBeNull();
  });
});
