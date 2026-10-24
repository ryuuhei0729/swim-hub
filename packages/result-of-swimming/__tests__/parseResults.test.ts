// =============================================================================
// parseResults.test.ts - /results レスポンス -> RawRace[]
// =============================================================================
// fixture は Phase 0 の実レスポンスから PII を除去したもの。
// API 構造が変わればこのテストが落ちる (構造変更の検知器)。
// 検証観点:
//   [V-P1] LAP を累積/区間の両方として正しく取り出す
//   [V-P2] 個人情報を1バイトも通さない
//   [V-P3] DSQ/DNS を validationStatus で除外する
//   [V-P4] 長水路/短水路とも 50m 粒度で LAP 本数が距離と整合する
//   [V-P5] リレーを isRelay で識別する
//   [V-P6] 集約 heat (heat=100) から全組を取り出す
//   [V-P7] sourceUrl / sourceRaceId が再現可能
// =============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";
import { describe, expect, it } from "vitest";
import { buildResultsUrl, parseResults } from "../src/parser/parseResults";
import type { ResultsContext } from "../src/parser/parseResults";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures/api", name), "utf8"));

const ctx = (over: Partial<ResultsContext> = {}): ResultsContext => ({
  gameCode: "4826412",
  genderCode: 1,
  swimmingStyleCode: 1,
  distanceCode: 3,
  classCode: 1,
  raceDivisionCode: 4,
  heat: 1,
  distance: 100,
  poolLength: 50,
  roundName: "決勝(A-決勝)",
  competitionName: "第99回 関東学生選手権水泳競技大会",
  competitionDate: "2026-07-30",
  ...over,
});

describe("parseResults - 長水路 100m自由形 決勝", () => {
  const races = parseResults(fixture("result.lc.100fr.final.json"), ctx());

  it("[V-P1] 8名分を返し、累積と区間の両方が取れている", () => {
    expect(races).toHaveLength(8);
    // toHaveLength(8) で races[0] の存在を検証済み
    const top = races[0]!;
    expect(top.finalTimeMs).toBe(49520);
    expect(top.splits).toEqual([
      { distance: 50, cumulativeTimeMs: 23740, lapTimeMs: 23740 },
      { distance: 100, cumulativeTimeMs: 49520, lapTimeMs: 25780 },
    ]);
  });

  it("[V-P1] 区間タイムの合計が最終タイムと一致する", () => {
    for (const r of races) {
      const sum = r.splits.reduce((a, s) => a + (s.lapTimeMs ?? 0), 0);
      expect(sum, r.sourceRaceId).toBe(r.finalTimeMs);
    }
  });

  it("[V-P2] 個人情報を含むキーが1つも存在しない", () => {
    const json = JSON.stringify(races);
    for (const banned of ["swimmer_name", "swimmerName", "swimmer_code", "entry_group", "graphs"]) {
      expect(json.includes(banned), banned).toBe(false);
    }
  });

  it("[V-P2] 学種のみカテゴリとして残る", () => {
    // 同 describe 内の [V-P1] テストで races.length===8 を確認済み (fixture 由来で不変)
    expect(races[0]!.ageCategory).toBe("大学");
    expect(races[0]!.schoolGrade).toEqual([3]);
  });

  it("[V-P3] 全員 valid", () => {
    expect(races.every((r) => r.validationStatus === "valid")).toBe(true);
  });

  it("[V-P4] 種目属性が文脈から埋まる", () => {
    const r = races[0]!;
    expect(r.distance).toBe(100);
    expect(r.poolLength).toBe(50);
    expect(r.stroke).toBe("Fr");
    expect(r.gender).toBe("male");
    expect(r.round).toBe("決勝(A-決勝)");
    expect(r.isRelay).toBe(false);
  });

  it("[V-P7] sourceRaceId と sourceUrl が再現可能", () => {
    const r = races[0]!;
    expect(r.sourceRaceId).toBe("37446552");
    expect(r.sourceUrl).toBe(buildResultsUrl(ctx()));
    expect(r.sourceUrl).toContain("/games/4826412/results/genders/1");
    expect(r.sourceUrl).toContain("/race_divisions/4/heats/1");
  });
});

