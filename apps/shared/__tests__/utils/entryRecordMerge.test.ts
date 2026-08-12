/**
 * entryRecordMerge.ts — 記録入力画面へのエントリー初期反映ロジックの単体テスト
 *
 * Sprint Contract 検証観点:
 *   [仕様#1] entries.entry_time は records.time (記録タイム入力欄) には絶対に使わない。
 *     参考表示専用のフィールドとして呼び出し側 (UI層) にそのまま透過するだけであること。
 *   [仕様#2] 既存記録を優先し、不足分だけエントリーから追加する。
 *     (user_id, style_id) の組で重複排除し、既存記録がある組にはエントリー行を足さない。
 *   [仕様#2 リレー不可侵] リレーとして検出された StyleEntry (relayEventId が truthy) は
 *     重複排除の材料にも追加先候補にも一切使わない。
 *
 * トートロジー防止メモ: 実装をコピーした assertion ではなく、期待される
 * (targetStyleEntryId, styleId, entry) の組み合わせを手計算で固定して検証する。
 */

import { describe, expect, it } from "vitest";
import {
  planEntryAdditionsForRecords,
  type EntryRowForRecordMerge,
  type ExistingStyleEntryForMerge,
  type StyleLookup,
} from "../../utils/entryRecordMerge";

const STYLES: StyleLookup[] = [
  { id: 2, name_jp: "自由形50m" },
  { id: 9, name_jp: "平泳ぎ50m" },
];

function makeEntry(overrides: Partial<EntryRowForRecordMerge> & { user_id: string; style_id: number }): EntryRowForRecordMerge {
  return {
    id: `entry-${overrides.user_id}-${overrides.style_id}`,
    entry_time: 30.0,
    note: null,
    userName: "選手",
    ...overrides,
  };
}

