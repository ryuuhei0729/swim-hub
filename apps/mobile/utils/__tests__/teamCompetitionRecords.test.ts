/**
 * teamCompetitionRecords.ts の純関数テスト
 *
 * Sprint Contract 検証観点:
 * [V-13] 種目 (style_id) でグルーピングし、name_jp の localeCompare 順に並べる。
 *        各種目内は個人記録 (is_relaying===false) と リレー記録 (is_relaying===true) を
 *        それぞれ独立して time 昇順 (速い順) に並べる。
 *
 * 【2026-09-21 App Dev 修正】未使用だった `RankedRecordEntry.rank` は廃止され、
 * `groupRecordsByStyle` は `RecordEntry[]` (rank 無し) を返すようになった。
 * SC5 で維持されている「速い順に並ぶ」という仕様自体は不変なので、旧来の `.rank`
 * アサーションは**削除するだけでなく、配列の並び順 (id 順・time 昇順) を直接検証する
 * 形に置き換える** (rank を消しただけでは並び順の退行を検出できなくなるため。PM 修正依頼)。
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
  getRecordUserAvatarPath,
  getRelayLegRecordIds,
  excludeGroupedRelayRecords,
  toRelayTeamRow,
  groupRelayRecordsByEvent,
  type RecordEntry,
  type StyleInfo,
} from "../teamCompetitionRecords";
import type { RelayRecordWithLegs } from "@apps/shared/types/relayRecord";

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
    pool_type: 0,
    note: null,
    users: { name: "選手", profile_image_path: null },
    styles: STYLE_FREE,
    split_times: [],
    ...overrides,
  };
}

describe("groupRecordsByStyle", () => {
  it("[V-13/SC5] 個人記録とリレー記録がそれぞれ独立に time 昇順 (速い順) に並ぶ (rank 廃止後も並び順は退行しない)", () => {
    const records: RecordEntry[] = [
      // 意図的に time 降順で渡す (入力順を信用せず、出力が time でソートされることを検証する)
      makeRecord({ id: "ind-slow", user_id: "佐藤", time: 32.22, is_relaying: false }),
      makeRecord({ id: "ind-fast", user_id: "田中", time: 30.11, is_relaying: false }),
      makeRecord({ id: "relay-slow", user_id: "高橋", time: 42.44, is_relaying: true }),
      makeRecord({ id: "relay-fast", user_id: "鈴木", time: 40.33, is_relaying: true }),
    ];

    const groups = groupRecordsByStyle(records);
    expect(groups).toHaveLength(1);
    const group = groups[0]!; // 直前の toHaveLength(1) で存在は保証済み

    // id 順と time 昇順の両方を検証する (rank フィールドが無くなったため、並び順自体を直接見る)
    expect(group.individual.map((r) => r.id)).toEqual(["ind-fast", "ind-slow"]);
    expect(group.individual.map((r) => r.time)).toEqual([30.11, 32.22]);

    // リレーは個人記録と完全に独立した並び順を持つ (individual の続きに連結されない)
    expect(group.relay.map((r) => r.id)).toEqual(["relay-fast", "relay-slow"]);
    expect(group.relay.map((r) => r.time)).toEqual([40.33, 42.44]);
  });

  it("[V-13] 0件・1件の境界: 1件だけの記録でも individual に含まれ、relay は空になる", () => {
    const records: RecordEntry[] = [makeRecord({ id: "solo", time: 25, is_relaying: false })];
    const group = groupRecordsByStyle(records)[0]!; // records は要素1件なので必ず1グループが返る設計
    expect(group.individual.map((r) => r.id)).toEqual(["solo"]);
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
    expect(
      getRecordUserName([{ name: "山田太郎", profile_image_path: null }], "不明"),
    ).toBe("山田太郎");
  });

  it("users が配列だが name が空文字のとき unknownLabel にフォールバックする", () => {
    expect(getRecordUserName([{ name: "", profile_image_path: null }], "不明")).toBe("不明");
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

describe("getRecordUserAvatarPath", () => {
  it("users が null のとき null を返す", () => {
    expect(getRecordUserAvatarPath(null)).toBeNull();
  });

  it("users がオブジェクトのとき profile_image_path を返す", () => {
    expect(
      getRecordUserAvatarPath({ name: "選手", profile_image_path: "path/a.png" }),
    ).toBe("path/a.png");
  });

  it("users が配列のとき先頭要素の profile_image_path を返す", () => {
    expect(
      getRecordUserAvatarPath([{ name: "選手", profile_image_path: "path/b.png" }]),
    ).toBe("path/b.png");
  });

  it("profile_image_path が undefined のとき null にフォールバックする (?? の挙動確認)", () => {
    expect(
      getRecordUserAvatarPath({ name: "選手", profile_image_path: undefined as unknown as null }),
    ).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// relay_records 由来の純関数群 (getRelayLegRecordIds / excludeGroupedRelayRecords /
// toRelayTeamRow / groupRelayRecordsByEvent)
// -----------------------------------------------------------------------------

const RELAY_STYLE = { id: 30, name_jp: "自由形", name: "Fr", style: "Fr", distance: 50 };

function makeLeg(overrides: Partial<RelayRecordWithLegs["legs"][number]> = {}) {
  return {
    id: "leg-default",
    legIndex: 0,
    userId: "member-default",
    styleId: RELAY_STYLE.id,
    legTime: 30.0,
    reactionTime: null,
    recordId: "rec-leg-default",
    userName: "泳者",
    profileImagePath: null,
    styleNameJp: RELAY_STYLE.name_jp,
    styleDistance: RELAY_STYLE.distance,
    ...overrides,
  };
}

function makeRelayRecord(overrides: Partial<RelayRecordWithLegs> = {}): RelayRecordWithLegs {
  return {
    id: "relay-default",
    teamId: "team-default",
    competitionId: "comp-default",
    relayKind: "free",
    legDistance: 50,
    legCount: 4,
    poolType: 0,
    genderCategory: "mixed",
    totalTime: 120.0,
    createdAt: null,
    legs: [
      makeLeg({ id: "leg-0", legIndex: 0, recordId: "rec-leg0" }),
      makeLeg({ id: "leg-1", legIndex: 1, recordId: "rec-leg1" }),
      makeLeg({ id: "leg-2", legIndex: 2, recordId: "rec-leg2" }),
      makeLeg({ id: "leg-3", legIndex: 3, recordId: "rec-leg3" }),
    ],
    ...overrides,
  };
}

describe("getRelayLegRecordIds", () => {
  it("複数 relay_records の全レグの recordId を is_relaying の値によらず集合にする", () => {
    const ids = getRelayLegRecordIds([makeRelayRecord()]);
    expect(ids).toEqual(new Set(["rec-leg0", "rec-leg1", "rec-leg2", "rec-leg3"]));
  });

  it("recordId が null のレグは無視する (退会 / records 行削除済み)", () => {
    const relay = makeRelayRecord({
      legs: [makeLeg({ id: "leg-0", legIndex: 0, recordId: null, userId: null })],
    });
    expect(getRelayLegRecordIds([relay])).toEqual(new Set());
  });

  it("relay_records が空配列のとき空集合を返す", () => {
    expect(getRelayLegRecordIds([])).toEqual(new Set());
  });
});

describe("excludeGroupedRelayRecords", () => {
  it("groupedRecordIds に含まれる record を除外する", () => {
    const records = [
      { id: "rec-keep" } as RecordEntry,
      { id: "rec-leg0" } as RecordEntry,
    ];
    const result = excludeGroupedRelayRecords(records, new Set(["rec-leg0"]));
    expect(result.map((r) => r.id)).toEqual(["rec-keep"]);
  });

  it("groupedRecordIds が空集合のとき、元の配列をそのまま返す (バックフィル未実行時に何も消さない)", () => {
    const records = [{ id: "rec-a" } as RecordEntry, { id: "rec-b" } as RecordEntry];
    const result = excludeGroupedRelayRecords(records, new Set());
    expect(result).toEqual(records);
  });
});

describe("toRelayTeamRow", () => {
  it("RelayRecordWithLegs の表示に必要なフィールド (legCount 含む) をチーム単位でそのまま保持する", () => {
    const relay = makeRelayRecord({ id: "relay-1", teamId: "team-x", legCount: 3 });
    const row = toRelayTeamRow(relay);
    expect(row.relayRecordId).toBe("relay-1");
    // legCount はチーム固有の値であり、グループ単位に丸められない
    expect(row.legCount).toBe(3);
    expect(row.legs.map((leg) => leg.legIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe("groupRelayRecordsByEvent", () => {
  it("relayKind + legDistance が同じチームを1グループにまとめ、totalTime昇順で並べる", () => {
    const groups = groupRelayRecordsByEvent([
      makeRelayRecord({ id: "relay-slow", teamId: "team-slow", totalTime: 130.0 }),
      makeRelayRecord({ id: "relay-fast", teamId: "team-fast", totalTime: 120.0 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.teams.map((t) => t.relayRecordId)).toEqual(["relay-fast", "relay-slow"]);
  });

  it("legCount が異なるチームが同一 relayKind+legDistance に混在しても、各チームは自分の legCount をそのまま保持する (確定バグ1の前提条件を切り分ける)", () => {
    // 【確定バグ1の所在について・修正済み】このテストが検証するのは「純関数がデータを
    // 壊していないか」であり、修正前から green だった (純関数自体は壊れていなかった)。
    // バグの実体は呼び出し元 (TeamCompetitionRecordsModal.tsx) が、チームごとに
    // 正しく保持されているこの `team.legCount` を使わず、グループ挿入時に固定される
    // `group.legCount` をイベントラベルに使っていたこと。`RelayEventGroup` から
    // `legCount` フィールド自体が削除され、呼び出し元が `team.legCount` を読むよう
    // 修正済み (コンポーネントレベルの回帰防止テストは
    // TeamCompetitionRecordsModal.relaySprint.test.tsx の「[確定バグ1]」が担う)。
    const teamA = makeRelayRecord({ id: "relay-team-a", teamId: "team-a", legCount: 4 });
    const teamB = makeRelayRecord({
      id: "relay-team-b",
      teamId: "team-b",
      legCount: 3,
      legs: [
        makeLeg({ id: "legb-0", legIndex: 0, recordId: "rec-legb0" }),
        makeLeg({ id: "legb-1", legIndex: 1, recordId: "rec-legb1" }),
        makeLeg({ id: "legb-2", legIndex: 2, recordId: "rec-legb2" }),
      ],
    });

    const groups = groupRelayRecordsByEvent([teamA, teamB]);
    expect(groups).toHaveLength(1);

    const rowA = groups[0]!.teams.find((t) => t.relayRecordId === "relay-team-a")!;
    const rowB = groups[0]!.teams.find((t) => t.relayRecordId === "relay-team-b")!;
    expect(rowA.legCount).toBe(4);
    expect(rowB.legCount).toBe(3);
  });

  it("relayKind または legDistance が異なれば別グループになる", () => {
    const groups = groupRelayRecordsByEvent([
      makeRelayRecord({ id: "relay-free-50", relayKind: "free", legDistance: 50 }),
      makeRelayRecord({ id: "relay-medley-50", relayKind: "medley", legDistance: 50 }),
      makeRelayRecord({ id: "relay-free-100", relayKind: "free", legDistance: 100 }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("relay_records が空配列のとき空配列を返す", () => {
    expect(groupRelayRecordsByEvent([])).toEqual([]);
  });
});
