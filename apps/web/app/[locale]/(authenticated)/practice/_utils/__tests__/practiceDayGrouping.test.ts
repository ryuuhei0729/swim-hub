/**
 * practiceDayGrouping テスト (Sprint Contract Phase B)
 *
 * 対象: `_utils/practiceDayGrouping.ts` の3つの純関数
 *   - groupLogsByPracticeDay
 *   - dayHasLogMatchingAllTags (V-WP-13/14: tags ANY-log-exists 判定、最重要)
 *   - getPracticeDaySortValue (V-WP-04/05/06: day-level ソート値)
 *
 * トートロジー防止メモ: 実装の if 分岐をそのままなぞらず、Sprint Contract の
 * Success Criteria(「1ログ内でAND・日全体でOR-exists」「date/placeの2値のみ」)から
 * 逆算したケース(タグが複数ログに分散している場合は不一致になる、等)を検証する。
 */

import { describe, expect, it } from "vitest";
import type { PracticeWithLogs, PracticeLogWithTags } from "@apps/shared/types";
import {
  groupLogsByPracticeDay,
  dayHasLogMatchingAllTags,
  getPracticeDaySortValue,
  buildPracticeLogLines,
  formatCircleTime,
} from "../practiceDayGrouping";

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

const tagIdOf = (log: PracticeLogWithTags, ...tagIds: string[]) => ({
  ...log,
  practice_log_tags: tagIds.map((tagId) => ({
    practice_tag_id: tagId,
    practice_tags: { id: tagId, name: tagId, color: "#000", user_id: "user-1", created_at: "", updated_at: "" },
  })),
});

describe("groupLogsByPracticeDay", () => {
  it("practice.id が重複しない配列は、要素数・順序ともそのまま返す(恒等)", () => {
    const practices = [makePractice({ id: "p1" }), makePractice({ id: "p2" })];
    expect(groupLogsByPracticeDay(practices)).toEqual(practices);
  });

  it("同一 practice.id が複数含まれる場合、去重されて先頭の1件のみ残る", () => {
    const first = makePractice({ id: "p1", place: "先頭" });
    const duplicate = makePractice({ id: "p1", place: "重複" });
    const other = makePractice({ id: "p2" });

    const result = groupLogsByPracticeDay([first, duplicate, other]);

    expect(result).toHaveLength(2);
    expect(result.find((p) => p.id === "p1")?.place).toBe("先頭");
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(groupLogsByPracticeDay([])).toEqual([]);
  });
});

describe("dayHasLogMatchingAllTags (V-WP-13/14: tags ANY-log-exists 判定)", () => {
  it("選択タグが0件のときは常に true を返す(未フィルタ扱い)", () => {
    const practice = makePractice({ practice_logs: [] });
    expect(dayHasLogMatchingAllTags(practice, [])).toBe(true);
  });

  it(
    "[V-WP-13] 選択した全タグ(A, B)を1つのログが両方持つ場合、true を返す" +
      "(単一ログ内でAND成立)",
    () => {
      const log = tagIdOf(makeLog({ id: "log-1" }), "tag-a", "tag-b");
      const practice = makePractice({ practice_logs: [log] });
      expect(dayHasLogMatchingAllTags(practice, ["tag-a", "tag-b"])).toBe(true);
    },
  );

  it(
    "[V-WP-13 回帰・最重要] 選択タグ(A, B)がそれぞれ別ログに1つずつ分散している場合、" +
      "false を返す(「日の全ログのタグを合算してAND」ではないことの確認。" +
      "この判定を誤ると『別ログに分散したタグの組み合わせ』が誤って一致扱いになる)",
    () => {
      const logWithA = tagIdOf(makeLog({ id: "log-1" }), "tag-a");
      const logWithB = tagIdOf(makeLog({ id: "log-2" }), "tag-b");
      const practice = makePractice({ practice_logs: [logWithA, logWithB] });
      expect(dayHasLogMatchingAllTags(practice, ["tag-a", "tag-b"])).toBe(false);
    },
  );

  it(
    "[V-WP-14] 全選択タグを満たすログが1件でもあれば、他のログが無関係でも true を返す" +
      "(OR-exists: 該当ログ以外の残りログの内容は判定に影響しない)",
    () => {
      const matchingLog = tagIdOf(makeLog({ id: "log-1" }), "tag-a", "tag-b");
      const unrelatedLog = makeLog({ id: "log-2" }); // タグなし
      const practice = makePractice({ practice_logs: [unrelatedLog, matchingLog] });
      expect(dayHasLogMatchingAllTags(practice, ["tag-a", "tag-b"])).toBe(true);
    },
  );

  it("選択タグの上位集合(余分なタグ込み)を持つログでも true を返す(部分一致ではなく包含関係)", () => {
    const log = tagIdOf(makeLog({ id: "log-1" }), "tag-a", "tag-b", "tag-c");
    const practice = makePractice({ practice_logs: [log] });
    expect(dayHasLogMatchingAllTags(practice, ["tag-a", "tag-b"])).toBe(true);
  });

  it("practice_logs が空配列で選択タグが1件以上ある場合、false を返す(境界値)", () => {
    const practice = makePractice({ practice_logs: [] });
    expect(dayHasLogMatchingAllTags(practice, ["tag-a"])).toBe(false);
  });

  it("practice_logs が undefined でもクラッシュせず false を返す(データ不整合耐性)", () => {
    const practice = makePractice({ practice_logs: undefined });
    expect(() => dayHasLogMatchingAllTags(practice, ["tag-a"])).not.toThrow();
    expect(dayHasLogMatchingAllTags(practice, ["tag-a"])).toBe(false);
  });

  it("選択タグのうち1つしか持たないログのみの場合、false を返す(単一タグ選択時の非該当ケース)", () => {
    const log = tagIdOf(makeLog({ id: "log-1" }), "tag-a");
    const practice = makePractice({ practice_logs: [log] });
    expect(dayHasLogMatchingAllTags(practice, ["tag-a", "tag-b"])).toBe(false);
  });
});

