// =============================================================================
// teamRecordBulk.retryNoDuplicate.test.tsx
// 低速回線で保存が途中で失敗した後の再保存で、記録が二重に登録されないこと
// =============================================================================
//
// 背景: saveStyleRecords は行ごとに records を INSERT する。プールのように電波が
// 不安定な場所では、一部の行だけ INSERT できて残りが失敗することがある。以前は
// 画面が持つ既存 ID 集合が読み込み時のままだったため、再保存すると作成済みの行も
// もう一度 INSERT され、同じ記録が2件になっていた。
//
// 検証観点:
//   1. 1回目で作成できた行は、2回目の保存で INSERT ではなく UPDATE になる
//   2. 応答だけ失われた INSERT (= 主キー重複) は UPDATE に切り替わり、入力は保存される
//   3. 作成済みの行をフォームから外して再保存すると、その記録は削除される

import { describe, it, expect } from "vitest";
import { saveStyleRecords } from "../teamRecordBulk/saveStyleRecords";
import type {
  StyleEntry,
  StyleLookup,
} from "../teamRecordBulk/buildStyleEntries";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMock,
} from "./supabaseRecordSaveMock";

const STYLES: StyleLookup[] = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

function memberRecord(id: string, userId: string, time: number) {
  return {
    id,
    memberUserId: userId,
    memberName: `選手${userId}`,
    time,
    timeDisplayValue: String(time),
    reactionTime: "",
    isRelaying: false,
    note: "",
    splitTimes: [],
  };
}

function entryWith(records: ReturnType<typeof memberRecord>[]): StyleEntry {
  return {
    id: "entry-style",
    styleId: 2,
    styleName: "自由形50m",
    memberRecords: records,
  };
}

let clientIdSeq = 0;
const generateRecordId = () => {
  clientIdSeq += 1;
  return `client-record-${clientIdSeq}`;
};

function runSave(
  fake: RecordSaveSupabaseMock,
  entry: StyleEntry,
  maps: {
    createdRecordIds: Map<string, string>;
    draftRecordIds: Map<string, string>;
  },
) {
  return saveStyleRecords({
    supabase: fake.supabase as never,
    competitionId: "comp-1",
    teamId: "team-1",
    poolType: 0,
    entries: [entry],
    existingRecordIds: new Set(),
    existingRelayRecordIds: new Set(),
    memberGenderByUserId: new Map(),
    styles: STYLES,
    isPremium: false,
    getAccessToken: async () => null,
    createdRecordIds: maps.createdRecordIds,
    draftRecordIds: maps.draftRecordIds,
    generateRecordId,
  });
}

describe("チーム記録の再保存で二重登録しない", () => {
  it("1回目で作成できた行は、2回目の保存で INSERT し直さず UPDATE する", async () => {
    const entry = entryWith([
      memberRecord("row-a", "u1", 30.1),
      memberRecord("row-b", "u2", 31.2),
    ]);
    const maps = {
      createdRecordIds: new Map<string, string>(),
      draftRecordIds: new Map<string, string>(),
    };

    // 1回目: 2行目の INSERT が通信で失敗する
    const first = buildRecordSaveSupabaseMock({
      insertError: (table, _payload, nth) =>
        table === "records" && nth === 2
          ? { message: "TypeError: Network request failed", code: "" }
          : null,
    });
    const firstResult = await runSave(first, entry, maps);
    expect(firstResult.hasError).toBe(true);
    const firstInsertedId = first.insertedIds.records?.[0];
    expect(firstInsertedId).toBeDefined();

    // 2回目: 電波が戻って再保存
    const second = buildRecordSaveSupabaseMock();
    const secondResult = await runSave(second, entry, maps);
    expect(secondResult.hasError).toBe(false);

    const recordInserts = second.insertCalls.filter(
      (c) => c.table === "records",
    );
    expect(recordInserts).toHaveLength(1);
    expect((recordInserts[0]?.payload as { user_id: string }).user_id).toBe(
      "u2",
    );

    const recordUpdates = second.updateCalls.filter(
      (c) => c.table === "records",
    );
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([
      { column: "id", value: firstInsertedId },
    ]);
  });

  it("新規行はクライアントで決めた ID で INSERT し、再試行でも同じ ID を使う", async () => {
    const entry = entryWith([memberRecord("row-a", "u1", 30.1)]);
    const maps = {
      createdRecordIds: new Map<string, string>(),
      draftRecordIds: new Map<string, string>(),
    };

    const first = buildRecordSaveSupabaseMock({
      insertError: (table) =>
        table === "records"
          ? { message: "TypeError: Network request failed", code: "" }
          : null,
    });
    await runSave(first, entry, maps);
    const second = buildRecordSaveSupabaseMock();
    await runSave(second, entry, maps);

    const firstId = (
      first.insertCalls.find((c) => c.table === "records")?.payload as {
        id: string;
      }
    ).id;
    const secondId = (
      second.insertCalls.find((c) => c.table === "records")?.payload as {
        id: string;
      }
    ).id;
    expect(firstId).toMatch(/^client-record-/);
    expect(secondId).toBe(firstId);
  });

  it("応答だけ失われた INSERT (主キー重複) は UPDATE に切り替え、入力を保存する", async () => {
    const entry = entryWith([memberRecord("row-a", "u1", 29.9)]);
    const maps = {
      createdRecordIds: new Map<string, string>(),
      draftRecordIds: new Map<string, string>(),
    };

    const fake = buildRecordSaveSupabaseMock({
      insertError: (table) =>
        table === "records"
          ? {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "records_pkey"',
            }
          : null,
    });
    const result = await runSave(fake, entry, maps);
    expect(result.hasError).toBe(false);

    const clientId = maps.draftRecordIds.get("row-a");
    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: clientId }]);
    expect((recordUpdates[0]?.payload as { time: number }).time).toBe(29.9);
    expect(maps.createdRecordIds.get("row-a")).toBe(clientId);
  });

  it("作成済みの行をフォームから外して再保存すると、その記録を削除する", async () => {
    const maps = {
      createdRecordIds: new Map<string, string>(),
      draftRecordIds: new Map<string, string>(),
    };
    const both = entryWith([
      memberRecord("row-a", "u1", 30.1),
      memberRecord("row-b", "u2", 31.2),
    ]);

    const first = buildRecordSaveSupabaseMock({
      insertError: (table, _payload, nth) =>
        table === "records" && nth === 2
          ? { message: "TypeError: Network request failed", code: "" }
          : null,
    });
    await runSave(first, both, maps);
    const createdA = maps.createdRecordIds.get("row-a");

    // row-a を消して row-b だけで再保存
    const second = buildRecordSaveSupabaseMock();
    const result = await runSave(
      second,
      entryWith([memberRecord("row-b", "u2", 31.2)]),
      maps,
    );
    expect(result.hasError).toBe(false);

    const recordDeleteIns = second.inCalls.filter(
      (c) => c.table === "records" && c.op === "delete",
    );
    expect(recordDeleteIns).toEqual([
      { table: "records", op: "delete", column: "id", values: [createdA] },
    ]);
    expect(maps.createdRecordIds.has("row-a")).toBe(false);
  });
});
