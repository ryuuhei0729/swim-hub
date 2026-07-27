/**
 * domainFilter.test.ts
 *
 * Sprint Contract (DayDetailModal のドメインスコープ分離: 練習履歴/大会記録履歴タブで
 * DayDetailModal を再利用しつつ、無関係な種別を混在表示しないようにする) 検証観点:
 *
 *   [V-01]      scope="day" は entries を一切フィルタせずそのまま返す
 *   [V-02〜04]  scope="practice" は practice / team_practice / practice_log を残す
 *   [V-05〜08]  scope="practice" は competition / team_competition / entry / record を除外する
 *   [V-09〜12]  scope="competition" は competition / team_competition / entry / record を残す
 *   [V-13〜15]  scope="competition" は practice / team_practice / practice_log を除外する
 *   [V-16]      フィルタ後も元の並び順を維持する
 *   [V-17]      非破壊 (入力配列を変更しない)
 *   [V-18]      空配列入力は空配列を返す (practice/competition 双方)
 *   [V-28]      allowlist に存在しない type は practice/competition どちらのスコープでも除外される
 *               (将来の CalendarItemType 拡張や不正データに対する防御)
 *
 * 対象実装: apps/mobile/components/calendar/DayDetailModal/domainFilter.ts
 *   export type DayDetailScope = "day" | "practice" | "competition";
 *   export function filterEntriesByScope(entries: CalendarItem[], scope: DayDetailScope): CalendarItem[]
 *
 * トートロジー防止メモ:
 *   期待値 (どの type がどの scope で残るか) は Sprint Contract の仕様
 *   (PracticesScreen=練習系のみ / RecordsScreen=大会系のみ) から導出したものであり、
 *   domainFilter.ts の実装 (PRACTICE_TYPES/COMPETITION_TYPES の Set の中身) を読んでコピーしたものではない。
 */

import { describe, expect, it } from "vitest";
import { filterEntriesByScope } from "../domainFilter";
import type { CalendarItem } from "@apps/shared/types/ui";

/** テスト用の最小 CalendarItem を組み立てるヘルパー */
function makeItem(type: CalendarItem["type"], id: string): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: {},
  };
}

const ALL_TYPES: CalendarItem["type"][] = [
  "practice",
  "team_practice",
  "practice_log",
  "competition",
  "team_competition",
  "entry",
  "record",
];

const PRACTICE_TYPE_LIST: CalendarItem["type"][] = ["practice", "team_practice", "practice_log"];
const COMPETITION_TYPE_LIST: CalendarItem["type"][] = [
  "competition",
  "team_competition",
  "entry",
  "record",
];

describe("filterEntriesByScope — scope=\"day\" (無フィルタ)", () => {
  it("[V-01] 全種別混在の entries をそのまま (フィルタなし) で返す", () => {
    const entries = ALL_TYPES.map((type, i) => makeItem(type, `id-${i}`));
    const result = filterEntriesByScope(entries, "day");
    expect(result).toBe(entries); // 参照そのまま返す契約 (非破壊かつ余分な複製もしない)
    expect(result).toHaveLength(ALL_TYPES.length);
  });

  it("[V-01b] 空配列でも day はそのまま返す", () => {
    const entries: CalendarItem[] = [];
    expect(filterEntriesByScope(entries, "day")).toBe(entries);
  });
});

describe("filterEntriesByScope — scope=\"practice\"", () => {
  it.each(PRACTICE_TYPE_LIST)("[V-02〜04] type=%s は残る", (type) => {
    const entries = [makeItem(type, "target"), makeItem("record", "other")];
    const result = filterEntriesByScope(entries, "practice");
    expect(result.map((e) => e.id)).toContain("target");
  });

  it.each(COMPETITION_TYPE_LIST)("[V-05〜08] type=%s は除外される", (type) => {
    const entries = [makeItem(type, "target"), makeItem("practice", "keep")];
    const result = filterEntriesByScope(entries, "practice");
    expect(result.map((e) => e.id)).not.toContain("target");
  });

  it("練習系のみの混在配列から大会系だけを正しく除外する (総合)", () => {
    const entries = ALL_TYPES.map((type, i) => makeItem(type, `id-${i}`));
    const result = filterEntriesByScope(entries, "practice");
    expect(result.map((e) => e.type).sort()).toEqual([...PRACTICE_TYPE_LIST].sort());
  });
});

describe("filterEntriesByScope — scope=\"competition\"", () => {
  it.each(COMPETITION_TYPE_LIST)("[V-09〜12] type=%s は残る", (type) => {
    const entries = [makeItem(type, "target"), makeItem("practice", "other")];
    const result = filterEntriesByScope(entries, "competition");
    expect(result.map((e) => e.id)).toContain("target");
  });

  it.each(PRACTICE_TYPE_LIST)("[V-13〜15] type=%s は除外される", (type) => {
    const entries = [makeItem(type, "target"), makeItem("record", "keep")];
    const result = filterEntriesByScope(entries, "competition");
    expect(result.map((e) => e.id)).not.toContain("target");
  });

  it("大会系のみの混在配列から練習系だけを正しく除外する (総合)", () => {
    const entries = ALL_TYPES.map((type, i) => makeItem(type, `id-${i}`));
    const result = filterEntriesByScope(entries, "competition");
    expect(result.map((e) => e.type).sort()).toEqual([...COMPETITION_TYPE_LIST].sort());
  });
});

describe("filterEntriesByScope — 並び順・非破壊・防御的ケース", () => {
  it("[V-16] フィルタ後も元の並び順を維持する", () => {
    const entries = [
      makeItem("record", "r1"),
      makeItem("practice", "p1"),
      makeItem("entry", "e1"),
      makeItem("practice_log", "pl1"),
    ];
    const result = filterEntriesByScope(entries, "competition");
    expect(result.map((e) => e.id)).toEqual(["r1", "e1"]);
  });

  it("[V-17] 入力配列を変更しない (非破壊)", () => {
    const entries = [makeItem("practice", "p1"), makeItem("record", "r1")];
    const snapshot = entries.map((e) => ({ ...e }));
    filterEntriesByScope(entries, "practice");
    expect(entries).toEqual(snapshot);
  });

  it("[V-18] 空配列は practice スコープでも空配列を返す", () => {
    expect(filterEntriesByScope([], "practice")).toEqual([]);
  });

  it("[V-18b] 空配列は competition スコープでも空配列を返す", () => {
    expect(filterEntriesByScope([], "competition")).toEqual([]);
  });

  it(
    "[V-28] allowlist に存在しない (将来拡張/不正データの) type は " +
      "practice スコープでも除外される",
    () => {
      const entries = [
        makeItem("practice", "keep"),
        { ...makeItem("record", "unknown-type-item"), type: "unknown_future_type" as CalendarItem["type"] },
      ];
      const result = filterEntriesByScope(entries, "practice");
      expect(result.map((e) => e.id)).toEqual(["keep"]);
    },
  );

  it(
    "[V-28b] allowlist に存在しない (将来拡張/不正データの) type は " +
      "competition スコープでも除外される",
    () => {
      const entries = [
        makeItem("record", "keep"),
        { ...makeItem("practice", "unknown-type-item"), type: "unknown_future_type" as CalendarItem["type"] },
      ];
      const result = filterEntriesByScope(entries, "competition");
      expect(result.map((e) => e.id)).toEqual(["keep"]);
    },
  );
});
