// =============================================================================
// teamRecordBulk.multiGroupInput.test.tsx
// [新機能] 同一種目の複数本入力 (「組」) — 2階層化で落ちていた能力の復旧
// (QA Sprint Contract Phase B / 修正ラウンド 2026-09-17)
// =============================================================================
//
// 旧画面 (TeamRecordBulkFormScreen, 削除済み) は同じ種目のカードを複数作れた。
// 新画面は `entries: StyleEntry[]` + `activeGroupIndex` (「組」タブ) で復旧する。
// `saveStyleRecords` / `scopeExistingRecordIdsForEntries` を実物 import して
// 直接呼び出す (screen は render しない)。
//
// 検証観点:
//   - 同じ種目に2組作れる (2件とも保存される。1件に潰れない)
//   - 同じ人を同じ種目に2回置ける (MemberRecord.id で区別、memberUserId の
//     重複では弾かれない)
//   - 1組だけ保存しても他組が消えない (削除スコープは保存対象の組に含まれる
//     records.id のみ)
//   - 未入力の追加組 (「+」で足したが何も入力していないリレー組) は
//     バリデーション対象から除外され、保存をブロックしない
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  saveStyleRecords,
  scopeExistingRecordIdsForEntries,
} from "../teamRecordBulk/saveStyleRecords";
import type { ExistingRecord, StyleEntry, StyleLookup } from "../teamRecordBulk/buildStyleEntries";
import { buildRecordSaveSupabaseMock, type RecordSaveSupabaseMock } from "./supabaseRecordSaveMock";

const STYLES: StyleLookup[] = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

let fake: RecordSaveSupabaseMock;

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
});

function memberRecord(overrides: Partial<StyleEntry["memberRecords"][number]>) {
  return {
    id: "mr-placeholder",
    memberUserId: "user-1",
    memberName: "選手A",
    time: 0,
    timeDisplayValue: "",
    reactionTime: "",
    isRelaying: false,
    note: "",
    splitTimes: [],
    ...overrides,
  };
}

describe("[新機能] 同じ種目に2組作れる", () => {
  it("同じ styleId の2つの entries を渡すと、両方が別々の records として保存される (1件に潰れない)", async () => {
    const group1: StyleEntry = {
      id: "entry-group-1",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [memberRecord({ id: "genid-1", memberUserId: "user-1", time: 30.1 })],
    };
    const group2: StyleEntry = {
      id: "entry-group-2",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [memberRecord({ id: "genid-2", memberUserId: "user-2", time: 31.5 })],
    };

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [group1, group2],
      existingRecordIds: new Set(),
      existingRelayRecordIds: new Set(),
      memberGenderByUserId: new Map(),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    const inserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(inserts).toHaveLength(2);
    const insertedUserIds = inserts
      .map((c) => (c.payload as { user_id: string }).user_id)
      .sort();
    expect(insertedUserIds).toEqual(["user-1", "user-2"]);
  });
});

describe("[新機能] 同じ人を同じ種目に2回置ける", () => {
  it("同一 memberUserId を持つ2つの MemberRecord (id が異なる) は、両方とも保存される (重複としてマージ・拒否されない)", async () => {
    const group1: StyleEntry = {
      id: "entry-group-1",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [memberRecord({ id: "genid-1", memberUserId: "user-1", time: 30.1 })],
    };
    const group2: StyleEntry = {
      id: "entry-group-2",
      styleId: 2,
      styleName: "自由形50m",
      // 同じ選手 (user-1) が2組目にも登場する (タイムトライアル的に2本目を泳いだ想定)
      memberRecords: [memberRecord({ id: "genid-2", memberUserId: "user-1", time: 29.8 })],
    };

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [group1, group2],
      existingRecordIds: new Set(),
      existingRelayRecordIds: new Set(),
      memberGenderByUserId: new Map(),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    const inserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(inserts).toHaveLength(2);
    const times = inserts.map((c) => (c.payload as { time: number }).time).sort();
    expect(times).toEqual([29.8, 30.1]);
  });
});

