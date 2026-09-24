// =============================================================================
// teamRecordBulk.chunkIntoGroupedRows.test.ts
// [QA Sprint Contract Phase B] 種目一覧グリッドの「種目境界で改行する」仕様の検証
// =============================================================================
//
// `chunkIntoGroupedRows` (apps/mobile/screens/teamRecordBulk/styleListCards.ts) を
// 実物 import して直接呼び出す純粋関数テスト。
//
// 既存の teamRecordBulk.styleListGrid.test.tsx は DUMMY_22_STYLES 全件の
// `style` フィールドを空文字に揃えているため (localizedStyleName の name_jp
// フォールバックを効かせるための意図的な設計)、22件すべてが同一グループキーになり
// 「種目境界で改行される」という最重要の仕様がそのテストファイルでは一度も
// 検証されていない。ここで純粋関数レベルから直接埋める。
// =============================================================================

import { describe, it, expect } from "vitest";
import { chunkIntoGroupedRows } from "../teamRecordBulk/styleListCards";

describe("[V-06a] chunkIntoGroupedRows: 種目境界で改行する", () => {
  it("同一グループが rowSize の倍数なら、境界でも空行を挟まずちょうど詰まった行が続く", () => {
    // 自由形6種目 (id 1-6) → 平泳ぎ1種目 (id 7) を模す
    const items = [
      { id: 1, group: "Fr" },
      { id: 2, group: "Fr" },
      { id: 3, group: "Fr" },
      { id: 4, group: "Fr" },
      { id: 5, group: "Fr" },
      { id: 6, group: "Fr" },
      { id: 7, group: "Br" },
    ];

    const rows = chunkIntoGroupedRows(items, (i) => i.group, 3);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(rows[1]?.map((i) => i.id)).toEqual([4, 5, 6]);
    // 平泳ぎは自由形の行が偶然ちょうど埋まっていても、必ず新しい行から始まる
    expect(rows[2]?.map((i) => i.id)).toEqual([7]);
  });

  it("[最重要] 前グループの行が rowSize 未満で終わっても、次グループは同じ行に詰め込まれず新しい行から始まる", () => {
    // 自由形5種目 (3+2で終わる半端な行) → 平泳ぎ2種目
    const items = [
      { id: 1, group: "Fr" },
      { id: 2, group: "Fr" },
      { id: 3, group: "Fr" },
      { id: 4, group: "Fr" },
      { id: 5, group: "Fr" },
      { id: 6, group: "Br" },
      { id: 7, group: "Br" },
    ];

    const rows = chunkIntoGroupedRows(items, (i) => i.group, 3);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.map((i) => i.id)).toEqual([1, 2, 3]);
    // 自由形の残り2件だけの行 (3個埋まっていないのに次の平泳ぎを混ぜない)
    expect(rows[1]?.map((i) => i.id)).toEqual([4, 5]);
    expect(rows[2]?.map((i) => i.id)).toEqual([6, 7]);
  });

  it("グループが3種類以上でも、各グループ境界ごとに新しい行が始まる (自由形→平泳ぎ→背泳ぎ)", () => {
    const items = [
      { id: 1, group: "Fr" },
      { id: 2, group: "Fr" },
      { id: 3, group: "Br" },
      { id: 4, group: "Ba" },
      { id: 5, group: "Ba" },
    ];

    const rows = chunkIntoGroupedRows(items, (i) => i.group, 3);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.map((i) => i.id)).toEqual([1, 2]);
    expect(rows[1]?.map((i) => i.id)).toEqual([3]);
    expect(rows[2]?.map((i) => i.id)).toEqual([4, 5]);
  });

  it("同一グループが rowSize を超える場合は、グループ内では通常どおり rowSize ごとに改行する", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, group: "Fr" }));

    const rows = chunkIntoGroupedRows(items, (i) => i.group, 3);

    expect(rows.map((r) => r.map((i) => i.id))).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it("空配列を渡すと空行配列を返す (0カード大会でもクラッシュしない)", () => {
    expect(chunkIntoGroupedRows([], (i: { group: string }) => i.group, 3)).toEqual([]);
  });

  it("要素が1件だけなら1行1件になる", () => {
    const rows = chunkIntoGroupedRows([{ id: 1, group: "Fr" }], (i) => i.group, 3);
    expect(rows).toEqual([[{ id: 1, group: "Fr" }]]);
  });

  it("リレー種目 (relayKind: free→medley) でも同じロジックで境界改行される", () => {
    const items = [
      { id: "relay_4x25_free", relayKind: "free" },
      { id: "relay_4x50_free", relayKind: "free" },
      { id: "relay_4x100_free", relayKind: "free" },
      { id: "relay_4x200_free", relayKind: "free" },
      { id: "relay_4x25_medley", relayKind: "medley" },
      { id: "relay_4x50_medley", relayKind: "medley" },
      { id: "relay_4x100_medley", relayKind: "medley" },
    ];

    const rows = chunkIntoGroupedRows(items, (i) => i.relayKind, 3);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.map((i) => i.id)).toEqual([
      "relay_4x25_free",
      "relay_4x50_free",
      "relay_4x100_free",
    ]);
    // free の4件目 (relay_4x200_free) は3個埋まった直後のグループ内改行 (行が満杯)
    expect(rows[1]?.map((i) => i.id)).toEqual(["relay_4x200_free"]);
    // medley はグループ境界のため、free の残り1枠があっても混ざらず新しい行
    expect(rows[2]?.map((i) => i.id)).toEqual([
      "relay_4x25_medley",
      "relay_4x50_medley",
      "relay_4x100_medley",
    ]);
  });
});
