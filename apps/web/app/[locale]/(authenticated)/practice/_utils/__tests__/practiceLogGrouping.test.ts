/**
 * practiceLogGrouping テスト
 *
 * 対象: `_utils/practiceLogGrouping.ts` の純関数
 *   - getPracticeLogRowSortValue (V-WP-04/05/06: ソート値は date/place の2列のみ)
 *   - formatCircleTime
 *   - buildPracticeLogLine (1ログ=1カード本文の組み立て)
 *
 * 行の生成 (buildPracticeLogRows) と per-log のタグ判定 (logMatchesAllTags) は
 * web/mobile 共通実装に移したため、`apps/shared/__tests__/utils/practiceLogRows.test.ts`
 * で検証している。
 *
 * トートロジー防止メモ: 実装の if 分岐をそのままなぞらず、「一覧のカードに何が
 * 表示されるか」という観察可能な結果から逆算したケースを検証する。
 */

import { describe, expect, it } from "vitest";
import type { PracticeWithLogs, PracticeLogWithTags } from "@apps/shared/types";
import type { PracticeLogRow } from "@apps/shared/utils/practiceLogRows";
import {
  getPracticeLogRowSortValue,
  buildPracticeLogLine,
  formatCircleTime,
} from "../practiceLogGrouping";

function makeLog(overrides: Partial<PracticeLogWithTags> & { id: string }): PracticeLogWithTags {
  return {
    user_id: "user-1",
    practice_id: "practice-1",
    style: "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 90,
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: [],
    ...overrides,
  } as PracticeLogWithTags;
}

function makePractice(overrides: Partial<PracticeWithLogs> = {}): PracticeWithLogs {
  return {
    id: "practice-1",
    user_id: "user-1",
    date: "2026-07-01",
    title: null,
    place: "市民プール",
    note: null,
    team_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_logs: [makeLog({ id: "log-a" })],
    ...overrides,
  } as PracticeWithLogs;
}

function makeRow(practice: PracticeWithLogs): PracticeLogRow {
  const log = practice.practice_logs?.[0] ?? null;
  return { id: log?.id ?? practice.id, practice, log };
}

describe("getPracticeLogRowSortValue (V-WP-04/05/06: ソート値は date/place の2列のみ)", () => {
  it("column='date' は親 practice.date を Date として返す", () => {
    const value = getPracticeLogRowSortValue(makeRow(makePractice({ date: "2026-03-15" })), "date");
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getFullYear()).toBe(2026);
  });

  it("practice.date が空の場合、created_at にフォールバックする", () => {
    const row = makeRow(makePractice({ date: "", created_at: "2026-05-01T00:00:00Z" }));
    expect(getPracticeLogRowSortValue(row, "date")).toBeInstanceOf(Date);
  });

  it("column='place' は親 practice.place の文字列をそのまま返す", () => {
    const row = makeRow(makePractice({ place: "national-pool" }));
    expect(getPracticeLogRowSortValue(row, "place")).toBe("national-pool");
  });

  it("column='place' で place が未設定(null/空文字)の場合、null を返す(末尾固定は useTableSort 側の責務)", () => {
    expect(getPracticeLogRowSortValue(makeRow(makePractice({ place: null })), "place")).toBeNull();
  });

  it(
    "同じ練習に属する行同士はソート値がタイになる" +
      "(安定ソートにより、同一練習のログがクエリ順のまま隣接する前提)",
    () => {
      const practice = makePractice({
        practice_logs: [makeLog({ id: "log-a" }), makeLog({ id: "log-b" })],
      });
      const rowA: PracticeLogRow = { id: "log-a", practice, log: practice.practice_logs[0]! };
      const rowB: PracticeLogRow = { id: "log-b", practice, log: practice.practice_logs[1]! };

      expect(getPracticeLogRowSortValue(rowA, "place")).toBe(
        getPracticeLogRowSortValue(rowB, "place"),
      );
      expect((getPracticeLogRowSortValue(rowA, "date") as Date).getTime()).toBe(
        (getPracticeLogRowSortValue(rowB, "date") as Date).getTime(),
      );
    },
  );

  it(
    "[非退行] 型 PracticeSortColumn は 'date'|'place' のみだが、" +
      "想定外の値が来てもクラッシュせず null を返す(防御的デフォルト)",
    () => {
      const row = makeRow(makePractice());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getPracticeLogRowSortValue(row, "distance" as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getPracticeLogRowSortValue(row, "style" as any)).toBeNull();
    },
  );
});