describe("[新機能] 1組だけ保存しても他組が消えない", () => {
  const existingRecords: ExistingRecord[] = [
    {
      id: "record-group-1",
      user_id: "user-1",
      style_id: 2,
      time: 30.5,
      is_relaying: false,
      note: null,
      split_times: [],
      users: { id: "user-1", name: "選手A" },
    },
    {
      id: "record-group-2",
      user_id: "user-2",
      style_id: 2,
      time: 31.5,
      is_relaying: false,
      note: null,
      split_times: [],
      users: { id: "user-2", name: "選手B" },
    },
  ];

  it("2組のうち1組だけを保存対象の entries に含めると、削除スコープにはその組の records.id しか入らない (もう一方の組の records.id は既存 records.id 集合に含まれないので削除候補にならない)", async () => {
    const group1: StyleEntry = {
      id: "entry-group-1",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [memberRecord({ id: "record-group-1", memberUserId: "user-1", time: 30.5 })],
    };

    // scopeExistingRecordIdsForEntries は「渡した entries に属する records.id」しか
    // 拾わない。ここでは group1 だけを渡すので、group2 の records.id
    // (record-group-2) はスコープに入らない。
    const existingRecordIds = scopeExistingRecordIdsForEntries(existingRecords, [group1]);
    expect(existingRecordIds.has("record-group-1")).toBe(true);
    expect(existingRecordIds.has("record-group-2")).toBe(false);

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [group1],
      existingRecordIds,
      existingRelayRecordIds: new Set(),
      memberGenderByUserId: new Map(),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    // group1 は UPDATE され、group2 (record-group-2) は一切触れられない
    const updates = fake.updateCalls.filter((c) => c.table === "records");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.eq).toEqual([{ column: "id", value: "record-group-1" }]);

    const touchedIds = [
      ...fake.eqCalls.filter((c) => c.table === "records").map((c) => c.value),
      ...fake.inCalls.filter((c) => c.table === "records").flatMap((c) => c.values),
    ];
    expect(touchedIds).not.toContain("record-group-2");
    expect(fake.deleteCalls.filter((c) => c.table === "records")).toHaveLength(0);
  });
});

describe("[新機能] 未入力の追加組はバリデーションをブロックしない", () => {
  const relayLegUserIds = ["user-lead", "user-second", "user-third", "user-anchor"];

  function filledRelayGroup(id: string): StyleEntry {
    return {
      id,
      styleId: 2,
      styleName: "4x50mフリーリレー",
      relayEventId: "relay_4x50_free",
      memberRecords: relayLegUserIds.map((userId, idx) =>
        memberRecord({
          id: `${id}-leg-${idx}`,
          memberUserId: userId,
          time: 27 + idx,
          isRelaying: idx !== 0,
          cumulativeTimeSeconds: (idx + 1) * 27,
        }),
      ),
    };
  }

  function untouchedRelayGroup(id: string): StyleEntry {
    return {
      id,
      styleId: 2,
      styleName: "4x50mフリーリレー",
      relayEventId: "relay_4x50_free",
      // 「+」で追加したが泳者未選択・タイム未入力のまま (isUntouchedRelayGroup)
      memberRecords: relayLegUserIds.map((_userId, idx) =>
        memberRecord({ id: `${id}-leg-${idx}`, memberUserId: "", time: 0 }),
      ),
    };
  }

  it("1本目 (入力済み) と2本目 (未入力の追加組) を同時に保存すると、1本目だけが保存され2本目のバリデーションは発火しない", async () => {
    const group1 = filledRelayGroup("entry-relay-1");
    const group2 = untouchedRelayGroup("entry-relay-2");

    const result = await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [group1, group2],
      existingRecordIds: new Set(),
      existingRelayRecordIds: new Set(),
      memberGenderByUserId: new Map(relayLegUserIds.map((id) => [id, 0])),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    // relayFullTeam / relayAllTimes のバリデーションエラーが投げられずに完了する
    expect(result.hasError).toBe(false);

    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(4); // group1 の4レグのみ

    const relayInserts = fake.insertCalls.filter((c) => c.table === "relay_records");
    expect(relayInserts).toHaveLength(1); // group2 分は書かれない
  });
});
