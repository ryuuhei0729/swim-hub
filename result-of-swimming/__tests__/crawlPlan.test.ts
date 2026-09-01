// =============================================================================
// crawlPlan.test.ts - 大会一覧/種目ツリー/組一覧 -> 取得対象の組み立て
// =============================================================================
// 検証観点:
//   [V-C1] 記録確定 (game_status=5) のみ対象にする
//   [V-C2] waterway を name 優先で判定する (code の意味を取り違えない)
//   [V-C3] 種目ツリーを (gender, style, distance, class, division) へ平坦化する
//   [V-C4] リレー (style 6/7) を除外する
//   [V-C5] heats に 100 があれば 100 だけを取得する (6リクエスト -> 1)
//   [V-C6] 100 が無い division は列挙された組を全て取得する
//   [V-C7] 実在しない heat 100 を集約と誤認しない安全弁
//   [V-C8] ページング情報を読む
// =============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";
import { describe, expect, it } from "vitest";
import { parseGamesList, selectCrawlableGames } from "../src/parser/parseGames";
import { flattenRaceTree } from "../src/parser/parseRaces";
import { selectHeats } from "../src/parser/parseHeats";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures/api", name), "utf8"));

describe("parseGamesList", () => {
  const parsed = parseGamesList(fixture("games-list.page1.json"));

  it("[V-C8] ページング情報を読む", () => {
    expect(parsed.currentPage).toBe(10);
    expect(parsed.lastPage).toBeGreaterThan(1);
    expect(parsed.total).toBeGreaterThan(0);
  });

  it("[V-C2] waterway を長さへ変換する", () => {
    const lengths = new Set(parsed.games.map((g) => g.poolLength));
    for (const l of lengths) expect([25, 50]).toContain(l);
    const sc = parsed.games.find((g) => g.gameCode === "2826304");
    expect(sc?.poolLength).toBe(25); // 短水路
    const lc = parsed.games.find((g) => g.gameCode === "1526711");
    expect(lc?.poolLength).toBe(50); // 長水路
  });

  it("大会名と日付を持つ", () => {
    // games-list.page1.json は実データの1ページ分を含むフィクスチャで必ず1件以上ある
    expect(parsed.games[0]!.gameCode).toBeTruthy();
    expect(parsed.games[0]!.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("[V-C1] 記録確定のみを対象にする", () => {
    const games = [
      { gameCode: "a", statusCode: 5, poolLength: 50 as const, contestants: 100 },
      { gameCode: "b", statusCode: 1, poolLength: 50 as const, contestants: 0 },
      { gameCode: "c", statusCode: 5, poolLength: null, contestants: 10 },
    ];
    const picked = selectCrawlableGames(games as never);
    expect(picked.map((g) => g.gameCode)).toEqual(["a"]);
  });
});

describe("flattenRaceTree", () => {
  const targets = flattenRaceTree(fixture("game-races.4826412.json"), "4826412");

  it("[V-C3] (gender, style, distance, class, division) へ平坦化する", () => {
    expect(targets.length).toBeGreaterThan(50);
    // toBeGreaterThan(50) で targets が1件以上であることを検証済み
    const t = targets[0]!;
    expect(t.gameCode).toBe("4826412");
    for (const key of ["genderCode", "swimmingStyleCode", "distanceCode", "classCode", "raceDivisionCode"]) {
      expect(typeof (t as never as Record<string, unknown>)[key]).toBe("number");
    }
    expect(t.distance).toBeGreaterThan(0);
  });

  it("[V-C4] リレーを除外する", () => {
    expect(targets.every((t) => ![6, 7].includes(t.swimmingStyleCode))).toBe(true);
    // 元データにリレーが存在することを確認 (除外が空振りしていない根拠)
    const raw = JSON.stringify(fixture("game-races.4826412.json"));
    expect(raw).toContain("リレー");
  });

  it("[V-C3] 個人種目の stroke へ写せる", () => {
    expect(new Set(targets.map((t) => t.stroke))).toEqual(new Set(["fr", "ba", "br", "fly", "im"]));
  });

  it("[V-C3] 距離と種目の組が実在するものだけになる", () => {
    const im50 = targets.find((t) => t.stroke === "im" && t.distance === 50);
    expect(im50).toBeUndefined();
  });

  it("round 名と日付を引き継ぐ", () => {
    // 同 describe 内の [V-C3] テストで targets.length > 50 を確認済み (fixture 由来で不変)
    expect(targets[0]!.roundName).toBeTruthy();
    expect(targets[0]!.raceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("selectHeats", () => {
  it("[V-C5] heats に 100 があれば 100 のみ", () => {
    const divisions = selectHeats(fixture("heats-list.1500fr.json"));
    expect(divisions).toHaveLength(1);
    // toHaveLength(1) で divisions[0] の存在を検証済み
    expect(divisions[0]!.raceDivisionCode).toBe(2);
    expect(divisions[0]!.heats).toEqual([100]);
    expect(divisions[0]!.usedAggregate).toBe(true);
  });

  it("[V-C5][V-C6] division ごとに判定する", () => {
    const divisions = selectHeats(fixture("heats-list.100fr.json"));
    const byCode = new Map(divisions.map((d) => [d.raceDivisionCode, d]));
    // 予選は [100,1..6] -> 100 のみ
    expect(byCode.get(1)?.heats).toEqual([100]);
    expect(byCode.get(1)?.usedAggregate).toBe(true);
    // 決勝は [1] のみ -> そのまま
    expect(byCode.get(4)?.heats).toEqual([1]);
    expect(byCode.get(4)?.usedAggregate).toBe(false);
  });

  it("[V-C5] 集約を使うとリクエスト数が減る", () => {
    const divisions = selectHeats(fixture("heats-list.100fr.json"));
    const fetched = divisions.reduce((a, d) => a + d.heats.length, 0);
    const naive = fixture("heats-list.100fr.json").data.reduce(
      (a: number, d: { heats: number[] }) => a + d.heats.length,
      0,
    );
    expect(fetched).toBeLessThan(naive);
  });

  it("[V-C7] 100組ある division では 100 を集約と誤認しない", () => {
    // heats に 100 以上の実在組が並ぶケース。100 を集約扱いすると99組を取り落とす
    const many = { data: [{ division: { code: 1, name: "予選" }, heats: [1, 50, 100, 101] }] };
    const divisions = selectHeats(many);
    // many.data は1件のみのため divisions も1件になる
    expect(divisions[0]!.usedAggregate).toBe(false);
    expect(divisions[0]!.heats).toEqual([1, 50, 100, 101]);
  });

  it("空入力で落ちない", () => {
    expect(selectHeats({ data: [] })).toEqual([]);
    expect(selectHeats({})).toEqual([]);
  });
});
