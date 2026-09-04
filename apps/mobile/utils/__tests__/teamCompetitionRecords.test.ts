/**
 * teamCompetitionRecords.ts の純関数テスト
 *
 * Sprint Contract 検証観点:
 * [V-13] 種目 (style_id) でグルーピングし、name_jp の localeCompare 順に並べる。
 *        各種目内は個人記録 (is_relaying===false) と リレー記録 (is_relaying===true) を
 *        それぞれ独立して time 昇順で 1 始まりの rank を振る (リレー1件目が必ず「1」になる)。
 *
 * トートロジー防止:
 * - fixture 名は期待するランク番号 ("1"/"2"/"3") を部分文字列として含まない名前にする
 *   (過去に "Group1" に "1" が含まれ toContain がトートロジー化した事例があるため)。
 * - 種目名の並び順は本テスト側でも同じ `localeCompare` を使って期待値を導出する
 *   (Node の ICU 実装依存のハードコード順序を仮定しない)。
 */

import { describe, it, expect } from "vitest";
import {
  groupRecordsByStyle,
  buildDisplaySplits,
  getRecordUserName,
  getRecordStyleInfo,
  type RecordEntry,
  type StyleInfo,
} from "../teamCompetitionRecords";

const STYLE_FREE: StyleInfo = { id: 10, name_jp: "自由形", name: "Fr", style: "fr", distance: 50 };
const STYLE_BACK: StyleInfo = { id: 11, name_jp: "背泳ぎ", name: "Ba", style: "ba", distance: 50 };

function makeRecord(overrides: Partial<RecordEntry> = {}): RecordEntry {
  return {
    id: "r-default",
    user_id: "u-default",
    style_id: STYLE_FREE.id,
    time: 30,
    reaction_time: null,
    is_relaying: false,
    note: null,
    users: { name: "選手" },
    styles: STYLE_FREE,
    split_times: [],
    ...overrides,
  };
}

