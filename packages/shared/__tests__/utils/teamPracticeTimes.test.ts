import { describe, it, expect } from "vitest";
import {
  buildPracticeMenuGroups,
  buildMemberTimesRow,
  type PracticeLogEntry,
} from "../../utils/teamPracticeTimes";

let seq = 0;
function makeLog(overrides: Partial<PracticeLogEntry> & { times?: Array<[number, number, number]> } = {}) {
  seq += 1;
  const { times = [], ...rest } = overrides;
  const log: PracticeLogEntry = {
    id: `log-${seq}`,
    user_id: `user-${seq}`,
    style: "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 90,
    note: null,
    practice_times: times.map(([set, rep, time], i) => ({
      id: `t-${seq}-${i}`,
      set_number: set,
      rep_number: rep,
      time,
      user_id: rest.user_id ?? `user-${seq}`,
    })),
    practice_log_tags: [],
    users: { name: `メンバー${seq}`, profile_image_path: null },
    ...rest,
  };
  return log;
}

describe("buildPracticeMenuGroups", () => {
  it("同じメニュー (泳法・距離・本数・セット・サークル・種別) を 1 つにまとめ、泳法の大文字小文字の違いは同じとみなす", () => {
    const groups = buildPracticeMenuGroups(
      [
        makeLog({ style: "Fr", times: [[1, 1, 65]] }),
        makeLog({ style: "fr", times: [[1, 1, 66]] }),
        makeLog({ style: "Fr", swim_category: "Kick", times: [[1, 1, 80]] }),
        makeLog({ style: "Fr", circle: 100, times: [[1, 1, 67]] }),
      ],
      "不明",
    );
    expect(groups.map((g) => g.members.length)).toEqual([2, 1, 1]);
    expect(groups[1]!.swimCategory).toBe("Kick");
    expect(groups[2]!.circle).toBe(100);
  });

  it("メニューの中は平均の速い順で、タイムが 1 本も無い人は最後に回る", () => {
    const slow = makeLog({ users: { name: "遅い", profile_image_path: null }, times: [[1, 1, 70], [1, 2, 72]] });
    const none = makeLog({ users: { name: "なし", profile_image_path: null }, times: [] });
    const fast = makeLog({ users: { name: "速い", profile_image_path: null }, times: [[1, 1, 64], [1, 2, 66]] });
    const [group] = buildPracticeMenuGroups([slow, none, fast], "不明");
    expect(group!.members.map((m) => m.name)).toEqual(["速い", "遅い", "なし"]);
    expect(group!.members[2]!.average).toBeNull();
  });

  it("タグは最初に現れたログのものを使い、見えないタグ (null) は除く", () => {
    const [group] = buildPracticeMenuGroups(
      [
        makeLog({
          practice_log_tags: [
            { practice_tag_id: "a", practice_tags: { id: "a", name: "メイン", color: "#FDE68A" } as never },
            { practice_tag_id: "b", practice_tags: null },
          ],
        }),
      ],
      "不明",
    );
    expect(group!.tags.map((t) => t.name)).toEqual(["メイン"]);
  });
});

describe("buildMemberTimesRow", () => {
  it("セットごとに 1 本目から順に並べ、未入力と 0 秒は null にする", () => {
    const row = buildMemberTimesRow(
      makeLog({
        rep_count: 3,
        set_count: 2,
        times: [
          [1, 1, 60],
          [1, 3, 62],
          [2, 2, 0],
          [2, 1, 61],
        ],
      }),
      "不明",
    );
    expect(row.sets).toEqual([
      { setNumber: 1, times: [60, null, 62], average: 61 },
      { setNumber: 2, times: [61, null, null], average: 61 },
    ]);
    expect(row.recordedCount).toBe(3);
    expect(row.totalCount).toBe(6);
    expect(row.fastest).toBe(60);
    expect(row.average).toBe(61);
  });

  it("本数・セット数の範囲外のタイムは平均・最速に入れない (表示と数字を揃える)", () => {
    const row = buildMemberTimesRow(
      makeLog({ rep_count: 2, set_count: 1, times: [[1, 1, 60], [1, 2, 62], [1, 3, 50], [2, 1, 50]] }),
      "不明",
    );
    expect(row.fastest).toBe(60);
    expect(row.average).toBe(61);
    expect(row.recordedCount).toBe(2);
  });

  it("users が配列でも名前と画像を取り出し、無ければ代わりの名前を使う", () => {
    expect(
      buildMemberTimesRow(makeLog({ users: [{ name: "配列", profile_image_path: "a/b.png" }] }), "不明"),
    ).toMatchObject({ name: "配列", avatarPath: "a/b.png" });
    expect(buildMemberTimesRow(makeLog({ users: null }), "不明")).toMatchObject({
      name: "不明",
      avatarPath: null,
    });
  });
});
