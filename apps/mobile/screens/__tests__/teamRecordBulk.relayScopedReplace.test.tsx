// =============================================================================
// teamRecordBulk.relayScopedReplace.test.tsx
// Sprint Contract Phase A スケルトン — RelayRecordReplaceScope の id ベース化
// =============================================================================
//
// 【修正ラウンド 2026-09-17 (Critical #1)】旧仕様は `RelayRecordReplaceScope` に
// オプションの `relayEventId` を持たせ、指定時のみ `relay_kind` + `leg_distance` で
// 既存行を絞り込んでいた。しかしこれは同一種目に複数チーム/組が登録されている場合、
// **列条件では別チーム/別組の行を区別できない**。400m フリーリレーに2チーム
// 登録されている場合、`(team_id, competition_id, relay_kind, leg_distance)` は
// 両チームの行にヒットするため、片方のチームを保存すると相手チームの
// `relay_records` 行が削除されて復活しない Critical だった。
//
// 新仕様: `RelayRecordReplaceScope` から `relayEventId?` を削除し、
// `relayRecordIds: readonly string[]` (呼び出し元が読み込んだ `relay_records.id` の
// 明示集合) に置換。`replace()` は内部で一切 SELECT せず、渡された id をそのまま
// `staleIds` として使う。DB 列条件による絞り込みは一切行わない。
//
// 観点の引き継ぎ (旧ファイルから維持):
//   [V-02] 既存行の削除スコープは呼び出し元が渡した範囲に厳密に閉じる
//          (select 結果 = 削除対象、それ以上に広げない)
//   [V-02] insert → 明示 id delete の順序と『全計画成功時のみ削除』の既存保証は崩れない
//   [新規] 同一種目に2チームある場合、片方の保存がもう片方の relay_records を
//          巻き込んで消さないこと (Critical #1 そのものの回帰防止。ミューテーションで
//          赤を実証する — 手順は本ファイル末尾のコメント参照)
//
// `TeamRelayRecordsAPI` (apps/shared/api/teams/relayRecords.ts) を実物 import し
// 直接呼び出す。screen は render しない。
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import type { RelaySavePlan } from "@apps/shared/utils/relayRecordSave";
import { buildRecordSaveSupabaseMock, type RecordSaveSupabaseMock } from "./supabaseRecordSaveMock";

function buildPlan(overrides: Partial<RelaySavePlan> = {}): RelaySavePlan {
  return {
    relayEventId: "relay_4x50_free",
    totalTime: 112.1,
    legCount: 4,
    genderCategory: "male",
    legs: [
      { legIndex: 0, userId: "user-lead", styleId: 2, legTime: 27.5, reactionTime: null, validRecordIndex: 0 },
      { legIndex: 1, userId: "user-second", styleId: 2, legTime: 28.7, reactionTime: null, validRecordIndex: 1 },
      { legIndex: 2, userId: "user-third", styleId: 2, legTime: 28.3, reactionTime: null, validRecordIndex: 2 },
      { legIndex: 3, userId: "user-anchor", styleId: 2, legTime: 27.6, reactionTime: null, validRecordIndex: 3 },
    ],
    ...overrides,
  };
}

const insertedRecordIds = ["record-lead", "record-second", "record-third", "record-anchor"];

let fake: RecordSaveSupabaseMock;

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
});

