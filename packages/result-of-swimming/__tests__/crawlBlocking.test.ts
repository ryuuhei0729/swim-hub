// =============================================================================
// crawlBlocking.test.ts - 取得失敗の扱い
// =============================================================================
// 2026-08-19 の実クロールで、403 でブロックされた大会が journal に
// 「個人種目なし」と記録され、原因追跡ができなくなる問題が出た。
// また 403 が109回連続しても叩き続けていた。その両方を固定する。
//
// 検証観点:
//   [V-B1] 取得失敗と「本当に個人種目が無い」を別の理由として記録する
//   [V-B2] 403 が連続したらブロックと判断して中断する
//   [V-B3] 中断後は追加のリクエストを出さない
//   [V-B4] 403 が単発なら中断しない (連続カウンタがリセットされる)
// =============================================================================

import { describe, expect, it } from "vitest";
import { crawl } from "../src/crawler/crawl";
import { MemoryJournal } from "../src/crawler/journal";
import type { PoliteHttpClient } from "../src/crawler/httpClient";

const gamesPage = {
  data: [
    {
      game_code: "G1",
      game_name: "大会1",
      start_date: "2026-08-01",
      waterway: { code: 1, name: "長水路" },
      game_status: { code: 5, name: "記録確定" },
      contestants: 100,
    },
    {
      game_code: "G2",
      game_name: "大会2",
      start_date: "2026-08-02",
      waterway: { code: 1, name: "長水路" },
      game_status: { code: 5, name: "記録確定" },
      contestants: 100,
    },
  ],
  meta: { current_page: 1, last_page: 1, total: 2 },
};

/** URL パターンごとに status/body を決める fake client */
function fakeClient(handler: (url: string) => { status: number; body: unknown }) {
  const calls: string[] = [];
  const client = {
    remainingQuota: 2000,
    async get(url: string) {
      calls.push(url);
      const { status, body } = handler(url);
      return { url, status, body: JSON.stringify(body), fromCache: false };
    },
  };
  return { client: client as unknown as PoliteHttpClient, calls };
}

describe("crawl - 取得失敗の記録", () => {
  it("[V-B1] 種目ツリーが403なら『個人種目なし』ではなく取得失敗として記録する", async () => {
    const journal = new MemoryJournal();
    const { client } = fakeClient((url) => {
      if (url.includes("/games?")) return { status: 200, body: gamesPage };
      if (url.endsWith("/races")) return { status: 403, body: {} };
      return { status: 200, body: { data: [] } };
    });

    const summary = await crawl({ client, journal, year: 2026, gameLimit: 2 });

    const skips = journal.events.filter((e) => e.type === "skip") as Array<{ reason: string }>;
    expect(skips.length).toBeGreaterThan(0);
    // toBeGreaterThan(0) で skips が1件以上であることを検証済み
    expect(skips[0]!.reason).toContain("403");
    expect(skips[0]!.reason).not.toContain("個人種目なし");
    expect(summary.fetchFailures).toBeGreaterThan(0);
    expect(summary.gamesCrawled).toBe(0);
  });

  it("[V-B1] 本当に個人種目が無い場合は『個人種目なし』と記録する", async () => {
    const journal = new MemoryJournal();
    const { client } = fakeClient((url) => {
      if (url.includes("/games?")) return { status: 200, body: gamesPage };
      // リレーのみの大会 = 個人種目ゼロ
      if (url.endsWith("/races"))
        return {
          status: 200,
          body: {
            data: [
              {
                race_date: "2026-08-01",
                race_genders: [
                  {
                    gender: { code: 1, name: "男子" },
                    held_styles: [
                      {
                        swimming_style: { code: 6, name: "フリーリレー" },
                        held_distances: [
                          {
                            distance: { code: 5, name: "400m" },
                            classes: [{ class: { code: 1 }, race_divisions: [{ division: { code: 1 } }] }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        };
      return { status: 200, body: { data: [] } };
    });

    await crawl({ client, journal, year: 2026, gameLimit: 1 });

    const skips = journal.events.filter((e) => e.type === "skip") as Array<{ reason: string }>;
    expect(skips.length).toBeGreaterThan(0);
    expect(skips[0]!.reason).toBe("個人種目なし");
  });
});

describe("crawl - ブロック検知", () => {
  it("[V-B2][V-B3] 403 が連続したら中断し、それ以上叩かない", async () => {
    const journal = new MemoryJournal();
    const many = {
      data: Array.from({ length: 50 }, (_, i) => ({
        game_code: `G${i}`,
        game_name: `大会${i}`,
        start_date: "2026-08-01",
        waterway: { code: 1, name: "長水路" },
        game_status: { code: 5, name: "記録確定" },
        contestants: 10,
      })),
      meta: { current_page: 1, last_page: 1, total: 50 },
    };
    const { client, calls } = fakeClient((url) => {
      if (url.includes("/games?")) return { status: 200, body: many };
      return { status: 403, body: {} };
    });

    const summary = await crawl({
      client,
      journal,
      year: 2026,
      gameLimit: 50,
      consecutiveBlockLimit: 5,
    });

    expect(summary.blocked).toBe(true);
    // 大会一覧1回 + /races 5回 で止まる (50大会を叩き切らない)
    expect(calls.length).toBeLessThanOrEqual(7);
    expect(journal.events.some((e) => e.type === "note" && /ブロック/.test((e as { message: string }).message))).toBe(true);
  });

  it("[V-B4] 403 が単発ならブロック判定しない", async () => {
    const journal = new MemoryJournal();
    let racesCalls = 0;
    const { client } = fakeClient((url) => {
      if (url.includes("/games?")) return { status: 200, body: gamesPage };
      if (url.endsWith("/races")) {
        racesCalls++;
        // 1件目だけ403、2件目は正常
        if (racesCalls === 1) return { status: 403, body: {} };
        return { status: 200, body: { data: [] } };
      }
      return { status: 200, body: { data: [] } };
    });

    const summary = await crawl({ client, journal, year: 2026, gameLimit: 2, consecutiveBlockLimit: 5 });

    expect(summary.blocked).toBe(false);
    expect(summary.fetchFailures).toBe(1);
  });
});
