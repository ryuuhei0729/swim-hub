/**
 * practiceLogRows テスト
 *
 * 対象: `utils/practiceLogRows.ts` (練習一覧を「1 practice_log = 1カード」へ平坦化する
 * web/mobile 共通の純関数)
 *
 * 検証観点:
 *   [最重要] 1練習に複数ログがある場合に、ログの数だけ行が生成されること
 *            (2026-07-23〜07-28 の day-level 表示=1練習1カードの回帰防止)
 *   ログ0件の練習が一覧から消えないこと
 *   practice.id の重複が去重されること
 *   タグ判定が per-log の AND になっていること(day-level 時代の OR-exists の撤回確認)
 *
 * トートロジー防止メモ: 実装の走査手順をなぞらず、「ユーザーが一覧で何枚のカードを
 * 見るか」「どのカードが絞り込みで残るか」という観察可能な結果から逆算して書く。
 */

import { describe, expect, it } from "vitest";
import type { PracticeLogWithTags, PracticeWithLogs } from "../../types";
import { buildPracticeLogRows, logMatchesAllTags } from "../../utils/practiceLogRows";

function makeLog(id: string, tagIds: string[] = []): PracticeLogWithTags {
  return {
    id,
    user_id: "user-1",
    practice_id: "practice-1",
    style: "fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 60,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: tagIds.map((tagId) => ({
      practice_tag_id: tagId,
      practice_tags: {
        id: tagId,
        name: tagId,
        color: "#000000",
        user_id: "user-1",
        created_at: "",
        updated_at: "",
      },
    })),
  } as unknown as PracticeLogWithTags;
}

function makePractice(id: string, logs: PracticeLogWithTags[]): PracticeWithLogs {
  return {
    id,
    user_id: "user-1",
    date: "2026-06-23",
    title: "IM練習",
    place: "市民プール",
    note: null,
    team_id: null,
    created_at: "2026-06-23T00:00:00Z",
    updated_at: "2026-06-23T00:00:00Z",
    practice_logs: logs,
  } as unknown as PracticeWithLogs;
}

describe("buildPracticeLogRows", () => {
  it("[最重要] 1練習に2ログある場合、カード行は2件になる(1練習1カードへの退行防止)", () => {
    const practice = makePractice("p-im", [makeLog("log-200im"), makeLog("log-50fly")]);

    const rows = buildPracticeLogRows([practice]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.log?.id)).toEqual(["log-200im", "log-50fly"]);
  });

  it("どの行も同じ親 practice を指す(カードをタップすると同じ練習のモーダルが開く前提)", () => {
    const practice = makePractice("p-im", [makeLog("log-1"), makeLog("log-2")]);

    const rows = buildPracticeLogRows([practice]);

    expect(rows.every((row) => row.practice === practice)).toBe(true);
  });

  it("行のキーは practice_log.id(FlashList/React の key 重複を避けるため)", () => {
    const rows = buildPracticeLogRows([makePractice("p", [makeLog("log-a"), makeLog("log-b")])]);
    expect(rows.map((row) => row.id)).toEqual(["log-a", "log-b"]);
  });

  it("ログの並び順は practice_logs のクエリ順をそのまま維持する", () => {
    const rows = buildPracticeLogRows([
      makePractice("p", [makeLog("third"), makeLog("first"), makeLog("second")]),
    ]);
    expect(rows.map((row) => row.log?.id)).toEqual(["third", "first", "second"]);
  });

  it("ログ0件の練習も1行だけ残る(一覧から消えてしまう退行の防止)", () => {
    const rows = buildPracticeLogRows([makePractice("p-empty", [])]);

    expect(rows).toHaveLength(1);
    expect(rows[0].log).toBeNull();
    expect(rows[0].id).toBe("p-empty");
  });

  it("practice_logs が undefined でもクラッシュせず1行を返す", () => {
    const practice = { ...makePractice("p-undef", []), practice_logs: undefined } as unknown as PracticeWithLogs;

    expect(() => buildPracticeLogRows([practice])).not.toThrow();
    expect(buildPracticeLogRows([practice])).toHaveLength(1);
  });

  it("同じ practice.id が重複して渡されても2回展開しない(キャッシュ重複への防御)", () => {
    const practice = makePractice("p-dup", [makeLog("log-1"), makeLog("log-2")]);

    const rows = buildPracticeLogRows([practice, practice]);

    expect(rows).toHaveLength(2);
  });

  it("複数の練習は渡された練習順のまま、それぞれのログが連続して並ぶ", () => {
    const rows = buildPracticeLogRows([
      makePractice("p1", [makeLog("p1-a"), makeLog("p1-b")]),
      makePractice("p2", [makeLog("p2-a")]),
    ]);

    expect(rows.map((row) => row.log?.id)).toEqual(["p1-a", "p1-b", "p2-a"]);
  });

  it("空配列は空配列", () => {
    expect(buildPracticeLogRows([])).toEqual([]);
  });
});

describe("logMatchesAllTags (per-log AND)", () => {
  it("選択タグ0件は常に一致(未フィルタ扱い)", () => {
    expect(logMatchesAllTags(makeLog("log-1"), [])).toBe(true);
    expect(logMatchesAllTags(null, [])).toBe(true);
  });

  it("そのログが選択タグを全て持てば一致", () => {
    expect(logMatchesAllTags(makeLog("log-1", ["tag-a", "tag-b", "tag-c"]), ["tag-a", "tag-b"])).toBe(
      true,
    );
  });

  it("選択タグの一部しか持たないログは不一致(AND)", () => {
    expect(logMatchesAllTags(makeLog("log-1", ["tag-a"]), ["tag-a", "tag-b"])).toBe(false);
  });

  it(
    "[log-level 化の要] 兄弟ログがタグを持っていても、自分が持たなければ不一致。" +
      "day-level 時代の OR-exists ではタグを持たないログのカードまで表示されてしまっていた",
    () => {
      const tagged = makeLog("log-tagged", ["tag-a"]);
      const untagged = makeLog("log-untagged", []);

      expect(logMatchesAllTags(tagged, ["tag-a"])).toBe(true);
      expect(logMatchesAllTags(untagged, ["tag-a"])).toBe(false);
    },
  );

  it("ログ未登録(null)の行は、タグが1件でも選択されていれば不一致", () => {
    expect(logMatchesAllTags(null, ["tag-a"])).toBe(false);
  });

  it("practice_log_tags が undefined でもクラッシュしない", () => {
    const log = { ...makeLog("log-1"), practice_log_tags: undefined } as unknown as PracticeLogWithTags;
    expect(() => logMatchesAllTags(log, ["tag-a"])).not.toThrow();
    expect(logMatchesAllTags(log, ["tag-a"])).toBe(false);
  });

  it("タグIDは JOIN 先の practice_tags.id ではなく FK生カラム practice_tag_id を見る", () => {
    // JOIN が欠落(practice_tags=null)していても practice_tag_id だけで判定できること
    const log = {
      ...makeLog("log-1"),
      practice_log_tags: [{ practice_tag_id: "tag-a", practice_tags: null }],
    } as unknown as PracticeLogWithTags;

    expect(logMatchesAllTags(log, ["tag-a"])).toBe(true);
  });
});
