// =============================================================================
// teamSchedule.test.ts - チームタブ「予定」の絞り込みと並び順
// =============================================================================
//   種類 (全て / 練習 / 大会) は択一、「過去」は独立したオン/オフ。組み合わせて使う。
//   [SC-1] 過去オフ × 全て: 今日以降の練習と大会を日付の近い順。同じ日は練習が先
//   [SC-2] 過去オフ × 練習 / 大会: 今日以降のその種類だけ
//   [SC-3] 過去オン × 全て / 練習 / 大会: 昨日以前のその種類を新しい順
//   [SC-4] 今日の予定は過去オフ側に入る (大会カードの過去判定と同じ基準)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition, Practice } from "@swim-hub/shared/types";

import { buildScheduleItems } from "../teamSchedule";

const practice = (id: string, date: string) => ({ id, date }) as Practice;
const competition = (id: string, date: string) => ({ id, date }) as Competition;

const practices = [
  practice("p-past", "2026-11-10"),
  practice("p-today", "2026-11-13"),
  practice("p-future", "2026-11-20"),
];
const competitions = [
  competition("c-past", "2026-11-08"),
  competition("c-future", "2026-11-13"),
  competition("c-far", "2026-12-01"),
];

const keys = (kind: Parameters<typeof buildScheduleItems>[2], showPast: boolean) =>
  buildScheduleItems(practices, competitions, kind, showPast).map((item) => item.key);

describe("buildScheduleItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0)); // 2026-11-13 (ローカル)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("[SC-1][SC-4] 過去オフ × 全て: 今日以降を日付の近い順、同じ日は練習が先", () => {
    expect(keys("all", false)).toEqual(["p-p-today", "c-c-future", "p-p-future", "c-c-far"]);
  });

  it("[SC-2] 過去オフ × 練習: 今日以降の練習だけ", () => {
    expect(keys("practices", false)).toEqual(["p-p-today", "p-p-future"]);
  });

  it("[SC-2] 過去オフ × 大会: 今日以降の大会だけ", () => {
    expect(keys("competitions", false)).toEqual(["c-c-future", "c-c-far"]);
  });

  it("[SC-3] 過去オン × 全て: 昨日以前の練習と大会を新しい順", () => {
    expect(keys("all", true)).toEqual(["p-p-past", "c-c-past"]);
  });

  it("[SC-3] 過去オン × 練習: 昨日以前の練習だけ", () => {
    expect(keys("practices", true)).toEqual(["p-p-past"]);
  });

  it("[SC-3] 過去オン × 大会: 昨日以前の大会だけ", () => {
    expect(keys("competitions", true)).toEqual(["c-c-past"]);
  });

  it("元の配列を並べ替えない (react-query のキャッシュを壊さない)", () => {
    const before = practices.map((p) => p.id);
    buildScheduleItems(practices, competitions, "all", true);
    expect(practices.map((p) => p.id)).toEqual(before);
  });
});
