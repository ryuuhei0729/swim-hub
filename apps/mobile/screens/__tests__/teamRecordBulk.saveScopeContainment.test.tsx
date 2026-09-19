// =============================================================================
// teamRecordBulk.saveScopeContainment.test.tsx
// Sprint Contract Phase A スケルトン — チーム記録代理入力の2階層化 + upsert化
// =============================================================================
//
// [V-01] 種目詳細画面 (1種目 or 1リレー種目) を保存したとき、
//        大会内の**他種目の `records` 行の `id` と `updated_at` が不変**であること。
//
// `saveStyleRecords` / `scopeExistingRecordIdsForEntries` / `TeamRelayRecordsAPI` を
// 実物 import して直接呼び出す。screen は render しない
// (他種目の state が画面内に無いことしか証明できない render ベースのテストでは、
//  「サーバーへの絞り込み」を直接検証できないため)。
//
// モックは `.eq()` / `.in()` の列名・値を捨てずに記録する
// (`apps/mobile/screens/__tests__/supabaseRecordSaveMock.ts`)。
//
// 【修正ラウンド 2026-09-17】
//   - `scopeExistingRecordIdsForEntry` (単数) → `scopeExistingRecordIdsForEntries`
//     (複数形) にリネーム。screen state が `entry` → `entries: StyleEntry[]` に
//     変わったのに伴う (「組」入力の復旧)。1本の組でも `[entry]` で包んで渡す。
//   - `saveStyleRecords` の `entry` パラメータは `entries: StyleEntry[]` になり、
//     新たに `existingRelayRecordIds: ReadonlySet<string>` が必須になった
//     (Critical #1: relay_records の削除スコープが DB 列条件から画面が読み込んだ
//     id の明示集合に変わったため)。
//   - `TeamRelayRecordsAPI.replace()` はもう内部で relay_records を select しない。
//     古い行の特定は呼び出し元が `relay_record_legs` 経由で解決した
//     `existingRelayRecordIds` を渡すことで行う。
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  saveStyleRecords,
  scopeExistingRecordIdsForEntries,
  scopeRelayRecordIdsForLegRecords,
} from "../teamRecordBulk/saveStyleRecords";
import type { ExistingRecord, StyleEntry, StyleLookup } from "../teamRecordBulk/buildStyleEntries";
import { buildRecordSaveSupabaseMock, type RecordSaveSupabaseMock } from "./supabaseRecordSaveMock";

const STYLES: StyleLookup[] = [
  { id: 101, name_jp: "自由形100m(A)", distance: 100 },
  { id: 202, name_jp: "平泳ぎ100m(B)", distance: 100 },
];

function existingRecord(overrides: Partial<ExistingRecord>): ExistingRecord {
  return {
    id: "record-placeholder",
    user_id: "user-1",
    style_id: 101,
    time: 60,
    is_relaying: false,
    note: null,
    split_times: [],
    users: { id: "user-1", name: "選手A" },
    ...overrides,
  };
}

let fake: RecordSaveSupabaseMock;

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
});

describe("[V-01] 個人種目の保存スコープ封じ込め", () => {
  // 大会全体の既存 records: style A (101) が1件、style B (202) が1件。
  const allExistingRecords: ExistingRecord[] = [
    existingRecord({ id: "record-style-a-1", style_id: 101, user_id: "user-1", time: 58.2 }),
    existingRecord({ id: "record-style-b-1", style_id: 202, user_id: "user-2", time: 70.1 }),
  ];

  const styleAEntry: StyleEntry = {
    id: "entry-style-a",
    styleId: 101,
    styleName: "自由形100m(A)",
    memberRecords: [
      {
        id: "record-style-a-1",
        memberUserId: "user-1",
        memberName: "選手A",
        time: 57.9,
        timeDisplayValue: "57.90",
        reactionTime: "",
        isRelaying: false,
        note: "",
        splitTimes: [],
      },
    ],
  };

  it("style A を保存しても、同一大会の style B の records.id/updated_at が変化しない (eqCalls で style_id 以外に触れないことを証明)", async () => {
    const existingRecordIds = scopeExistingRecordIdsForEntries(allExistingRecords, [styleAEntry]);

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [styleAEntry],
      existingRecordIds,
      existingRelayRecordIds: new Set(),
      memberGenderByUserId: new Map(),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    // style B の既存行 id はどの .eq() / .in() 呼び出しにも一度も現れない
    const touchedIds = [
      ...fake.eqCalls.filter((c) => c.table === "records").map((c) => c.value),
      ...fake.inCalls.filter((c) => c.table === "records").flatMap((c) => c.values),
    ];
    expect(touchedIds).not.toContain("record-style-b-1");

    // style A の既存行だけが UPDATE される
    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-style-a-1" }]);
  });

  it("style A の UPDATE 対象 id 集合に、style B の既存 records.id が1件も含まれない", async () => {
    const existingRecordIds = scopeExistingRecordIdsForEntries(allExistingRecords, [styleAEntry]);
    // scopeExistingRecordIdsForEntries の戻り値そのものにも B が含まれないことを固定する
    expect(existingRecordIds.has("record-style-b-1")).toBe(false);
    expect(existingRecordIds.has("record-style-a-1")).toBe(true);

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [styleAEntry],
      existingRecordIds,
      existingRelayRecordIds: new Set(),
      memberGenderByUserId: new Map(),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    // style B の行を消す delete が一切発行されていない
    const recordDeleteIns = fake.inCalls.filter(
      (c) => c.table === "records" && c.op === "delete",
    );
    expect(recordDeleteIns).toHaveLength(0);
  });
});