describe("[V-02] TeamRelayRecordsAPI.replace() の relayRecordIds (id ベース) スコープ化", () => {
  it("replace() は既存行の取得を一切行わない (DB 列条件への絞り込み直しが復活していない)", async () => {
    await new TeamRelayRecordsAPI(fake.supabase as never).replace(
      { teamId: "team-1", competitionId: "comp-1", poolType: 0, relayRecordIds: ["stale-4x50-free-old"] },
      [buildPlan()],
      insertedRecordIds,
    );

    expect(fake.selectCalls.filter((c) => c.table === "relay_records")).toHaveLength(0);
    expect(fake.eqCalls.filter((c) => c.table === "relay_records" && c.op === "select")).toHaveLength(0);
  });

  it("delete 対象の staleIds は scope.relayRecordIds に渡された id そのもの (探し直して広げない)", async () => {
    await new TeamRelayRecordsAPI(fake.supabase as never).replace(
      { teamId: "team-1", competitionId: "comp-1", poolType: 0, relayRecordIds: ["stale-4x50-free-old"] },
      [buildPlan()],
      insertedRecordIds,
    );

    const deleteIns = fake.inCalls.filter((c) => c.table === "relay_records" && c.op === "delete");
    expect(deleteIns).toHaveLength(1);
    // 渡した id 以外 (例えば今回 insert した新しい relay_records.id) が
    // 紛れ込んでいないことを厳密一致で確認する
    expect(deleteIns[0]?.values).toEqual(["stale-4x50-free-old"]);
  });

  it("relayRecordIds が空配列なら delete は発行されない (置き換え対象の既存行が無い = 新規保存のみ)", async () => {
    await new TeamRelayRecordsAPI(fake.supabase as never).replace(
      { teamId: "team-1", competitionId: "comp-1", poolType: 0, relayRecordIds: [] },
      [buildPlan()],
      insertedRecordIds,
    );

    expect(fake.deleteCalls.filter((c) => c.table === "relay_records")).toHaveLength(0);
    expect(fake.inCalls.filter((c) => c.table === "relay_records" && c.op === "delete")).toHaveLength(0);
  });

  it("insert → 明示 id delete の順序と『全計画成功時のみ削除』の既存保証 (V-MG-01/02) は崩れない (select は発生しない)", async () => {
    const successResult = await new TeamRelayRecordsAPI(fake.supabase as never).replace(
      { teamId: "team-1", competitionId: "comp-1", poolType: 0, relayRecordIds: ["stale-4x50-free-old"] },
      [buildPlan()],
      insertedRecordIds,
    );
    expect(successResult.failed).toBe(false);

    const relevantOps = fake.operations.filter(
      (op) => op.table === "relay_records" || op.table === "relay_record_legs",
    );
    // insert(relay_records) → insert(relay_record_legs) → delete(古い行)。
    // 事前 select は発生しない (旧仕様との最大の違い)。
    expect(relevantOps.map((op) => `${op.table}:${op.op}`)).toEqual([
      "relay_records:insert",
      "relay_record_legs:insert",
      "relay_records:delete",
    ]);

    // 対照: レグ insert が失敗すると親を巻き戻し、古い行の delete は発行しない
    fake = buildRecordSaveSupabaseMock({
      insertError: (table) =>
        table === "relay_record_legs" ? { message: "legs denied" } : null,
    });
    const failResult = await new TeamRelayRecordsAPI(fake.supabase as never).replace(
      { teamId: "team-1", competitionId: "comp-1", poolType: 0, relayRecordIds: ["stale-4x50-free-old"] },
      [buildPlan()],
      insertedRecordIds,
    );
    expect(failResult.failed).toBe(true);
    expect(fake.inCalls.filter((c) => c.table === "relay_records" && c.op === "delete")).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// [新Critical] 同一リレー種目に2チームある状態で、片方を保存してももう片方の
// relay_records が消えない (Critical #1 そのものの回帰防止)
//
// ミューテーション手順 (PM 用・本レポートで実施・復元済み):
//   apps/shared/api/teams/relayRecords.ts の `replace()` 内、
//     const staleIds = [...scope.relayRecordIds];
//   を
//     const staleIds = [...scope.relayRecordIds, "team-b-relay-existing"];
//   のように「呼び出し元スコープ外の id」を紛れ込ませる (= 列条件で他チームの行を
//   巻き込んでいた旧バグの再現) と、下記テストが赤くなることを実証済み。
// ---------------------------------------------------------------------------
describe("[新Critical] 同一種目に2チームある場合の削除スコープ封じ込め", () => {
  it("チームAの relayRecordIds にはチームBの relay_records.id が含まれないので、チームAを保存してもチームBの行は delete 対象に入らない", async () => {
    // 同一 relay_4x50_free 種目に、チームA/チームBそれぞれの relay_records が
    // 既に1行ずつ存在する状態。呼び出し元 (画面) はチームAの保存であり、
    // 画面が読み込んだのはチームA分の relay_records.id だけ (= relayRecordIds に
    // チームBの id を含めない、が呼び出し元の責務)。
    const TEAM_A_RELAY_ID = "team-a-relay-existing";
    const TEAM_B_RELAY_ID = "team-b-relay-existing";

    const result = await new TeamRelayRecordsAPI(fake.supabase as never).replace(
      {
        teamId: "team-a",
        competitionId: "comp-1",
        poolType: 0,
        // チームAの画面が読み込んだのはチームA自身の relay_records.id のみ。
        // チームBの id はここに含まれない。
        relayRecordIds: [TEAM_A_RELAY_ID],
      },
      [buildPlan()],
      insertedRecordIds,
    );

    expect(result.failed).toBe(false);

    const deleteIns = fake.inCalls.find(
      (c) => c.table === "relay_records" && c.op === "delete",
    );
    // delete 対象はチームAの既存行だけ。チームBの id は一切登場しない。
    expect(deleteIns?.values).toEqual([TEAM_A_RELAY_ID]);
    expect(deleteIns?.values).not.toContain(TEAM_B_RELAY_ID);
  });

  it("resolveRelayRecordIdsForRecords はチームAの records.id からチームBの relay_records.id を解決しない (逆引きが records.id 経由に閉じている)", async () => {
    // チームAの records.id (leg 由来) に対応する relay_record_legs だけを
    // selectRows に仕込む。チームBの records.id は渡さないので、たとえ DB 上に
    // チームBの relay_record_legs 行が存在していても resolveRelayRecordIdsForRecords
    // には無関係 (.in("record_id", 渡したid) が本物の DB ならそこで絞られる)。
    fake = buildRecordSaveSupabaseMock({
      selectRows: {
        relay_record_legs: [{ relay_record_id: "team-a-relay-existing" }],
      },
    });

    const api = new TeamRelayRecordsAPI(fake.supabase as never);
    const resolved = await api.resolveRelayRecordIdsForRecords(["team-a-record-1"]);

    expect(resolved).toEqual(new Set(["team-a-relay-existing"]));

    const inCall = fake.inCalls.find((c) => c.table === "relay_record_legs" && c.op === "select");
    expect(inCall?.column).toBe("record_id");
    expect(inCall?.values).toEqual(["team-a-record-1"]);
  });
});
