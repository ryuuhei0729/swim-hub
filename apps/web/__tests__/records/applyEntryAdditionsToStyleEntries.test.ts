/**
 * applyEntryAdditionsToStyleEntries (web) — エントリー追加計画を StyleEntry[] に反映する
 * ロジックの単体テスト。
 *
 * Sprint Contract 検証観点:
 *   [仕様#1] entry_time は MemberRecord.entryTimeReference (参考表示専用) にのみ格納され、
 *     time / timeDisplayValue (記録タイム入力欄) には絶対に入らない。
 *   [仕様#2] 追加先が既存の非リレー StyleEntry なら追記、無ければ新規 StyleEntry を作る。
 *   [仕様#4] エントリーに無い選手・種目を自由に追加できる前提として、エントリー由来行が
 *     1件でも追加された場合は種目未選択のプレースホルダー行が除去される
 *     (プレースホルダーと追加行が並存して混乱するのを防ぐ)。
 *
 * トートロジー防止メモ: 実装をコピーせず、期待される MemberRecord/StyleEntry の
 * 形を手計算で固定する。
 */

import { describe, expect, it } from "vitest";
import {
  applyEntryAdditionsToStyleEntries,
  type StyleEntry,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";
import type { EntryAdditionPlan } from "@apps/shared/utils/entryRecordMerge";

function makePlan(overrides: Partial<EntryAdditionPlan> & { entry: EntryAdditionPlan["entry"] }): EntryAdditionPlan {
  return {
    targetStyleEntryId: null,
    styleId: 2,
    styleName: "自由形50m",
    ...overrides,
  };
}

describe("applyEntryAdditionsToStyleEntries", () => {
  it("plans が空なら styleEntries をそのまま返す (参照も変えない)", () => {
    const base: StyleEntry[] = [{ id: "1", styleId: "", styleName: "", memberRecords: [] }];
    expect(applyEntryAdditionsToStyleEntries(base, [])).toBe(base);
  });

  it(
    "targetStyleEntryId が null の計画は新規 StyleEntry として追加され、" +
      "entry_time は time ではなく entryTimeReference にのみ入る (仕様#1)",
    () => {
      const base: StyleEntry[] = [{ id: "1", styleId: "", styleName: "", memberRecords: [] }];
      const plans: EntryAdditionPlan[] = [
        makePlan({
          entry: { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 27.5, note: null, userName: "太郎" },
        }),
      ];

      const result = applyEntryAdditionsToStyleEntries(base, plans);

      expect(result).toHaveLength(1);
      const mr = result[0].memberRecords[0];
      expect(mr.memberUserId).toBe("user-1");
      expect(mr.memberName).toBe("太郎");
      expect(mr.entryTimeReference).toBe(27.5);
      expect(mr.time).toBe(0);
      expect(mr.timeDisplayValue).toBe("");
    },
  );

  it(
    "種目未選択のプレースホルダー行 (styleId===\"\" かつ memberRecords が空) は、" +
      "エントリー由来行が追加されると取り除かれる (人間の意図: 空行と新規行が" +
      "並存してユーザーを混乱させない)",
    () => {
      const base: StyleEntry[] = [{ id: "1", styleId: "", styleName: "", memberRecords: [] }];
      const plans: EntryAdditionPlan[] = [
        makePlan({
          entry: { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: null, note: null, userName: "太郎" },
        }),
      ];

      const result = applyEntryAdditionsToStyleEntries(base, plans);

      expect(result.find((e) => e.styleId === "" && e.memberRecords.length === 0)).toBeUndefined();
    },
  );

  it(
    "targetStyleEntryId が既存 StyleEntry を指す場合、その StyleEntry の memberRecords 末尾に" +
      "追記され、他の既存 memberRecords は変更されない",
    () => {
      const base: StyleEntry[] = [
        {
          id: "style-2",
          styleId: 2,
          styleName: "自由形50m",
          memberRecords: [
            {
              id: "record-1",
              memberUserId: "user-existing",
              memberName: "既存選手",
              time: 30.0,
              timeDisplayValue: "30.00",
              reactionTime: "",
              isRelaying: false,
              note: "",
              splitTimes: [],
            },
          ],
        },
      ];
      const plans: EntryAdditionPlan[] = [
        makePlan({
          targetStyleEntryId: "style-2",
          entry: { id: "entry-1", user_id: "user-new", style_id: 2, entry_time: 31.2, note: null, userName: "新規選手" },
        }),
      ];

      const result = applyEntryAdditionsToStyleEntries(base, plans);

      expect(result).toHaveLength(1);
      expect(result[0].memberRecords).toHaveLength(2);
      expect(result[0].memberRecords[0].memberUserId).toBe("user-existing");
      expect(result[0].memberRecords[0].time).toBe(30.0); // 既存行は変更されない
      expect(result[0].memberRecords[1].memberUserId).toBe("user-new");
      expect(result[0].memberRecords[1].time).toBe(0);
      expect(result[0].memberRecords[1].entryTimeReference).toBe(31.2);
    },
  );

  it(
    "リレー StyleEntry (relayEventId 有り) はエントリー追加の対象にならず、" +
      "その memberRecords 件数・内容は一切変化しない (仕様#2 リレー不可侵)",
    () => {
      const relayEntry: StyleEntry = {
        id: "relay-1",
        styleId: 2,
        styleName: "",
        relayEventId: "relay_4x50_free",
        memberRecords: [
          { id: "r0", memberUserId: "user-a", memberName: "A", time: 27.5, timeDisplayValue: "27.50", reactionTime: "", isRelaying: false, note: "", splitTimes: [] },
          { id: "r1", memberUserId: "user-b", memberName: "B", time: 28.7, timeDisplayValue: "28.70", reactionTime: "", isRelaying: true, note: "", splitTimes: [] },
          { id: "r2", memberUserId: "user-c", memberName: "C", time: 28.3, timeDisplayValue: "28.30", reactionTime: "", isRelaying: true, note: "", splitTimes: [] },
          { id: "r3", memberUserId: "user-d", memberName: "D", time: 27.6, timeDisplayValue: "27.60", reactionTime: "", isRelaying: true, note: "", splitTimes: [] },
        ],
      };
      const base: StyleEntry[] = [relayEntry];
      // planEntryAdditionsForRecords は targetStyleEntryId: null を返す設計だが、
      // ここでは applyEntryAdditionsToStyleEntries 単体の防御も直接確認する
      const plans: EntryAdditionPlan[] = [
        makePlan({
          targetStyleEntryId: null,
          entry: { id: "entry-1", user_id: "user-e", style_id: 2, entry_time: 29.0, note: null, userName: "E" },
        }),
      ];

      const result = applyEntryAdditionsToStyleEntries(base, plans);

      const untouchedRelay = result.find((e) => e.id === "relay-1")!;
      expect(untouchedRelay.memberRecords).toHaveLength(4);
      expect(untouchedRelay.memberRecords.map((mr) => mr.memberUserId)).toEqual([
        "user-a",
        "user-b",
        "user-c",
        "user-d",
      ]);
      // 新規追加は別の StyleEntry として作られる (リレーには絶対に混入しない)
      expect(result).toHaveLength(2);
    },
  );

  it("既存 StyleEntry の並び順は維持され、新規追加分は末尾に付く", () => {
    const base: StyleEntry[] = [
      { id: "style-2", styleId: 2, styleName: "自由形50m", memberRecords: [{ id: "r0", memberUserId: "user-a", memberName: "A", time: 30, timeDisplayValue: "30.00", reactionTime: "", isRelaying: false, note: "", splitTimes: [] }] },
      { id: "style-9", styleId: 9, styleName: "平泳ぎ50m", memberRecords: [{ id: "r1", memberUserId: "user-b", memberName: "B", time: 35, timeDisplayValue: "35.00", reactionTime: "", isRelaying: false, note: "", splitTimes: [] }] },
    ];
    const plans: EntryAdditionPlan[] = [
      makePlan({
        styleId: 100,
        styleName: "新種目",
        entry: { id: "entry-1", user_id: "user-c", style_id: 100, entry_time: 40, note: null, userName: "C" },
      }),
    ];

    const result = applyEntryAdditionsToStyleEntries(base, plans);

    expect(result.map((e) => e.id)).toEqual(["style-2", "style-9", "entry-style-100"]);
  });
});
