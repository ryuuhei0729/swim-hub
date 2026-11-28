/**
 * 予定タブの並べ方 (buildScheduleItems)。mobile の utils/teamSchedule.ts と同じ並び (swimhub-tasks #72)
 */
import { describe, it, expect } from "vitest";
import { buildScheduleItems, getScheduleToday } from "@/utils/teamSchedule";
import type { TeamPractice } from "@/hooks/queries/teamPracticeQueries";
import type { TeamCompetition } from "@/hooks/queries/teamCompetitionQueries";

const practice = (id: string, date: string) => ({ id, date }) as TeamPractice;
const competition = (id: string, date: string) => ({ id, date }) as TeamCompetition;

describe("buildScheduleItems", () => {
  it("今日以降は日付の近い順に混ぜ、同じ日は練習を先にする", () => {
    const items = buildScheduleItems({
      practices: [practice("p1", "2099-01-02"), practice("p2", "2099-01-05")],
      competitions: [competition("c1", "2099-01-02"), competition("c2", "2099-01-01")],
      kind: "all",
      showPast: false,
    });
    expect(items.map((item) => item.key)).toEqual(["c-c2", "p-p1", "c-c1", "p-p2"]);
  });

  it("過去は新しい順に混ぜ、同じ日は練習を先にする", () => {
    const items = buildScheduleItems({
      practices: [practice("p1", "2000-01-05"), practice("p2", "2000-01-02")],
      competitions: [competition("c1", "2000-01-02"), competition("c2", "2000-01-03")],
      kind: "all",
      showPast: true,
    });
    expect(items.map((item) => item.key)).toEqual(["p-p1", "c-c2", "p-p2", "c-c1"]);
  });

  it("種類で絞り込む", () => {
    const input = {
      practices: [practice("p1", "2099-01-02")],
      competitions: [competition("c1", "2099-01-01")],
      showPast: false,
    };
    expect(buildScheduleItems({ ...input, kind: "practices" }).map((i) => i.key)).toEqual([
      "p-p1",
    ]);
    expect(buildScheduleItems({ ...input, kind: "competitions" }).map((i) => i.key)).toEqual([
      "c-c1",
    ]);
  });

  it("過去の段階読み込み中は、続きのある側の最古の日付より古いものを出さない", () => {
    // 練習はまだ続きがあり、読み込み済みの最古は 2000-01-10。大会は全件読み込み済み
    const items = buildScheduleItems({
      practices: [practice("p1", "2000-01-20"), practice("p2", "2000-01-10")],
      competitions: [competition("c1", "2000-01-15"), competition("c2", "2000-01-01")],
      kind: "all",
      showPast: true,
      practicesHasMore: true,
      competitionsHasMore: false,
    });
    // 2000-01-01 の大会は、続きの練習 (2000-01-09〜) より後ろに来るので、まだ出さない
    expect(items.map((item) => item.key)).toEqual(["p-p1", "c-c1", "p-p2"]);
  });

  it("絞り込みで外した側の続きは境目に使わない", () => {
    const items = buildScheduleItems({
      practices: [practice("p1", "2000-01-20")],
      competitions: [competition("c1", "2000-01-15"), competition("c2", "2000-01-01")],
      kind: "competitions",
      showPast: true,
      practicesHasMore: true,
    });
    expect(items.map((item) => item.key)).toEqual(["c-c1", "c-c2"]);
  });
});

describe("getScheduleToday", () => {
  it("端末のローカル日付を yyyy-MM-dd で返す", () => {
    expect(getScheduleToday(new Date(2026, 10, 28, 23, 59))).toBe("2026-11-28");
  });
});