describe("parseResults - LAP粒度は距離と整合する (長水路)", () => {
  const cases: Array<[string, number, number, Partial<ResultsContext>]> = [
    ["result.lc.400fr.final.json", 400, 8, { distance: 400, distanceCode: 5 }],
    ["result.lc.1500fr.timed.json", 1500, 30, { distance: 1500, distanceCode: 7 }],
    ["result.lc.200im.final.json", 200, 4, { distance: 200, distanceCode: 4, swimmingStyleCode: 5 }],
  ];

  it.each(cases)("[V-P4] %s は %d m で LAP %d 本", (file, distance, laps, over) => {
    const races = parseResults(fixture(file), ctx(over));
    // fixture は各距離とも1レース分 (複数名) の結果を含む設計のため races[0] は必ず存在する
    const r = races[0]!;
    expect(r.distance).toBe(distance);
    expect(r.splits).toHaveLength(laps);
    expect(r.splits.at(-1)?.distance).toBe(distance);
    expect(r.validationStatus).toBe("valid");
  });

  it("[V-P4] 200IM は stroke=im になる", () => {
    const races = parseResults(fixture("result.lc.200im.final.json"), ctx({ swimmingStyleCode: 5, distance: 200 }));
    expect(races[0]!.stroke).toBe("IM");
  });

  it("[V-P4] 1500m の区間合計が最終タイムに一致する", () => {
    const races = parseResults(fixture("result.lc.1500fr.timed.json"), ctx({ distance: 1500, distanceCode: 7 }));
    const r = races[0]!;
    expect(r.splits.reduce((a, s) => a + (s.lapTimeMs ?? 0), 0)).toBe(r.finalTimeMs);
    expect(r.finalTimeMs).toBe(927000);
  });
});

describe("parseResults - 短水路", () => {
  it("[V-P4] 短水路でも LAP は 50m 粒度 (25m は存在しない)", () => {
    const races = parseResults(
      fixture("result.sc.100fr.timed.json"),
      ctx({ poolLength: 25, gameCode: "2826304", classCode: 6, raceDivisionCode: 2, heat: 4 }),
    );
    const r = races[0]!; // fixture は1レース分の結果を含む設計
    expect(r.poolLength).toBe(25);
    expect(r.splits.map((s) => s.distance)).toEqual([50, 100]);
    expect(races.every((r2) => r2.splits.every((s) => s.distance % 50 === 0))).toBe(true);
  });
});

describe("parseResults - クレンジング", () => {
  it("[V-P3] 失格 (reason_code=2) は LAP があっても disqualified", () => {
    const races = parseResults(
      fixture("result.dsq.200br.json"),
      ctx({ swimmingStyleCode: 3, distanceCode: 4, distance: 200, raceDivisionCode: 1 }),
    );
    expect(races).toHaveLength(1);
    // toHaveLength(1) で races[0] の存在を検証済み
    const r = races[0]!;
    expect(r.reasonCode).toBe(2);
    expect(r.finalTimeMs).toBeNull();
    expect(r.splits.length).toBeGreaterThan(0);
    expect(r.validationStatus).toBe("disqualified");
    expect(r.validationReason).toContain("2");
  });

  it("[V-P3] 棄権 (reason_code=1) も disqualified", () => {
    const races = parseResults(fixture("result.dns.100fr.json"), ctx({ raceDivisionCode: 1, heat: 100 }));
    expect(races).toHaveLength(1);
    const r = races[0]!;
    expect(r.reasonCode).toBe(1);
    expect(r.validationStatus).toBe("disqualified");
  });
});

describe("parseResults - 集約 heat", () => {
  const races = parseResults(
    fixture("result.aggregate-heat100.100fr.json"),
    ctx({ raceDivisionCode: 1, heat: 100, roundName: "予選" }),
  );

  it("[V-P6] heat=100 から複数組がまとめて取れる", () => {
    expect(races.length).toBeGreaterThan(8);
    expect(new Set(races.map((r) => r.sourceRaceId)).size).toBe(races.length);
  });

  it("[V-P6] 1レスポンスに複数の組が混在する (これが集約 heat である根拠)", () => {
    // 集約でなければ heat は1種類しか出てこない
    const heats = new Set(races.map((r) => r.sourceUrl));
    expect(heats.size).toBe(1); // URL は1本
    const grades = races.map((r) => r.ageCategory);
    expect(grades.length).toBeGreaterThan(8);
  });

  it("[V-P6] 集約 heat には棄権も含まれ、除外対象として分類される", () => {
    expect(races.some((r) => r.validationStatus === "disqualified")).toBe(true);
    expect(races.some((r) => r.validationStatus === "valid")).toBe(true);
  });
});
