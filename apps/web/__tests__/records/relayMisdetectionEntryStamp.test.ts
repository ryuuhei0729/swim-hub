/**
 * relayMisdetectionEntryStamp.test.ts
 *
 * Reviewer 指摘 (Warning・回帰テストとして記録): buildStyleEntriesFromExisting の
 * リレー検出は「is_relaying が [false, true, true, true] の4件連続パターン」に
 * 厳密依存している (Phase 1/2/4)。3件や5件の is_relaying=true レコードが混在すると
 * relayEventId が付与されず、通常の非リレー StyleEntry として style_id 単位で
 * グループ化される。
 *
 * この既存の脆弱性自体は今回のスコープ外 (PM 裁定済み・buildStyleEntries.test.ts
 * 36テストのシグネチャを凍結する方針)。しかし今回追加した
 * stampExistingEntryTimeReferences (修正3) は「relayEventId の有無」だけを
 * 安全境界として信頼しているため、誤検出で relayEventId が付かなかった
 * 「実質リレーのレグ記録」グループに、同一 (user_id, style_id) の個人エントリーが
 * 存在すると、リレーのレグ入力欄に無関係な個人エントリーの申告タイムが
 * 誤ってスタンプされる (データ破壊ではなく表示上の誤帰属)。
 *
 * このテストは上記の現状の挙動をそのまま可視化して固定するものであり、
 * 修正を要求するものではない (修正は別スプリント)。将来 buildStyleEntriesFromExisting
 * のリレー検出ロジックが改善された場合、このテストの前提 (誤検出が起きること)
 * ごと見直しが必要になる。
 */

import { describe, expect, it } from "vitest";
import {
  buildStyleEntriesFromExisting,
  stampExistingEntryTimeReferences,
  type ExistingRecord,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";
import {
  buildEntryTimeReferenceLookup,
  type EntryRowForRecordMerge,
} from "@apps/shared/utils/entryRecordMerge";

const STYLES = [{ id: 2, name_jp: "自由形50m", distance: 50 }];

function makeEntry(overrides: Partial<EntryRowForRecordMerge> & { user_id: string; style_id: number }): EntryRowForRecordMerge {
  return {
    id: `entry-${overrides.user_id}-${overrides.style_id}`,
    entry_time: 90.0,
    note: null,
    userName: "選手",
    ...overrides,
  };
}

describe("[Reviewer回帰・修正はスコープ外] リレー誤検出と entryTimeReference スタンプの相互作用", () => {
  it(
    "is_relaying=[false,true,true] (3件、4件連続パターンに満たない) の場合、" +
      "relayEventId が付与されず通常の非リレー StyleEntry になる" +
      "(人間の意図: 既存のリレー検出ロジックの前提を確認する。この前提が崩れると" +
      "以降のテストの意味が変わるため先に固定する)",
    () => {
      const records: ExistingRecord[] = [
        { id: "r0", user_id: "user-a", style_id: 2, time: 27.5, is_relaying: false, reaction_time: null, note: null, split_times: [], users: { id: "user-a", name: "太郎" } },
        { id: "r1", user_id: "user-b", style_id: 2, time: 28.7, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-b", name: "次郎" } },
        { id: "r2", user_id: "user-c", style_id: 2, time: 28.3, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-c", name: "三郎" } },
      ];

      const result = buildStyleEntriesFromExisting(records, STYLES);

      expect(result).toHaveLength(1);
      expect(result[0].relayEventId).toBeUndefined();
      expect(result[0].memberRecords).toHaveLength(3);
    },
  );

  it(
    "【現状の挙動を固定・修正はスコープ外】4連続パターンから外れて relayEventId が" +
      "付かなかった『実質リレーのレグ記録』に対し、そのレグの (user_id, style_id) と" +
      "一致する個人エントリーが存在すると、そのレグの記録行に entryTimeReference が" +
      "誤ってスタンプされる (人間の意図: stampExistingEntryTimeReferences は" +
      "relayEventId の有無だけを安全境界として信頼しているため、リレー検出ロジック側の" +
      "既知の脆弱性 [4連続依存] がこの経路に波及することをテストで可視化する。" +
      "データの破壊ではなく表示上の誤帰属である点も明記する)",
    () => {
      // is_relaying=[false,true,true] の3件 → 4連続パターンに満たず誤検出でリレー扱いされない
      const records: ExistingRecord[] = [
        { id: "r0", user_id: "user-a", style_id: 2, time: 27.5, is_relaying: false, reaction_time: null, note: null, split_times: [], users: { id: "user-a", name: "太郎" } },
        { id: "r1", user_id: "user-b", style_id: 2, time: 28.7, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-b", name: "次郎" } },
        { id: "r2", user_id: "user-c", style_id: 2, time: 28.3, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-c", name: "三郎" } },
      ];
      const baseStyleEntries = buildStyleEntriesFromExisting(records, STYLES);
      // 前提: 誤検出により relayEventId が付いていない
      expect(baseStyleEntries[0].relayEventId).toBeUndefined();

      // user-b の (user_id, style_id) に一致する「無関係な個人エントリー」が存在する
      // (本来は user-b が単独でエントリーした別の申告タイムのつもりだが、
      // user-b は実際には上記のリレーのレグを泳いだ選手でもある、という想定)
      const entries = [makeEntry({ user_id: "user-b", style_id: 2, entry_time: 99.99 })];
      const lookup = buildEntryTimeReferenceLookup(entries);

      const stamped = stampExistingEntryTimeReferences(baseStyleEntries, lookup);

      const legRecordForUserB = stamped[0].memberRecords.find((mr) => mr.memberUserId === "user-b")!;
      // 【現状の挙動】無関係な個人エントリーの申告タイム (99.99) がレグ記録に紛れ込む
      expect(legRecordForUserB.entryTimeReference).toBe(99.99);
      // レグの結果タイム (28.7) 自体は上書きされていない (表示上の誤帰属に留まる)
      expect(legRecordForUserB.time).toBe(28.7);

      // 対照: is_relaying パターンが完全一致し正しくリレー検出された場合は、
      // 同じ状況でもスタンプされない (relayEventId が安全境界として機能する)
      const correctlyDetectedRecords: ExistingRecord[] = [
        ...records,
        { id: "r3", user_id: "user-d", style_id: 2, time: 27.6, is_relaying: true, reaction_time: null, note: null, split_times: [], users: { id: "user-d", name: "四郎" } },
      ];
      const correctBase = buildStyleEntriesFromExisting(correctlyDetectedRecords, STYLES);
      expect(correctBase[0].relayEventId).toBeDefined(); // 4件連続で正しく検出される

      const correctStamped = stampExistingEntryTimeReferences(correctBase, lookup);
      const correctLegForUserB = correctStamped[0].memberRecords.find(
        (mr) => mr.memberUserId === "user-b",
      )!;
      expect(correctLegForUserB.entryTimeReference).toBeUndefined();
    },
  );
});
