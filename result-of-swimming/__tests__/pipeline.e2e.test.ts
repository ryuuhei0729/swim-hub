// =============================================================================
// pipeline.e2e.test.ts - PoC 通し: 取得済みレスポンス -> 理想LAP
// =============================================================================
// 取得 (fixture) -> パース -> validation -> LAP計算 -> 集計 -> generateTargetLaps
// までが1本で通ることを確認する。ネットワークには触らない。
// =============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";
import { describe, expect, it } from "vitest";
import { formatMsToTime, generateTargetLaps } from "@shared/racePace";
import { aggregate } from "../src/aggregation/aggregate";
import { parseResults, type ResultsContext } from "../src/parser/parseResults";
import type { RawRace } from "../src/types";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures/api", name), "utf8"));

const base: ResultsContext = {
  gameCode: "4826412",
  genderCode: 1,
  swimmingStyleCode: 1,
  distanceCode: 3,
  classCode: 1,
  raceDivisionCode: 4,
  heat: 1,
  distance: 100,
  poolLength: 50,
  competitionName: "第99回 関東学生選手権水泳競技大会",
};

/** 取得済みレスポンス全件を RawRace へ */
function collectAll(): RawRace[] {
  const sources: Array<[string, Partial<ResultsContext>]> = [
    ["result.lc.100fr.final.json", {}],
    ["result.aggregate-heat100.100fr.json", { raceDivisionCode: 1, heat: 100, roundName: "予選" }],
    ["result.lc.400fr.final.json", { distance: 400, distanceCode: 5 }],
    ["result.lc.1500fr.timed.json", { distance: 1500, distanceCode: 7, raceDivisionCode: 2, heat: 4 }],
    ["result.lc.200im.final.json", { distance: 200, distanceCode: 4, swimmingStyleCode: 5 }],
    ["result.sc.100fr.timed.json", { poolLength: 25, gameCode: "2826304", classCode: 6, raceDivisionCode: 2, heat: 4 }],
    ["result.dsq.200br.json", { distance: 200, distanceCode: 4, swimmingStyleCode: 3, raceDivisionCode: 1 }],
    ["result.dns.100fr.json", { raceDivisionCode: 1, heat: 100 }],
  ];
  return sources.flatMap(([file, over]) =>
    parseResults(fixture(file), { ...base, ...over } as ResultsContext),
  );
}

describe("PoC 通し", () => {
  const races = collectAll();

  it("取得済みレスポンスから RawRace が組める", () => {
    expect(races.length).toBeGreaterThan(30);
  });

  it("個人情報がパイプライン全体に一切乗らない", () => {
    const json = JSON.stringify(races);
    for (const banned of ["swimmer_name", "swimmer_code", "entry_group", "graphs", "スコット"]) {
      expect(json.includes(banned), banned).toBe(false);
    }
  });

  it("クレンジングが除外理由つきで効く", () => {
    const byStatus = new Map<string, number>();
    for (const r of races) byStatus.set(r.validationStatus, (byStatus.get(r.validationStatus) ?? 0) + 1);
    expect(byStatus.get("valid")).toBeGreaterThan(0);
    expect(byStatus.get("disqualified")).toBeGreaterThan(0);
    // 除外されたものは必ず理由を持つ
    for (const r of races) {
      if (r.validationStatus !== "valid") expect(r.validationReason, r.sourceRaceId).toBeTruthy();
    }
  });

  it("集計してモデルが出る (fixture 規模なので閾値を下げる)", () => {
    const models = aggregate(races, { minSampleCount: 1 });
    expect(models.length).toBeGreaterThan(0);
    // 長水路100m自由形のモデルが存在する
    const m = models.find(
      (x) => x.stroke === "fr" && x.distance === 100 && x.poolType === 1,
    );
    expect(m).toBeDefined();
    expect(m!.laps.map((l) => l.distance)).toEqual([50, 100]);
    expect(m!.sampleCount).toBeGreaterThan(1);
  });

  it("短水路と長水路が別モデルになる", () => {
    const models = aggregate(races, { minSampleCount: 1 });
    const fr100 = models.filter((x) => x.stroke === "fr" && x.distance === 100);
    expect(new Set(fr100.map((x) => x.poolType)).size).toBe(2);
  });

  it("1500m は 30 LAP のモデルになる", () => {
    const models = aggregate(races, { minSampleCount: 1 });
    const m = models.find((x) => x.distance === 1500);
    expect(m).toBeDefined();
    expect(m!.laps).toHaveLength(30);
  });

  it("★ 目標タイムから理想LAPが出て、合計が厳密に一致する", () => {
    const models = aggregate(races, { minSampleCount: 1 });
    const model = models.find(
      (x) => x.stroke === "fr" && x.distance === 100 && x.poolType === 1 && x.minTimeMs <= 49520 && 49520 <= x.maxTimeMs,
    );
    expect(model, "49.52 を含む bucket のモデル").toBeDefined();

    const out = generateTargetLaps({ targetTimeMs: 50000, model: model! });

    expect(out.laps.map((l) => l.distance)).toEqual([50, 100]);
    expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0)).toBe(50000);
    expect(out.laps.at(-1)!.cumulativeTimeMs).toBe(50000);
    expect(out.sampleCount).toBe(model!.sampleCount);

    // 直前の toEqual([50, 100]) で out.laps が2要素であることを検証済み
    const [lap0, lap1] = [out.laps[0]!, out.laps[1]!];

    // 実データ由来なので前半が後半より速い (自由形の一般的なペース配分)
    expect(lap0.lapTimeMs).toBeLessThan(lap1.lapTimeMs);

    // 表示可能な形になっている
    expect(formatMsToTime(lap0.cumulativeTimeMs)).toMatch(/^\d+\.\d{2}$/);
    expect(formatMsToTime(lap1.cumulativeTimeMs)).toBe("50.00");
  });

  it("★ 400m / 1500m でも合計保証が成立する", () => {
    const models = aggregate(races, { minSampleCount: 1 });
    for (const distance of [400, 1500]) {
      const model = models.find((x) => x.distance === distance);
      expect(model, `${distance}m のモデル`).toBeDefined();
      const target = distance === 400 ? 230000 : 930000;
      const out = generateTargetLaps({ targetTimeMs: target, model: model! });
      expect(out.laps).toHaveLength(distance / 50);
      expect(out.laps.reduce((a, l) => a + l.lapTimeMs, 0), `${distance}m`).toBe(target);
      const cums = out.laps.map((l) => l.cumulativeTimeMs);
      for (let i = 1; i < cums.length; i++) {
        const prev = cums[i - 1];
        const curr = cums[i];
        // i>=1 かつ i<cums.length なので理論上 undefined にならないが、防御的に扱う
        if (prev === undefined || curr === undefined) continue;
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });

  it("生成結果を人が読める形で確認できる (回帰時の目視用)", () => {
    const models = aggregate(races, { minSampleCount: 1 });
    const model = models.find((x) => x.stroke === "fr" && x.distance === 100 && x.poolType === 1)!;
    const out = generateTargetLaps({ targetTimeMs: 50000, model });
    const rendered = out.laps.map((l) => `${l.distance}m ${formatMsToTime(l.cumulativeTimeMs)}`);
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toBe("100m 50.00");
  });
});