describe("formatCircleTime", () => {
  it("60秒以上は m'ss\" 形式になる", () => {
    expect(formatCircleTime(90)).toBe("1'30\"");
  });

  it("60秒未満は 0'ss\" 形式になる", () => {
    expect(formatCircleTime(45)).toBe("0'45\"");
  });

  it("0秒は 0'00\" になる(クラッシュしない)", () => {
    expect(formatCircleTime(0)).toBe("0'00\"");
  });
});

describe("buildPracticeLogLine (1ログ=1カード本文)", () => {
  it("距離×本数×セット / サークル / 種目 を ' / ' で連結する", () => {
    const line = buildPracticeLogLine(
      makeLog({ id: "log-a", distance: 100, rep_count: 4, set_count: 1, style: "Fr" }),
      (style) => (style === "Fr" ? "自由形" : style),
      (distance, reps, sets) => `${distance}m × ${reps}本 × ${sets}セット`,
    );

    expect(line?.secondLineInfo).toBe("100m × 4本 × 1セット / 1'30\" / 自由形");
  });

  it("ログが null(ログ未登録の練習)のとき null を返す", () => {
    expect(buildPracticeLogLine(null, (s) => s, (d, r, s) => `${d}/${r}/${s}`)).toBeNull();
  });

  it("ログが undefined でもクラッシュせず null を返す", () => {
    expect(buildPracticeLogLine(undefined, (s) => s, (d, r, s) => `${d}/${r}/${s}`)).toBeNull();
  });

  it("tags はそのログ自身の practice_log_tags 由来(他のログのタグと混ざらない)", () => {
    const tagA = { id: "tag-a", name: "タグA", color: "#111", user_id: "u", created_at: "", updated_at: "" };
    const line = buildPracticeLogLine(
      makeLog({ id: "log-a", practice_log_tags: [{ practice_tag_id: "tag-a", practice_tags: tagA }] }),
      (s) => s,
      (d, r, s) => `${d}/${r}/${s}`,
    );

    expect(line?.tags).toEqual([tagA]);
  });

  it("distance/rep_count/set_count のいずれかが0/未設定のとき、距離部分を省略する(クラッシュしない)", () => {
    const line = buildPracticeLogLine(
      makeLog({ id: "log-a", distance: 0, rep_count: 4, set_count: 1, circle: null, style: "" }),
      (s) => s,
      (d, r, s) => `${d}/${r}/${s}`,
    );

    expect(line?.secondLineInfo).toBe("");
  });

  it(
    "practice_log_tags の joined practice_tags が null のエントリを含んでもクラッシュせず、" +
      "null を除外した tags を返す(データ不整合=タグが後から削除された等への耐性)",
    () => {
      const tagA = { id: "tag-a", name: "タグA", color: "#111", user_id: "u", created_at: "", updated_at: "" };
      const log = makeLog({
        id: "log-a",
        practice_log_tags: [
          { practice_tag_id: "tag-a", practice_tags: tagA },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 意図的にDB不整合(joined tag削除済み)を再現する
          { practice_tag_id: "tag-deleted", practice_tags: null as any },
        ],
      });

      expect(() => buildPracticeLogLine(log, (s) => s, (d, r, s) => `${d}/${r}/${s}`)).not.toThrow();
      expect(buildPracticeLogLine(log, (s) => s, (d, r, s) => `${d}/${r}/${s}`)?.tags).toEqual([tagA]);
    },
  );
});
