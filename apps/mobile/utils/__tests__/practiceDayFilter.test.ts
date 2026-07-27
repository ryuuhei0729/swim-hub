/**
 * practiceDayFilter テスト (Sprint Contract Phase B)
 *
 * 対象: `utils/practiceDayFilter.ts` (PracticesScreen の純フィルタ/ソートロジック)
 *
 * Sprint Contract 検証観点:
 *   [V-MP-01/02 最重要] tags フィルタの ANY-log-exists 意味論修正(現行実装の
 *     `selectedTagIds.some(...)` = 全ログ横断OR から、「選択した全タグを含むログが
 *     その日の少なくとも1件に存在する」への回帰確認)
 *   [V-MP-03/04] place(multi/OR)・style(single, ANY-log match) フィルタ新設
 *   [V-MP-05] グループ間AND
 *   [V-MP-06] date/place の4プリセットソート
 *
 * トートロジー防止メモ: practiceMatchesTags 内の実装をそのまま踏襲せず、
 * 「別ログに分散したタグの組み合わせは不一致になるべき」という Sprint Contract の
 * 要求(=現行mobileバグの回帰ケース)から逆算したテストを用意する。
 */

import { describe, expect, it } from "vitest";
import type { PracticeWithLogs, PracticeLogWithTags } from "@swim-hub/shared/types";
import {
  practiceMatchesTags,
  practiceMatchesPlaces,
  practiceMatchesStyle,
  filterPractices,
  countActivePracticeFilters,
  getParticipatedPracticePlaces,
  getParticipatedPracticeStyleCodes,
  sortPractices,
  type PracticeFilterValues,
} from "../practiceDayFilter";

function makeLog(
  id: string,
  overrides: Partial<{ style: string; tagIds: string[] }> = {},
): PracticeLogWithTags {
  return {
    id,
    user_id: "user-1",
    practice_id: "practice-1",
    style: overrides.style ?? "fr",
    swim_category: "Swim" as const,
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 60,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: (overrides.tagIds ?? []).map((tagId) => ({
      practice_tag_id: tagId,
      practice_tags: { id: tagId, name: tagId, color: "#000", user_id: "u", created_at: "", updated_at: "" },
    })),
  };
}

function makePractice(overrides: Partial<PracticeWithLogs> = {}): PracticeWithLogs {
  return {
    id: "practice-1",
    user_id: "user-1",
    date: "2026-01-01",
    title: null,
    place: "テストプール",
    note: null,
    team_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    practice_logs: [makeLog("log-1")],
    ...overrides,
  } as unknown as PracticeWithLogs;
}

describe("practiceMatchesTags ([V-MP-01/02] ANY-log-exists 判定、最重要)", () => {
  it("選択タグ0件は常に true(未フィルタ扱い)", () => {
    expect(practiceMatchesTags(makePractice(), [])).toBe(true);
  });

  it("1つのログが選択タグ全てを持つ場合、true(単一ログ内AND)", () => {
    const practice = makePractice({ practice_logs: [makeLog("log-1", { tagIds: ["tag-a", "tag-b"] })] });
    expect(practiceMatchesTags(practice, ["tag-a", "tag-b"])).toBe(true);
  });

  it(
    "[最重要・現行バグの回帰] 選択タグ(A, B)がそれぞれ別ログに1つずつ分散している場合、" +
      "false を返す。現行実装の `selectedTagIds.some(tagId => logTagIds.includes(tagId))`" +
      "(全ログ横断でフラット化してからのOR)ではこのケースが誤って true になっていた",
    () => {
      const practice = makePractice({
        practice_logs: [
          makeLog("log-1", { tagIds: ["tag-a"] }),
          makeLog("log-2", { tagIds: ["tag-b"] }),
        ],
      });
      expect(practiceMatchesTags(practice, ["tag-a", "tag-b"])).toBe(false);
    },
  );

  it("全選択タグを満たすログが1件でもあれば、他のログが無関係でも true(OR-exists)", () => {
    const practice = makePractice({
      practice_logs: [makeLog("log-1", { tagIds: [] }), makeLog("log-2", { tagIds: ["tag-a", "tag-b"] })],
    });
    expect(practiceMatchesTags(practice, ["tag-a", "tag-b"])).toBe(true);
  });

  it("practice_logs が空配列で選択タグが1件以上ある場合、false(境界値)", () => {
    expect(practiceMatchesTags(makePractice({ practice_logs: [] }), ["tag-a"])).toBe(false);
  });

  it("practice_logs が undefined でもクラッシュしない", () => {
    const practice = makePractice({ practice_logs: undefined });
    expect(() => practiceMatchesTags(practice, ["tag-a"])).not.toThrow();
  });
});