describe("planEntryAdditionsForRecords", () => {
  it("既存 StyleEntry が無い種目のエントリーは新規 StyleEntry 候補 (targetStyleEntryId: null) になる", () => {
    const entries = [makeEntry({ user_id: "user-1", style_id: 2, userName: "太郎" })];
    const plans = planEntryAdditionsForRecords(entries, [], STYLES);

    expect(plans).toHaveLength(1);
    expect(plans[0].targetStyleEntryId).toBeNull();
    expect(plans[0].styleId).toBe(2);
    expect(plans[0].styleName).toBe("自由形50m");
    expect(plans[0].entry.userName).toBe("太郎");
  });

  it(
    "同じ style_id の非リレー StyleEntry が既に存在する場合、その StyleEntry.id が" +
      "targetStyleEntryId になる (人間の意図: 種目カードを増やさず既存カードに追記する)",
    () => {
      const existing: ExistingStyleEntryForMerge[] = [
        { id: "style-2", styleId: 2, memberRecords: [{ memberUserId: "user-9" }] },
      ];
      const entries = [makeEntry({ user_id: "user-1", style_id: 2 })];

      const plans = planEntryAdditionsForRecords(entries, existing, STYLES);

      expect(plans).toHaveLength(1);
      expect(plans[0].targetStyleEntryId).toBe("style-2");
    },
  );

  it(
    "(user_id, style_id) の組が既存 StyleEntry の memberRecords に既にある場合、" +
      "そのエントリー行は追加対象から除外される (仕様#2: 既存記録がある組には足さない)",
    () => {
      const existing: ExistingStyleEntryForMerge[] = [
        { id: "style-2", styleId: 2, memberRecords: [{ memberUserId: "user-1" }] },
      ];
      const entries = [
        makeEntry({ user_id: "user-1", style_id: 2 }), // 既存記録あり → 除外
        makeEntry({ user_id: "user-2", style_id: 2 }), // 既存記録なし → 追加対象
      ];

      const plans = planEntryAdditionsForRecords(entries, existing, STYLES);

      expect(plans).toHaveLength(1);
      expect(plans[0].entry.user_id).toBe("user-2");
    },
  );

  it(
    "entries 内で同じ (user_id, style_id) が重複していても1件しか追加しない" +
      "(仕様#2: 重複排除)",
    () => {
      const entries = [
        makeEntry({ id: "e1", user_id: "user-1", style_id: 2 }),
        makeEntry({ id: "e2", user_id: "user-1", style_id: 2 }),
      ];

      const plans = planEntryAdditionsForRecords(entries, [], STYLES);

      expect(plans).toHaveLength(1);
      expect(plans[0].entry.id).toBe("e1");
    },
  );

  it(
    "リレーとして検出済みの StyleEntry (relayEventId が truthy) は、同じ style_id の" +
      "エントリー行の追加先候補にならない (常に新規 StyleEntry 扱いになる)" +
      "(仕様#2 リレー不可侵: 4レグ構造を壊してはならない)",
    () => {
      const existing: ExistingStyleEntryForMerge[] = [
        {
          id: "relay-1",
          styleId: 2,
          relayEventId: "relay_4x50_free",
          memberRecords: [
            { memberUserId: "user-a" },
            { memberUserId: "user-b" },
            { memberUserId: "user-c" },
            { memberUserId: "user-d" },
          ],
        },
      ];
      const entries = [makeEntry({ user_id: "user-1", style_id: 2 })];

      const plans = planEntryAdditionsForRecords(entries, existing, STYLES);

      expect(plans).toHaveLength(1);
      expect(plans[0].targetStyleEntryId).toBeNull(); // relay-1 には絶対に紐付かない
    },
  );

  it(
    "リレー内の選手 (user_id, style_id) と同じ組のエントリー行も、リレー StyleEntry の" +
      "memberRecords が重複排除の材料から除外されているため『既存記録あり』とは" +
      "判定されず、新規 StyleEntry 候補として残る" +
      "【PM裁定 2026-08-12: これは意図通りの正しい挙動であり『重複』ではない】" +
      "リレーのレグとして泳いだ種目 (例: 100m Fr) と、個人種目としてエントリーした" +
      "同じ種目 (100m Fr) は別のレースである。まとめて1行に統合したり、個人種目の" +
      "エントリー行を出さない設計にすると、むしろ個人種目の記録入力漏れを生む。" +
      "よってリレーの一員である選手が entries にも同じ種目でエントリーしていた場合、" +
      "個人記録カードが別途1枚追加されるのが正しい仕様である。後任がこれを" +
      "『重複バグ』と誤認してロジックを変更しないよう、このテストで固定する)",
    () => {
      const existing: ExistingStyleEntryForMerge[] = [
        {
          id: "relay-1",
          styleId: 2,
          relayEventId: "relay_4x50_free",
          memberRecords: [{ memberUserId: "user-a" }],
        },
      ];
      const entries = [makeEntry({ user_id: "user-a", style_id: 2 })];

      const plans = planEntryAdditionsForRecords(entries, existing, STYLES);

      expect(plans).toHaveLength(1);
      expect(plans[0].entry.user_id).toBe("user-a");
      expect(plans[0].targetStyleEntryId).toBeNull();
    },
  );

  it(
    "種目未選択のプレースホルダー StyleEntry (styleId === \"\") は追加先候補にならない",
    () => {
      const existing: ExistingStyleEntryForMerge[] = [
        { id: "placeholder-1", styleId: "", memberRecords: [] },
      ];
      const entries = [makeEntry({ user_id: "user-1", style_id: 2 })];

      const plans = planEntryAdditionsForRecords(entries, existing, STYLES);

      expect(plans).toHaveLength(1);
      expect(plans[0].targetStyleEntryId).toBeNull();
    },
  );

  it(
    "同一選手が複数種目にエントリーしている場合、それぞれ別の styleId を持つ" +
      "追加計画として分散して返される (人間の意図: 1人が複数種目にエントリーしても" +
      "1つの StyleEntry に押し込められてはならない)",
    () => {
      const entries = [
        makeEntry({ user_id: "user-1", style_id: 2 }),
        makeEntry({ user_id: "user-1", style_id: 9 }),
      ];

      const plans = planEntryAdditionsForRecords(entries, [], STYLES);

      expect(plans).toHaveLength(2);
      expect(plans.map((p) => p.styleId).sort()).toEqual([2, 9]);
    },
  );

  it(
    "entry_time は plan.entry.entry_time としてそのまま透過されるだけで、" +
      "他のフィールド (time 等) に変換・混入されない (仕様#1: 記録タイム入力欄には" +
      "絶対に使わない、という契約を型レベルで保証する設計の確認)",
    () => {
      const entries = [makeEntry({ user_id: "user-1", style_id: 2, entry_time: 83.45 })];
      const plans = planEntryAdditionsForRecords(entries, [], STYLES);

      expect(plans[0].entry.entry_time).toBe(83.45);
      // EntryAdditionPlan には entry_time を time として解釈するフィールドが存在しない
      // (plan オブジェクトのキーが targetStyleEntryId/styleId/styleName/entry のみ)
      expect(Object.keys(plans[0]).sort()).toEqual(
        ["entry", "styleId", "styleName", "targetStyleEntryId"].sort(),
      );
    },
  );

  it("styles に存在しない style_id の場合、styleName は空文字にフォールバックする", () => {
    const entries = [makeEntry({ user_id: "user-1", style_id: 999 })];
    const plans = planEntryAdditionsForRecords(entries, [], STYLES);

    expect(plans[0].styleName).toBe("");
  });

  it("entries が空配列なら追加計画も空配列になる (エントリー0件の大会)", () => {
    const plans = planEntryAdditionsForRecords([], [], STYLES);
    expect(plans).toEqual([]);
  });
});
