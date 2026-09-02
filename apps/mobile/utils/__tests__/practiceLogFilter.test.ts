/**
 * practiceLogFilter テスト
 *
 * 対象: `utils/practiceLogFilter.ts` (PracticesScreen の純フィルタ/ソートロジック)
 *
 * 2026-08-01 に一覧の粒度を log-level(1 practice_log = 1カード)へ変更したため、
 * フィルタ/ソートは PracticeLogRow 単位で行う。行の生成と per-log のタグ判定は
 * 共有側 (`@apps/shared/utils/practiceLogRows`) のテストで担保しているので、
 * 本ファイルは mobile 固有の以下を検証する:
 *   [V-MP-03] place(multi/OR、親 practice のフィールド)
 *   [V-MP-04] style(single、そのログ自身の種目。大文字小文字の表記ゆれ正規化を含む)
 *   [V-MP-05] グループ間AND
 *   [V-MP-06] date/place の4プリセットソート(欠損値は asc/desc いずれでも末尾固定)
 *   [V-MP-07] 同一練習のログがソート後も隣接し、元のログ順を保つこと(安定ソート)
 *
 * トートロジー防止メモ: 実装の分岐をなぞらず、「絞り込み後に一覧へ何枚のカードが
 * 残るか」という観察可能な結果から逆算して書く。
 *
 * NOTE (Sprint: GitHub Issue #13 種目略称ケーシング統一, PM裁定 2026-09-01):
 *   種目マスタードメイン (`SwimStyle`) がタイトルケース ("Fr"/"Br"/"Ba"/"Fly"/"IM") に
 *   統一されるのに合わせ、本ファイルの style 関連の期待値を旧小文字 canonical から
 *   新タイトルケース canonical に更新した。practice_logs.style は元々タイトルケースで
 *   永続化されており(このマイグレーション以前から)、fr/br 等の小文字リテラルで書いていた
 *   旧テストの方が実データと乖離した誤ったフィクスチャだった。
 *   「大文字小文字表記ゆれ正規化」のテストケースだけは、正規化元(表記ゆれのある入力)を
 *   小文字/全大文字のバリアントのまま残し、正規化先(canonical/フィルタ値)だけを
 *   タイトルケースに更新している(normalizeStyleCode が表記ゆれを吸収する既存の
 *   意図そのものは変わらないため)。
 */

import { describe, expect, it } from "vitest";
import type { PracticeWithLogs, PracticeLogWithTags } from "@swim-hub/shared/types";
import { buildPracticeLogRows } from "@apps/shared/utils/practiceLogRows";
import {
  practiceMatchesPlaces,
  logMatchesStyle,
  filterPracticeLogRows,
  countActivePracticeFilters,
  getParticipatedPracticePlaces,
  getParticipatedPracticeStyleCodes,
  sortPracticeLogRows,
  type PracticeFilterValues,
} from "../practiceLogFilter";