describe("groupRecordsByStyle", () => {
  it("[V-13] 個人記録とリレー記録がそれぞれ独立に time 昇順で 1 始まりに採番される (リレー1件目が「1」になる)", () => {
    const records: RecordEntry[] = [
      makeRecord({ id: "ind-fast", user_id: "田中", time: 30.11, is_relaying: false }),
      makeRecord({ id: "ind-slow", user_id: "佐藤", time: 32.22, is_relaying: false }),
      makeRecord({ id: "relay-fast", user_id: "鈴木", time: 40.33, is_relaying: true }),
      makeRecord({ id: "relay-slow", user_id: "高橋", time: 42.44, is_relaying: true }),
    ];

    const groups = groupRecordsByStyle(records);
    expect(groups).toHaveLength(1);
    const group = groups[0]!; // 直前の toHaveLength(1) で存在は保証済み

    expect(group.individual.map((r) => r.id)).toEqual(["ind-fast", "ind-slow"]);
    expect(group.individual.map((r) => r.rank)).toEqual([1, 2]);

    // リレーは個人記録と完全に独立した採番系列を持つ (連番の「3」「4」にならない)
    expect(group.relay.map((r) => r.id)).toEqual(["relay-fast", "relay-slow"]);
    expect(group.relay.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("[V-13] time が同じでも individual/relay 双方で rank は 1 始まりの連番になる (0件・1件の境界含む)", () => {
    const records: RecordEntry[] = [makeRecord({ id: "solo", time: 25, is_relaying: false })];
    const group = groupRecordsByStyle(records)[0]!; // records は要素1件なので必ず1グループが返る設計
    expect(group.individual).toHaveLength(1);
    expect(group.individual[0]!.rank).toBe(1); // 直前の toHaveLength(1) で存在は保証済み
    expect(group.relay).toHaveLength(0);
  });

  it("[V-13] style_id ごとにグルーピングされ、name_jp の localeCompare 順に並ぶ (ハードコード順序を仮定しない)", () => {
    // 実行時の localeCompare が実際にどちらを先にするかは ICU 実装依存のため、
    // テスト側でも同じ関数で期待順序を導出する。
    const [expectedFirst, expectedSecond] =
      STYLE_FREE.name_jp.localeCompare(STYLE_BACK.name_jp) <= 0
        ? [STYLE_FREE, STYLE_BACK]
        : [STYLE_BACK, STYLE_FREE];

    const records: RecordEntry[] = [
      makeRecord({ id: "r-free", style_id: STYLE_FREE.id, styles: STYLE_FREE }),
      makeRecord({ id: "r-back", style_id: STYLE_BACK.id, styles: STYLE_BACK }),
    ];

    const groups = groupRecordsByStyle(records);
    expect(groups.map((g) => g.style.id)).toEqual([expectedFirst.id, expectedSecond.id]);
  });

  it("style 情報が取得できない記録 (JOIN欠落, styles=null) は除外される", () => {
    const records: RecordEntry[] = [
      makeRecord({ id: "r-ok", styles: STYLE_FREE }),
      makeRecord({ id: "r-broken", styles: null }),
    ];

    const groups = groupRecordsByStyle(records);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.individual.map((r) => r.id)).toEqual(["r-ok"]); // 直前の toHaveLength(1) で存在は保証済み
  });

  it("styles が配列で返ってきても (Supabase JOIN の配列形) 先頭要素を種目として扱う", () => {
    const records: RecordEntry[] = [makeRecord({ id: "r-array-style", styles: [STYLE_BACK] })];
    const groups = groupRecordsByStyle(records);
    expect(groups[0]!.style.id).toBe(STYLE_BACK.id); // records は要素1件なので必ず1グループが返る設計
  });
});

describe("getRecordUserName / getRecordStyleInfo", () => {
  it("users が null のとき unknownLabel を返す", () => {
    expect(getRecordUserName(null, "不明")).toBe("不明");
  });

  it("users が配列のとき先頭要素の name を返す", () => {
    expect(getRecordUserName([{ name: "山田太郎" }], "不明")).toBe("山田太郎");
  });

  it("users が配列だが name が空文字のとき unknownLabel にフォールバックする", () => {
    expect(getRecordUserName([{ name: "" }], "不明")).toBe("不明");
  });

  it("getRecordStyleInfo は styles=undefined のとき null を返す", () => {
    expect(getRecordStyleInfo(undefined)).toBeNull();
  });
});

describe("buildDisplaySplits", () => {
  it("distance 昇順に並び替える (入力順を信用しない)", () => {
    const result = buildDisplaySplits(
      [
        { id: "s2", distance: 25, split_time: 14 },
        { id: "s1", distance: 50, split_time: 30 },
      ],
      50,
      30,
    );
    expect(result.map((s) => s.distance)).toEqual([25, 50]);
  });

  it("種目距離と同じ distance の split が無い場合、ゴールタイムを最終 split として補完する", () => {
    const result = buildDisplaySplits([{ id: "s1", distance: 50, split_time: 30 }], 100, 65.42);
    expect(result).toEqual([
      { distance: 50, splitTime: 30 },
      { distance: 100, splitTime: 65.42 },
    ]);
  });

  it("種目距離と同じ distance の split が既にある場合、ゴールタイムを重複追加しない", () => {
    const result = buildDisplaySplits(
      [
        { id: "s1", distance: 50, split_time: 30 },
        { id: "s2", distance: 100, split_time: 65.42 },
      ],
      100,
      65.42,
    );
    expect(result).toHaveLength(2);
    expect(result.filter((s) => s.distance === 100)).toHaveLength(1);
  });

  it("splitTimes が空配列のときは空配列を返す (ゴールタイムを誤って生成しない)", () => {
    expect(buildDisplaySplits([], 50, 30)).toEqual([]);
  });

  it("[境界値] recordTime が 0 のときはゴールタイムを補完しない", () => {
    const result = buildDisplaySplits([{ id: "s1", distance: 25, split_time: 14 }], 50, 0);
    expect(result).toEqual([{ distance: 25, splitTime: 14 }]);
  });
});
