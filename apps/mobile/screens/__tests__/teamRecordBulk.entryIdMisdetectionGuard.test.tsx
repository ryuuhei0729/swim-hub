// =============================================================================
// teamRecordBulk.entryIdMisdetectionGuard.test.tsx
// Sprint Contract Phase A スケルトン — entries.id を records.id と誤認しない
// =============================================================================
//
// 事実2 (PM確定): `MemberRecord.id` は、既存記録由来なら `records.id`
// (buildStyleEntries.ts L347)、**エントリー由来の新規行なら `entries.id`**
// (同 L494)、新規追加行なら `genId()` の生成値。**文字列を見ても区別がつかない。**
// 事実3: `records` に自然キーの UNIQUE 制約は無い (PK id のみ)。
// 突合は id の集合 membership で行う。
//
// [V-05] エントリー由来行 (`MemberRecord.id === entries.id`) を
//        「既存レコード」と誤認して UPDATE (records.id として扱う) しないこと。
//        誤認すると存在しない records.id への UPDATE が0件成功 (PostgREST は
//        RLS/対象無しのUPDATEを0行成功で返す=エラーにならない) となり、
//        記録が保存されずに silent failure になる。
//
// `saveStyleRecords` / `scopeExistingRecordIdsForEntries` を実物 import して
// 直接呼び出す (screen は render しない)。判定は
// `computeRecordSaveDiff` (apps/shared/utils/recordSaveDiff.ts) の
// membership 判定に委譲されるので、ここではその結果を saveStyleRecords 経由の
// 実際の insert/update 呼び出しとして観測する。
//
// 【修正ラウンド 2026-09-17】「組」入力の復旧で screen state が
// `entry: StyleEntry` → `entries: StyleEntry[]` に変わり、対応する
// `scopeExistingRecordIdsForEntry` (単数) も `scopeExistingRecordIdsForEntries`
// (複数形) にリネームされた。このファイルの観点 (entries.id/genId() 由来行の
// membership 判定) 自体は1本の組でも成立するため、単一 entry を `[entry]` で
// 包んで渡す形に更新する。

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

function runSave(entry: StyleEntry, existingRecords: ExistingRecord[]) {
  const existingRecordIds = scopeExistingRecordIdsForEntries(existingRecords, [entry]);
  return saveStyleRecords({
    supabase: fake.supabase as never,
    competitionId: "comp-1",
    teamId: "team-1",
    poolType: 0,
    entries: [entry],
    existingRecordIds,
    existingRelayRecordIds: new Set(),
    memberGenderByUserId: new Map(),
    styles: STYLES,
    isPremium: false,
    getAccessToken: async () => null,
  });
}

describe("[V-05] entries.id / genId() 由来行の誤 UPDATE 防止", () => {
  it("MemberRecord.id が entries.id 由来 (既存 records.id 集合に含まれない) の行は INSERT される (UPDATE されない)", async () => {
    const entry: StyleEntry = {
      id: "entry-style",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        {
          // entries.id 由来 (existingRecords には無い id)
          id: "entries-row-7",
          memberUserId: "user-1",
          memberName: "選手A",
          time: 29.8,
          timeDisplayValue: "29.80",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
      ],
    };

    await runSave(entry, []);

    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(0);
    const inserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(inserts).toHaveLength(1);
    expect((inserts[0]?.payload as { user_id: string }).user_id).toBe("user-1");
  });

  it("MemberRecord.id が既存 records.id 集合に含まれる行のみ UPDATE される", async () => {
    const existingRecords: ExistingRecord[] = [
      {
        id: "record-real-1",
        user_id: "user-1",
        style_id: 2,
        time: 30.5,
        is_relaying: false,
        note: null,
        split_times: [],
        users: { id: "user-1", name: "選手A" },
      },
    ];
    const entry: StyleEntry = {
      id: "entry-style",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        {
          id: "record-real-1",
          memberUserId: "user-1",
          memberName: "選手A",
          time: 29.9,
          timeDisplayValue: "29.90",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
        {
          // entries.id 由来の追加行
          id: "entries-row-8",
          memberUserId: "user-2",
          memberName: "選手B",
          time: 31.0,
          timeDisplayValue: "31.00",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
      ],
    };

    await runSave(entry, existingRecords);

    const updates = fake.updateCalls.filter((c) => c.table === "records");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.eq).toEqual([{ column: "id", value: "record-real-1" }]);

    const inserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(inserts).toHaveLength(1);
    expect((inserts[0]?.payload as { user_id: string }).user_id).toBe("user-2");
  });

  it("genId() 由来の新規追加行 (どちらの集合にも属さない) も INSERT される", async () => {
    const existingRecords: ExistingRecord[] = [
      {
        id: "record-real-2",
        user_id: "user-1",
        style_id: 2,
        time: 30.5,
        is_relaying: false,
        note: null,
        split_times: [],
        users: { id: "user-1", name: "選手A" },
      },
    ];
    const entry: StyleEntry = {
      id: "entry-style",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        {
          id: "record-real-2",
          memberUserId: "user-1",
          memberName: "選手A",
          time: 30.5,
          timeDisplayValue: "30.50",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
        {
          // genId() 由来 (クライアント内でのみ生成された新規行)
          id: "sd-genid-new-row",
          memberUserId: "user-3",
          memberName: "選手C",
          time: 28.4,
          timeDisplayValue: "28.40",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
      ],
    };

    await runSave(entry, existingRecords);

    const inserts = fake.insertCalls.filter((c) => c.table === "records");
    const insertedUserIds = inserts.map((c) => (c.payload as { user_id: string }).user_id);
    expect(insertedUserIds).toEqual(["user-3"]);
  });

  it("records.id と entries.id が偶然同じ文字列形式でも、既存 records.id 集合との membership 判定は正しく分岐する (文字列パターンでなく実際の集合参照で判定していることの回帰防止)", async () => {
    // "record-" prefix はどちらの由来でも取りうる形式であることをあえて再現する
    // (prefix 判定していたら両方とも UPDATE 扱いされてしまう)
    const existingRecords: ExistingRecord[] = [
      {
        id: "record-shared-format-1",
        user_id: "user-1",
        style_id: 2,
        time: 30.5,
        is_relaying: false,
        note: null,
        split_times: [],
        users: { id: "user-1", name: "選手A" },
      },
    ];
    const entry: StyleEntry = {
      id: "entry-style",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        {
          id: "record-shared-format-1",
          memberUserId: "user-1",
          memberName: "選手A",
          time: 30.1,
          timeDisplayValue: "30.10",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
        {
          // "record-" で始まるが実体は entries.id 由来 (existingRecords には無い)
          id: "record-shared-format-2",
          memberUserId: "user-2",
          memberName: "選手B",
          time: 31.2,
          timeDisplayValue: "31.20",
          reactionTime: "",
          isRelaying: false,
          note: "",
          splitTimes: [],
        },
      ],
    };

    await runSave(entry, existingRecords);

    const updates = fake.updateCalls.filter((c) => c.table === "records");
    expect(updates.map((c) => c.eq[0]?.value)).toEqual(["record-shared-format-1"]);

    const inserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(inserts).toHaveLength(1);
    expect((inserts[0]?.payload as { user_id: string }).user_id).toBe("user-2");
  });
});