function makeLog(
  id: string,
  overrides: Partial<{ style: string; tagIds: string[] }> = {},
): PracticeLogWithTags {
  return {
    id,
    user_id: "user-1",
    practice_id: "practice-1",
    style: overrides.style ?? "Fr",
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

/** 一覧に残るカードを識別するための行ID(=practice_log.id) */
function rowIds(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

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

describe("logMatchesStyle ([V-MP-04] single, そのログ自身の種目)", () => {
  it("選択なし('')は常に true", () => {
    expect(logMatchesStyle(makeLog("log-1"), "")).toBe(true);
    expect(logMatchesStyle(null, "")).toBe(true);
  });

  it("そのログの種目が一致すれば true", () => {
    expect(logMatchesStyle(makeLog("log-1", { style: "Br" }), "Br")).toBe(true);
  });

  it("一致しなければ false", () => {
    expect(logMatchesStyle(makeLog("log-1", { style: "Fr" }), "Br")).toBe(false);
  });

  it("style が legacy な全小文字(fr)の場合は正規化してcanonical値(Fr)に一致させる(移行窓の防御)", () => {
    expect(logMatchesStyle(makeLog("log-1", { style: "fr" }), "Fr")).toBe(true);
  });

  // PM 裁定 (2026-09-02, Issue #13 High対応): toStyleCode() は canonical との完全一致と
  // legacy な「厳密な全小文字」のみを正規化対象とし、全大文字・混在ケーシングは
  // "FR"(フリーリレー略称)との衝突を避けるため非対応(null)になった。
  // 以前はここで logMatchesStyle(..., "FR" ..., "Fr") が true になることを期待していたが、
  // 実際に legacy バグが書き込んだのは .toLowerCase() の結果である厳密な全小文字のみで
  // 全大文字の実データは存在しない。"FR" を自由形に正規化してしまう方が、
  // フリーリレー種目との衝突というバグを生むため、この新契約を固定する。
  it("[新契約] 全大文字(FR)はフリーリレー略称との衝突を避けるため正規化されず一致しない", () => {
    expect(logMatchesStyle(makeLog("log-2", { style: "FR" }), "Fr")).toBe(false);
  });

  it("ログ未登録(null)の行は種目を持たないため false", () => {
    expect(logMatchesStyle(null, "Fr")).toBe(false);
  });
});

describe("filterPracticeLogRows ([V-MP-05] グループ間AND / log 単位の絞り込み)", () => {
  it("place・style・tags すべて満たす行のみ返る", () => {
    const matching = makePractice({
      id: "p-match",
      place: "プールA",
      practice_logs: [makeLog("log-match", { style: "Fr", tagIds: ["tag-a"] })],
    });
    const wrongPlace = makePractice({
      id: "p-wrong-place",
      place: "プールB",
      practice_logs: [makeLog("log-wrong-place", { style: "Fr", tagIds: ["tag-a"] })],
    });
    const wrongStyle = makePractice({
      id: "p-wrong-style",
      place: "プールA",
      practice_logs: [makeLog("log-wrong-style", { style: "Br", tagIds: ["tag-a"] })],
    });

    const filters: PracticeFilterValues = {
      filterPlaces: ["プールA"],
      filterStyle: "Fr",
      selectedTagIds: ["tag-a"],
    };
    const result = filterPracticeLogRows(
      buildPracticeLogRows([matching, wrongPlace, wrongStyle]),
      filters,
    );

    expect(rowIds(result)).toEqual(["log-match"]);
  });

  it(
    "[log-level 化の要] 同じ練習の中でも、条件に合うログのカードだけが残る。" +
      "day-level 時代は条件に合うログが1件あれば同じ練習の全ログが表示されていた",
    () => {
      const practice = makePractice({
        id: "p-mixed",
        practice_logs: [
          makeLog("log-fr", { style: "Fr" }),
          makeLog("log-br", { style: "Br" }),
        ],
      });

      const result = filterPracticeLogRows(buildPracticeLogRows([practice]), {
        filterPlaces: [],
        filterStyle: "Br",
        selectedTagIds: [],
      });

      expect(rowIds(result)).toEqual(["log-br"]);
    },
  );

  it("タグも同様に、選択タグを全て持つログのカードだけが残る", () => {
    const practice = makePractice({
      id: "p-tags",
      practice_logs: [
        makeLog("log-a-only", { tagIds: ["tag-a"] }),
        makeLog("log-a-and-b", { tagIds: ["tag-a", "tag-b"] }),
      ],
    });

    const result = filterPracticeLogRows(buildPracticeLogRows([practice]), {
      filterPlaces: [],
      filterStyle: "",
      selectedTagIds: ["tag-a", "tag-b"],
    });

    expect(rowIds(result)).toEqual(["log-a-and-b"]);
  });

  it("全フィルタ未指定(空)の場合、全行を返す", () => {
    const rows = buildPracticeLogRows([
      makePractice({ id: "p1", practice_logs: [makeLog("l1"), makeLog("l2")] }),
      makePractice({ id: "p2", practice_logs: [makeLog("l3")] }),
    ]);
    const filters: PracticeFilterValues = { filterPlaces: [], filterStyle: "", selectedTagIds: [] };

    expect(filterPracticeLogRows(rows, filters)).toHaveLength(3);
  });
});

describe("countActivePracticeFilters", () => {
  it("全て未指定なら0", () => {
    expect(countActivePracticeFilters({ filterPlaces: [], filterStyle: "", selectedTagIds: [] })).toBe(0);
  });

  it("place/style/tags いずれか1件以上あればグループごとに1カウント", () => {
    expect(
      countActivePracticeFilters({ filterPlaces: ["プールA"], filterStyle: "Fr", selectedTagIds: ["tag-a"] }),
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
      makePractice({ id: "p1", practice_logs: [makeLog("l1", { style: "Br" })] }),
      makePractice({ id: "p2", practice_logs: [makeLog("l2", { style: "Fr" })] }),
    ];
    expect(getParticipatedPracticeStyleCodes(practices)).toEqual(["Fr", "Br"]);
  });
});

describe("sortPracticeLogRows ([V-MP-06] date/place の4プリセット)", () => {
  it("sortColumn=null の場合、渡された順序をそのまま維持する(既定=サーバー日付降順)", () => {
    const rows = buildPracticeLogRows([makePractice({ id: "p1" }), makePractice({ id: "p2" })]);
    expect(sortPracticeLogRows(rows, null, "desc")).toEqual(rows);
  });

  it("sortColumn='date', order='asc' は日付昇順", () => {
    const older = makePractice({ id: "older", date: "2026-01-01", practice_logs: [makeLog("l-older")] });
    const newer = makePractice({ id: "newer", date: "2026-02-01", practice_logs: [makeLog("l-newer")] });
    const result = sortPracticeLogRows(buildPracticeLogRows([newer, older]), "date", "asc");
    expect(rowIds(result)).toEqual(["l-older", "l-newer"]);
  });

  it("sortColumn='place', order='asc' は場所昇順(localeCompare)", () => {
    const a = makePractice({ id: "a", place: "Aプール", practice_logs: [makeLog("l-a")] });
    const b = makePractice({ id: "b", place: "Bプール", practice_logs: [makeLog("l-b")] });
    const result = sortPracticeLogRows(buildPracticeLogRows([b, a]), "place", "asc", "ja");
    expect(rowIds(result)).toEqual(["l-a", "l-b"]);
  });

  it("sortColumn='place', order='desc' は場所降順", () => {
    const a = makePractice({ id: "a", place: "Aプール", practice_logs: [makeLog("l-a")] });
    const b = makePractice({ id: "b", place: "Bプール", practice_logs: [makeLog("l-b")] });
    const result = sortPracticeLogRows(buildPracticeLogRows([a, b]), "place", "desc", "ja");
    expect(rowIds(result)).toEqual(["l-b", "l-a"]);
  });

  describe("[V-MP-07] 同一練習のログはソート後も隣接し、元のログ順を保つ(安定ソート)", () => {
    it("日付ソートしても、同じ練習の2ログはクエリ順のまま連続する", () => {
      const june = makePractice({
        id: "p-june",
        date: "2026-06-23",
        practice_logs: [makeLog("june-200im"), makeLog("june-50fly")],
      });
      const may = makePractice({
        id: "p-may",
        date: "2026-05-04",
        practice_logs: [makeLog("may-50fr")],
      });

      const result = sortPracticeLogRows(buildPracticeLogRows([june, may]), "date", "desc");

      expect(rowIds(result)).toEqual(["june-200im", "june-50fly", "may-50fr"]);
    });

    it("場所ソートでも同様に、同じ練習のログは元の順序で隣接する", () => {
      const poolB = makePractice({
        id: "p-b",
        place: "Bプール",
        practice_logs: [makeLog("b-1"), makeLog("b-2")],
      });
      const poolA = makePractice({
        id: "p-a",
        place: "Aプール",
        practice_logs: [makeLog("a-1"), makeLog("a-2")],
      });

      const result = sortPracticeLogRows(buildPracticeLogRows([poolB, poolA]), "place", "asc", "ja");

      expect(rowIds(result)).toEqual(["a-1", "a-2", "b-1", "b-2"]);
    });
  });

  describe("[V-SH-03 修正確認] place が未設定(null)の練習は asc/desc いずれでも末尾固定される", () => {
    it("昇順(asc)でも、place=null の行は末尾に固定される(空文字比較で先頭に来る退行をしない)", () => {
      const withPlace = makePractice({ id: "has", place: "Aプール", practice_logs: [makeLog("l-has")] });
      const withoutPlace = makePractice({ id: "none", place: null, practice_logs: [makeLog("l-none")] });
      const result = sortPracticeLogRows(
        buildPracticeLogRows([withoutPlace, withPlace]),
        "place",
        "asc",
        "ja",
      );
      expect(rowIds(result)).toEqual(["l-has", "l-none"]);
    });

    it("降順(desc)でも、place=null の行は末尾に固定される(sortOrder の符号反転で先頭に来ない)", () => {
      const withPlace = makePractice({ id: "has", place: "Aプール", practice_logs: [makeLog("l-has")] });
      const withoutPlace = makePractice({ id: "none", place: null, practice_logs: [makeLog("l-none")] });
      const result = sortPracticeLogRows(
        buildPracticeLogRows([withPlace, withoutPlace]),
        "place",
        "desc",
        "ja",
      );
      expect(rowIds(result)).toEqual(["l-has", "l-none"]);
    });

    it("複数の place=null 練習が混在しても、null 側だけが常に末尾に集まる(asc)", () => {
      const a = makePractice({ id: "a", place: "Aプール", practice_logs: [makeLog("l-a")] });
      const nullX = makePractice({ id: "null-x", place: null, practice_logs: [makeLog("l-null-x")] });
      const b = makePractice({ id: "b", place: "Bプール", practice_logs: [makeLog("l-b")] });
      const nullY = makePractice({ id: "null-y", place: null, practice_logs: [makeLog("l-null-y")] });

      const result = sortPracticeLogRows(
        buildPracticeLogRows([nullX, b, nullY, a]),
        "place",
        "asc",
        "ja",
      );

      expect(rowIds(result).slice(0, 2)).toEqual(["l-a", "l-b"]);
      expect(rowIds(result).slice(2)).toEqual(["l-null-x", "l-null-y"]);
    });
  });

  describe("[V-MP-06 修正確認] date のパース失敗(不正な日付文字列)も asc/desc いずれでも末尾固定される", () => {
    it("date が不正な文字列の練習は昇順でも末尾に固定される", () => {
      const validDate = makePractice({ id: "valid", date: "2026-01-01", practice_logs: [makeLog("l-valid")] });
      const invalidDate = makePractice({ id: "invalid", date: "not-a-date", practice_logs: [makeLog("l-invalid")] });
      const result = sortPracticeLogRows(buildPracticeLogRows([invalidDate, validDate]), "date", "asc");
      expect(rowIds(result)).toEqual(["l-valid", "l-invalid"]);
    });

    it("date が不正な文字列の練習は降順でも末尾に固定される", () => {
      const validDate = makePractice({ id: "valid", date: "2026-01-01", practice_logs: [makeLog("l-valid")] });
      const invalidDate = makePractice({ id: "invalid", date: "not-a-date", practice_logs: [makeLog("l-invalid")] });
      const result = sortPracticeLogRows(buildPracticeLogRows([validDate, invalidDate]), "date", "desc");
      expect(rowIds(result)).toEqual(["l-valid", "l-invalid"]);
    });
  });
});