describe("[V-01] リレー種目の保存スコープ封じ込め (relay_records)", () => {
  const relayLegUserIds = ["user-lead", "user-second", "user-third", "user-anchor"];

  const relayEntry: StyleEntry = {
    id: "entry-relay-4x50-free",
    styleId: 2,
    styleName: "4x50mフリーリレー",
    relayEventId: "relay_4x50_free",
    memberRecords: relayLegUserIds.map((userId, idx) => ({
      id: `record-relay-${idx}`,
      memberUserId: userId,
      memberName: `選手${idx}`,
      time: 27 + idx,
      timeDisplayValue: `${27 + idx}.00`,
      reactionTime: "",
      isRelaying: idx !== 0,
      note: "",
      splitTimes: [],
      cumulativeTimeSeconds: (idx + 1) * 27,
    })),
  };

  const relayExistingRecords: ExistingRecord[] = relayLegUserIds.map((userId, idx) =>
    existingRecord({
      id: `record-relay-${idx}`,
      style_id: 2,
      user_id: userId,
      is_relaying: idx !== 0,
      time: 27 + idx,
    }),
  );

  it("relay_4x100_medley を保存しても、同一大会の relay_4x50_free の relay_records 行が delete されない (対照: id ベーススコープで他種目の relay_records には触れない)", async () => {
    // 画面のロード時点で「この種目 (4x50_free) の relay_records.id」が
    // relay_record_legs 経由で解決される想定 (実DBはこの種目の records.id からしか
    // 逆引きされないので、他種目の relay_records.id は混ざらない)。
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: [{ relay_record_id: "stale-4x50-free-only" }] },
    });

    const existingRecordIds = scopeExistingRecordIdsForEntries(relayExistingRecords, [relayEntry]);
    const existingRelayRecordIds = await scopeRelayRecordIdsForLegRecords(
      fake.supabase as never,
      Array.from(existingRecordIds),
    );
    expect(existingRelayRecordIds).toEqual(new Set(["stale-4x50-free-only"]));

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [relayEntry],
      existingRecordIds,
      existingRelayRecordIds,
      memberGenderByUserId: new Map(relayLegUserIds.map((id) => [id, 0])),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    const relayDeleteIns = fake.inCalls.filter(
      (c) => c.table === "relay_records" && c.op === "delete",
    );
    expect(relayDeleteIns).toHaveLength(1);
    expect(relayDeleteIns[0]?.values).toEqual(["stale-4x50-free-only"]);
  });

  it("relay_records の差し替えスコープ取得 (relay_record_legs.select().in()) はこの種目自身の records.id だけを record_id 条件として渡す (DB 列条件に絞り込みを戻していない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: [{ relay_record_id: "stale-4x50-free-only" }] },
    });

    const existingRecordIds = scopeExistingRecordIdsForEntries(relayExistingRecords, [relayEntry]);
    const existingRelayRecordIds = await scopeRelayRecordIdsForLegRecords(
      fake.supabase as never,
      Array.from(existingRecordIds),
    );

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [relayEntry],
      existingRecordIds,
      existingRelayRecordIds,
      memberGenderByUserId: new Map(relayLegUserIds.map((id) => [id, 0])),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    // resolve は saveStyleRecords 呼び出しより前 (テストのセットアップ側) で行っているので、
    // .in("record_id", ...) はここで1回だけ発生している
    const legScopeIn = fake.inCalls.filter(
      (c) => c.table === "relay_record_legs" && c.op === "select",
    );
    expect(legScopeIn).toEqual([
      {
        table: "relay_record_legs",
        op: "select",
        column: "record_id",
        values: relayExistingRecords.map((r) => r.id),
      },
    ]);

    // relay_records 自体は一切 select されない (replace() が内部 select をしない設計)
    expect(fake.selectCalls.filter((c) => c.table === "relay_records")).toHaveLength(0);
  });

  it("replace() に渡る relayRecordIds は resolve 済みの existingRelayRecordIds そのもの (DB 列条件を経由しない受け渡し)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: [{ relay_record_id: "stale-4x50-free-only" }] },
    });

    const existingRecordIds = scopeExistingRecordIdsForEntries(relayExistingRecords, [relayEntry]);
    const existingRelayRecordIds = await scopeRelayRecordIdsForLegRecords(
      fake.supabase as never,
      Array.from(existingRecordIds),
    );

    await saveStyleRecords({
      supabase: fake.supabase as never,
      competitionId: "comp-1",
      teamId: "team-1",
      poolType: 0,
      entries: [relayEntry],
      existingRecordIds,
      existingRelayRecordIds,
      memberGenderByUserId: new Map(relayLegUserIds.map((id) => [id, 0])),
      styles: STYLES,
      isPremium: false,
      getAccessToken: async () => null,
    });

    const relayDeleteIns = fake.inCalls.find(
      (c) => c.table === "relay_records" && c.op === "delete",
    );
    expect(relayDeleteIns?.values).toEqual(Array.from(existingRelayRecordIds));
  });
});
