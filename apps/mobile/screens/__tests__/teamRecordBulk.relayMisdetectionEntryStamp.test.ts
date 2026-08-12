/**
 * teamRecordBulk.relayMisdetectionEntryStamp.test.ts
 *
 * Reviewer 指摘 (Warning・回帰テストとして記録): buildStyleEntriesFromExisting の
 * リレー検出は「is_relaying が [false, true, true, true] の4件連続パターン」に
 * 厳密依存している。3件や5件の is_relaying=true レコードが混在すると
 * relayEventId が付与されず、通常の非リレー StyleEntry として style_id 単位で
 * グループ化される。
 *
 * この既存の脆弱性自体は今回のスコープ外 (PM 裁定済み)。しかし今回追加した
 * stampExistingEntryTimeReferences (修正3, mobile は web からの移植) は
 * 「relayEventId の有無」だけを安全境界として信頼しているため、誤検出で
 * relayEventId が付かなかった「実質リレーのレグ記録」グループに、同一
 * (user_id, style_id) の個人エントリーが存在すると、リレーのレグ入力欄に
 * 無関係な個人エントリーの申告タイムが誤ってスタンプされる (表示上の誤帰属)。
 *
 * web 側 (apps/web/__tests__/records/relayMisdetectionEntryStamp.test.ts) と
 * 同じシナリオ・同じ assertion 形で固定し、web/mobile の挙動が一致することを
 * パリティとして担保する。修正は別スプリント。
 */

import { describe, expect, it } from "vitest";
import {
  buildStyleEntriesFromExisting,
  stampExistingEntryTimeReferences,
  type ExistingRecord,
} from "../teamRecordBulk/buildStyleEntries";
import {
  buildEntryTimeReferenceLookup,
  type EntryRowForRecordMerge,
} from "@apps/shared/utils/entryRecordMerge";

const STYLES = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

function makeEntry(
  overrides: Partial<EntryRowForRecordMerge> & { user_id: string; style_id: number },
): EntryRowForRecordMerge {
  return {
    id: `entry-${overrides.user_id}-${overrides.style_id}`,
    entry_time: 90.0,
    note: null,
    userName: "選手",
    ...overrides,
  };
}

describe("[Reviewer回帰・修正はスコープ外・mobile] リレー誤検出と entryTimeReference スタンプの相互作用", () => {
  it(
    "【現状の挙動を固定・修正はスコープ外】4連続パターンから外れて relayEventId が" +
      "付かなかった『実質リレーのレグ記録』に対し、そのレグの (user_id, style_id) と" +
      "一致する個人エントリーが存在すると、そのレグの記録行に entryTimeReference が" +
      "誤ってスタンプされる (web 側と同一シナリオでのパリティ確認)",
    () => {
      const records: ExistingRecord[] = [
        { id: "r0", user_id: "user-a", style_id: 2, time: 27.5, is_relaying: false, reaction_time: null, note: null, split_times: [], users: { id: "user-a", name: "太郎" } },
        { id: "r1", user_id: "user-b", style_id: 2, time: 28.7, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-b", name: "次郎" } },
        { id: "r2", user_id: "user-c", style_id: 2, time: 28.3, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-c", name: "三郎" } },
      ];
      const baseStyleEntries = buildStyleEntriesFromExisting(records, STYLES);
      expect(baseStyleEntries[0].relayEventId).toBeUndefined();

      const entries = [makeEntry({ user_id: "user-b", style_id: 2, entry_time: 99.99 })];
      const lookup = buildEntryTimeReferenceLookup(entries);

      const stamped = stampExistingEntryTimeReferences(baseStyleEntries, lookup);

      const legRecordForUserB = stamped[0].memberRecords.find((mr) => mr.memberUserId === "user-b")!;
      expect(legRecordForUserB.entryTimeReference).toBe(99.99);
      expect(legRecordForUserB.time).toBe(28.7);

      // 対照: 4件連続で正しくリレー検出された場合はスタンプされない
      const correctlyDetectedRecords: ExistingRecord[] = [
        ...records,
        { id: "r3", user_id: "user-d", style_id: 2, time: 27.6, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-d", name: "四郎" } },
      ];
      const correctBase = buildStyleEntriesFromExisting(correctlyDetectedRecords, STYLES);
      expect(correctBase[0].relayEventId).toBeDefined();

      const correctStamped = stampExistingEntryTimeReferences(correctBase, lookup);
      const correctLegForUserB = correctStamped[0].memberRecords.find(
        (mr) => mr.memberUserId === "user-b",
      )!;
      expect(correctLegForUserB.entryTimeReference).toBeUndefined();
    },
  );
});
