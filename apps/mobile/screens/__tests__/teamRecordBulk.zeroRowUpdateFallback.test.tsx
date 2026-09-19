// =============================================================================
// teamRecordBulk.zeroRowUpdateFallback.test.tsx
// [新High] 0行 UPDATE 検知時の INSERT フォールバック (mobile)
// (QA Sprint Contract Phase B / 修正ラウンド 2026-09-17・High #2)
// =============================================================================
//
// PostgREST は UPDATE の対象行が0件でもエラーを返さない。別セッションが保存
// 直前に同じ行を削除していた場合、`.update(payload).eq("id", id).select("id")`
// は `{ data: [], error: null }` を返す。旧実装はこれを検知できず、入力が
// 無言で失われていた (High #2)。`saveStyleRecords` を実物 import して直接
// 呼び出す (screen は render しない)。
//
// [新High] 検証観点:
//   1. 0行 UPDATE を検知したら INSERT にフォールバックし、ユーザーの入力が
//      失われないこと
//   2. 正常系 (対象行が実在する) では UPDATE のまま処理され、フォールバックが
//      誤発火しないこと
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  saveStyleRecords,
  scopeExistingRecordIdsForEntries,
} from "../teamRecordBulk/saveStyleRecords";
import type { ExistingRecord, StyleEntry, StyleLookup } from "../teamRecordBulk/buildStyleEntries";
import { buildRecordSaveSupabaseMock, type RecordSaveSupabaseMock } from "./supabaseRecordSaveMock";

const STYLES: StyleLookup[] = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

const existingRecords: ExistingRecord[] = [
  {
    id: "record-existing-1",
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
      id: "record-existing-1",
      memberUserId: "user-1",
      memberName: "選手A",
      time: 30.5,
      timeDisplayValue: "30.50",
      reactionTime: "",
      isRelaying: false,
      note: "",
      splitTimes: [],
    },
  ],
};

let fake: RecordSaveSupabaseMock;

async function runSave() {
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

describe("[新High] 0行 UPDATE 検知時の INSERT フォールバック (mobile)", () => {
  it("対象行が別セッションで削除済み (0行 UPDATE) でも、ユーザーの入力は INSERT で保存される (無言で消えない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      updateMatchedRows: (table) => (table === "records" ? [] : undefined),
    });

    const result = await runSave();
    expect(result.hasError).toBe(false);

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-existing-1" }]);

    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
    expect((recordInserts[0]?.payload as { time: number }).time).toBe(30.5);
    expect((recordInserts[0]?.payload as { user_id: string }).user_id).toBe("user-1");
  });

  it("対照: 対象行が実在する正常系では UPDATE のまま処理され、フォールバックの INSERT は発生しない (誤発火しない)", async () => {
    fake = buildRecordSaveSupabaseMock();

    const result = await runSave();
    expect(result.hasError).toBe(false);

    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(1);
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
  });
});