describe("practiceMatchesPlaces ([V-MP-03] multi/OR)", () => {
  it("選択0件は常に true", () => {
    expect(practiceMatchesPlaces(makePractice(), [])).toBe(true);
  });

  it("選択した場所いずれかに一致すれば true", () => {
    expect(practiceMatchesPlaces(makePractice({ place: "プールA" }), ["プールA", "プールB"])).toBe(true);
  });

  it("一致しない場合は false", () => {
    expect(practiceMatchesPlaces(makePractice({ place: "プールC" }), ["プールA", "プールB"])).toBe(false);
  });

  it("place が null の場合は false(未設定センチネル非対応。web と異なり place multi は素の値比較のみ)", () => {
    expect(practiceMatchesPlaces(makePractice({ place: null }), ["プールA"])).toBe(false);
  });
});

describe("practiceMatchesStyle ([V-MP-04] single, ANY-log match)", () => {
  it("選択なし('')は常に true", () => {
    expect(practiceMatchesStyle(makePractice(), "")).toBe(true);
  });

  it("その日のいずれかのログの種目が一致すれば true", () => {
    const practice = makePractice({
      practice_logs: [makeLog("log-1", { style: "fr" }), makeLog("log-2", { style: "br" })],
    });
    expect(practiceMatchesStyle(practice, "br")).toBe(true);
  });

  it("一致するログが無ければ false", () => {
    const practice = makePractice({ practice_logs: [makeLog("log-1", { style: "fr" })] });
    expect(practiceMatchesStyle(practice, "br")).toBe(false);
  });

  it("style の大文字小文字表記ゆれ(Fr/FR等)を正規化して一致させる", () => {
    const practice = makePractice({ practice_logs: [makeLog("log-1", { style: "Fr" })] });
    expect(practiceMatchesStyle(practice, "fr")).toBe(true);
  });
});

describe("filterPractices ([V-MP-05] グループ間AND)", () => {
  it("place・style・tags すべて満たす日のみ返る", () => {
    const matching = makePractice({
      id: "p-match",
      place: "プールA",
      practice_logs: [makeLog("log-1", { style: "fr", tagIds: ["tag-a"] })],
    });
    const wrongPlace = makePractice({
      id: "p-wrong-place",
      place: "プールB",
      practice_logs: [makeLog("log-2", { style: "fr", tagIds: ["tag-a"] })],
    });
    const wrongStyle = makePractice({
      id: "p-wrong-style",
      place: "プールA",
      practice_logs: [makeLog("log-3", { style: "br", tagIds: ["tag-a"] })],
    });

    const filters: PracticeFilterValues = {
      filterPlaces: ["プールA"],
      filterStyle: "fr",
      selectedTagIds: ["tag-a"],
    };
    const result = filterPractices([matching, wrongPlace, wrongStyle], filters);
    expect(result.map((p) => p.id)).toEqual(["p-match"]);
  });

  it("全フィルタ未指定(空)の場合、全件を返す", () => {
    const practices = [makePractice({ id: "p1" }), makePractice({ id: "p2" })];
    const filters: PracticeFilterValues = { filterPlaces: [], filterStyle: "", selectedTagIds: [] };
    expect(filterPractices(practices, filters)).toHaveLength(2);
  });
});

describe("countActivePracticeFilters", () => {
  it("全て未指定なら0", () => {
    expect(countActivePracticeFilters({ filterPlaces: [], filterStyle: "", selectedTagIds: [] })).toBe(0);
  });

  it("place/style/tags いずれか1件以上あればグループごとに1カウント", () => {
    expect(
      countActivePracticeFilters({ filterPlaces: ["プールA"], filterStyle: "fr", selectedTagIds: ["tag-a"] }),
    ).toBe(3);
  });
});