describe("getPracticeDaySortValue (V-WP-04/05/06: day-level ソート値・2列のみ)", () => {
  it("column='date' は practice.date を Date として返す", () => {
    const practice = makePractice({ date: "2026-03-15" });
    const value = getPracticeDaySortValue(practice, "date");
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getFullYear()).toBe(2026);
  });

  it("practice.date が空の場合、created_at にフォールバックする", () => {
    const practice = makePractice({ date: "", created_at: "2026-05-01T00:00:00Z" });
    const value = getPracticeDaySortValue(practice, "date");
    expect(value).toBeInstanceOf(Date);
  });

  it("column='place' は practice.place の文字列をそのまま返す", () => {
    const practice = makePractice({ place: "national-pool" });
    expect(getPracticeDaySortValue(practice, "place")).toBe("national-pool");
  });

  it("column='place' で place が未設定(null/空文字)の場合、null を返す(末尾固定は useTableSort 側の責務)", () => {
    const practice = makePractice({ place: null });
    expect(getPracticeDaySortValue(practice, "place")).toBeNull();
  });

  it(
    "[非退行] 型 PracticeSortColumn は 'date'|'place' のみだが、" +
      "想定外の値が来てもクラッシュせず null を返す(防御的デフォルト)",
    () => {
      const practice = makePractice();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getPracticeDaySortValue(practice, "distance" as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getPracticeDaySortValue(practice, "style" as any)).toBeNull();
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

describe("buildPracticeLogLines (C-3: 全ログ展開の中核純関数)", () => {
  it("[V-26] 2件のログを渡すと、2件分の行がそのままの順序で返る(先頭だけに絞り込まない)", () => {
    const logs = [
      makeLog({ id: "log-a", distance: 100, rep_count: 4, set_count: 1, style: "Fr" }),
      makeLog({ id: "log-b", distance: 50, rep_count: 2, set_count: 1, style: "Br" }),
    ];
    const lines = buildPracticeLogLines(
      logs,
      (style) => (style === "Fr" ? "自由形" : style === "Br" ? "平泳ぎ" : style),
      (distance, reps, sets) => `${distance}m × ${reps}本 × ${sets}セット`,
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ logId: "log-a", secondLineInfo: "100m × 4本 × 1セット / 1'30\" / 自由形" });
    expect(lines[1]).toMatchObject({ logId: "log-b", secondLineInfo: "50m × 2本 × 1セット / 1'30\" / 平泳ぎ" });
  });

  it("[V-29] logs が undefined のとき、空配列を返す(クラッシュしない)", () => {
    expect(buildPracticeLogLines(undefined, (s) => s, (d, r, s) => `${d}/${r}/${s}`)).toEqual([]);
  });

  it("[V-29] logs が空配列のとき、空配列を返す", () => {
    expect(buildPracticeLogLines([], (s) => s, (d, r, s) => `${d}/${r}/${s}`)).toEqual([]);
  });

  it("[V-30] 各行の tags はそのログ自身の practice_log_tags 由来で、他のログのタグと混ざらない", () => {
    const tagA = { id: "tag-a", name: "タグA", color: "#111", user_id: "u", created_at: "", updated_at: "" };
    const tagB = { id: "tag-b", name: "タグB", color: "#222", user_id: "u", created_at: "", updated_at: "" };
    const logs = [
      makeLog({ id: "log-a", practice_log_tags: [{ practice_tag_id: "tag-a", practice_tags: tagA }] }),
      makeLog({ id: "log-b", practice_log_tags: [{ practice_tag_id: "tag-b", practice_tags: tagB }] }),
    ];
    const lines = buildPracticeLogLines(logs, (s) => s, (d, r, s) => `${d}/${r}/${s}`);

    expect(lines[0].tags).toEqual([tagA]);
    expect(lines[1].tags).toEqual([tagB]);
  });

  it("distance/rep_count/set_count のいずれかが0/未設定のとき、距離部分を省略する(クラッシュしない)", () => {
    const logs = [makeLog({ id: "log-a", distance: 0, rep_count: 4, set_count: 1, circle: null, style: "" })];
    const lines = buildPracticeLogLines(logs, (s) => s, (d, r, s) => `${d}/${r}/${s}`);

    expect(lines[0].secondLineInfo).toBe("");
  });

  it(
    "[Reviewer W-4 対応] practice_log_tags の joined practice_tags が null のエントリを含んでも" +
      "クラッシュせず、null を除外した tags を返す(mobile PracticeItem.tsx の logRows と同じ" +
      "null ガード。データ不整合(タグが後から削除された等)への耐性)",
    () => {
      const tagA = { id: "tag-a", name: "タグA", color: "#111", user_id: "u", created_at: "", updated_at: "" };
      const logs = [
        makeLog({
          id: "log-a",
          practice_log_tags: [
            { practice_tag_id: "tag-a", practice_tags: tagA },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 意図的にDB不整合(joined tag削除済み)を再現する
            { practice_tag_id: "tag-deleted", practice_tags: null as any },
          ],
        }),
      ];

      expect(() => buildPracticeLogLines(logs, (s) => s, (d, r, s) => `${d}/${r}/${s}`)).not.toThrow();
      const lines = buildPracticeLogLines(logs, (s) => s, (d, r, s) => `${d}/${r}/${s}`);
      expect(lines[0].tags).toEqual([tagA]);
    },
  );
});
