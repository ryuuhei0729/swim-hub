/**
 * findLinkedRowDraftId — 双方向リンク (エントリー行 ⇔ レコード行) の相手行を
 * styleId で突き合わせる純粋関数 単体テスト (mobile)
 *
 * 背景 (Reviewer 検出 Critical・PM 実測確認済み):
 *   CompetitionTabFormScreen の双方向リンク4ハンドラ (handleEntryStyleChange /
 *   handleEntryToggleRelaying / handleRecordStyleChange / handleRecordToggleRelaying) は
 *   配列インデックスで相手行を決め打ちしていた。mergeEntriesIntoRecords の自動引き継ぎは
 *   「追加のみで削除しない」ため、エントリー行を削除すると entries/records の行数・並び順が
 *   ずれる。この状態で片方の行を編集すると、居残っていた無関係な行が index 経由で誤って
 *   ペアにされ、styleId が黙って上書きされていた。
 *
 * テスト対象:
 *   findLinkedRowDraftId(sourceRows, sourceDraftId, targetRows) (apps/mobile/utils/tabFormUtils.ts)
 *
 * 注意:
 *   - このテストは実装をローカルに再定義しない。期待値はすべて仕様 (関数コメント) から
 *     手で記述する。
 *   - 呼び出し側は必ず「変更前」の sourceRows/targetRows を渡す。この関数自体は
 *     引数をそのまま突き合わせるだけで、呼び出し順序の妥当性までは検証しない
 *     (それは画面レベルテスト側の責務)。
 */

import { describe, it, expect } from "vitest";
import { findLinkedRowDraftId } from "../tabFormUtils";
import type { StyleLinkableRow } from "../tabFormUtils";

function row(draftId: string, styleId: string): StyleLinkableRow {
  return { draftId, styleId };
}

describe("findLinkedRowDraftId — 通常ケース (mobile)", () => {
  it("sourceDraftId で引いた行の styleId と一致する target 行が1件だけ存在する → その draftId を返す", () => {
    const sourceRows = [row("entry-1", "10"), row("entry-2", "20")];
    const targetRows = [row("record-1", "10"), row("record-2", "20")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBe("record-1");
    expect(findLinkedRowDraftId(sourceRows, "entry-2", targetRows)).toBe("record-2");
  });
});

describe("findLinkedRowDraftId — 見つからないケース (mobile)", () => {
  it("sourceDraftId が sourceRows に存在しない → undefined", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-1", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-missing", targetRows)).toBeUndefined();
  });

  it("source 行の styleId が空文字 (未選択) → undefined (空文字同士を誤って一致させない)", () => {
    const sourceRows = [row("entry-1", "")];
    const targetRows = [row("record-1", ""), row("record-2", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBeUndefined();
  });

  it("target に一致する styleId の行が存在しない (レコード行がエントリー由来でない等) → undefined", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-1", "20"), row("record-2", "30")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBeUndefined();
  });

  it("targetRows が空配列 → undefined", () => {
    const sourceRows = [row("entry-1", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", [])).toBeUndefined();
  });
});

describe("findLinkedRowDraftId — styleId 重複ケース (mobile・仕様変更: 2件以上の一致は undefined)", () => {
  // 仕様変更 (今回のスプリント): target 側に同じ styleId の行が複数あるとき、
  // 「どちらが本来のペアか」はデータ上区別がつかない。旧実装は配列順で最初の1件を
  // 機械的に選んでいたが、これはユーザーが2つの entry 行を別々に編集しているつもりでも
  // 常に同一の record 行だけが後勝ちで上書きされ続ける事故を招く。「一致件数が2件以上
  // なら undefined (相手を持たない)」に倒すことで、呼び出し側は相手行を更新しないだけに
  // なり、無関係な行が黙って書き換わることがなくなった (関数コメント参照)。
  it("target に同じ styleId の行が2件存在する → undefined (最初の1件を選ばない)", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-1", "10"), row("record-2", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBeUndefined();
  });

  it("targetRows の並び順を変えても (同じ styleId 2件の重複) 依然として undefined", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-2", "10"), row("record-1", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBeUndefined();
  });

  it("target に同じ styleId の行が3件以上存在する → undefined", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-1", "10"), row("record-2", "10"), row("record-3", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBeUndefined();
  });

  it("target 側の重複が無関係な styleId 混在でも一致件数だけで判定する (一致2件+不一致1件 → undefined)", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-1", "10"), row("record-2", "20"), row("record-3", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBeUndefined();
  });

  it("target に一致する styleId の行がちょうど1件だけなら (重複が無ければ) 引き続きその draftId を返す (緩めすぎ検出)", () => {
    const sourceRows = [row("entry-1", "10")];
    const targetRows = [row("record-1", "10"), row("record-2", "20"), row("record-3", "30")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBe("record-1");
  });

  it("sourceRows 側に同じ styleId の行が複数あっても、sourceDraftId で一意に引けるため影響しない (target は1件一致)", () => {
    const sourceRows = [row("entry-1", "10"), row("entry-2", "10")];
    const targetRows = [row("record-1", "10")];

    expect(findLinkedRowDraftId(sourceRows, "entry-1", targetRows)).toBe("record-1");
    expect(findLinkedRowDraftId(sourceRows, "entry-2", targetRows)).toBe("record-1");
  });
});

describe("findLinkedRowDraftId — 破壊的変更が無いこと (mobile)", () => {
  it("sourceRows/targetRows の元の配列を変更しない (参照・要素とも不変)", () => {
    const sourceRows = [row("entry-1", "10"), row("entry-2", "20")];
    const targetRows = [row("record-1", "10"), row("record-2", "20")];
    const sourceRowsSnapshot = sourceRows.map((r) => ({ ...r }));
    const targetRowsSnapshot = targetRows.map((r) => ({ ...r }));

    findLinkedRowDraftId(sourceRows, "entry-1", targetRows);

    expect(sourceRows).toEqual(sourceRowsSnapshot);
    expect(targetRows).toEqual(targetRowsSnapshot);
    expect(sourceRows).toHaveLength(2);
    expect(targetRows).toHaveLength(2);
  });
});