describe("選択肢生成関数", () => {
  it("getParticipatedPracticePlaces は distinct・ロケール順、null/空はスキップ", () => {
    const practices = [
      makePractice({ id: "p1", place: "プールB" }),
      makePractice({ id: "p2", place: "プールA" }),
      makePractice({ id: "p3", place: null }),
    ];
    expect(getParticipatedPracticePlaces(practices, "ja")).toEqual(["プールA", "プールB"]);
  });

  it("getParticipatedPracticeStyleCodes は STYLES 定義順で distinct を返す", () => {
    const practices = [
      makePractice({ id: "p1", practice_logs: [makeLog("l1", { style: "br" })] }),
      makePractice({ id: "p2", practice_logs: [makeLog("l2", { style: "fr" })] }),
    ];
    expect(getParticipatedPracticeStyleCodes(practices)).toEqual(["fr", "br"]);
  });
});

describe("sortPractices ([V-MP-06] date/place の4プリセット)", () => {
  it("sortColumn=null の場合、渡された順序をそのまま維持する(既定=サーバー日付降順)", () => {
    const practices = [makePractice({ id: "p1" }), makePractice({ id: "p2" })];
    expect(sortPractices(practices, null, "desc")).toEqual(practices);
  });

  it("sortColumn='date', order='asc' は日付昇順", () => {
    const older = makePractice({ id: "older", date: "2026-01-01" });
    const newer = makePractice({ id: "newer", date: "2026-02-01" });
    expect(sortPractices([newer, older], "date", "asc").map((p) => p.id)).toEqual(["older", "newer"]);
  });

  it("sortColumn='place', order='asc' は場所昇順(localeCompare)", () => {
    const a = makePractice({ id: "a", place: "Aプール" });
    const b = makePractice({ id: "b", place: "Bプール" });
    expect(sortPractices([b, a], "place", "asc", "ja").map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("sortColumn='place', order='desc' は場所降順", () => {
    const a = makePractice({ id: "a", place: "Aプール" });
    const b = makePractice({ id: "b", place: "Bプール" });
    expect(sortPractices([a, b], "place", "desc", "ja").map((p) => p.id)).toEqual(["b", "a"]);
  });

  describe("[V-SH-03 修正確認] place が未設定(null)の日は asc/desc いずれでも末尾固定される", () => {
    it("昇順(asc)でも、place=null の日は末尾に固定される(空文字比較で先頭に来る退行をしない)", () => {
      const withPlace = makePractice({ id: "has", place: "Aプール" });
      const withoutPlace = makePractice({ id: "none", place: null });
      const result = sortPractices([withoutPlace, withPlace], "place", "asc", "ja");
      expect(result.map((p) => p.id)).toEqual(["has", "none"]);
    });

    it("降順(desc)でも、place=null の日は末尾に固定される(sortOrder の符号反転で先頭に来ない)", () => {
      const withPlace = makePractice({ id: "has", place: "Aプール" });
      const withoutPlace = makePractice({ id: "none", place: null });
      const result = sortPractices([withPlace, withoutPlace], "place", "desc", "ja");
      expect(result.map((p) => p.id)).toEqual(["has", "none"]);
    });

    it("複数の place=null 日が混在しても、null 側だけが常に末尾に集まる(asc)", () => {
      const a = makePractice({ id: "a", place: "Aプール" });
      const nullX = makePractice({ id: "null-x", place: null });
      const b = makePractice({ id: "b", place: "Bプール" });
      const nullY = makePractice({ id: "null-y", place: null });
      const result = sortPractices([nullX, b, nullY, a], "place", "asc", "ja");
      expect(result.map((p) => p.id).slice(0, 2)).toEqual(["a", "b"]);
      expect(result.map((p) => p.id).slice(2)).toEqual(["null-x", "null-y"]);
    });
  });

  describe("[V-MP-06 修正確認] date のパース失敗(不正な日付文字列)も asc/desc いずれでも末尾固定される", () => {
    it("date が不正な文字列の日は昇順でも末尾に固定される", () => {
      const validDate = makePractice({ id: "valid", date: "2026-01-01" });
      const invalidDate = makePractice({ id: "invalid", date: "not-a-date" });
      const result = sortPractices([invalidDate, validDate], "date", "asc");
      expect(result.map((p) => p.id)).toEqual(["valid", "invalid"]);
    });

    it("date が不正な文字列の日は降順でも末尾に固定される", () => {
      const validDate = makePractice({ id: "valid", date: "2026-01-01" });
      const invalidDate = makePractice({ id: "invalid", date: "not-a-date" });
      const result = sortPractices([validDate, invalidDate], "date", "desc");
      expect(result.map((p) => p.id)).toEqual(["valid", "invalid"]);
    });
  });
});
