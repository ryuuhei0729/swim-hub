/**
 * Issue #49 QA テスト (Phase A スケルトン): 非泳者フィルタの単一定義元
 *
 * Sprint Contract 検証観点: [V-04]
 *
 * PM裁定(Issue #49 コメント):
 *   「生の members 配列をフィルタしてはならない。members は候補一覧だけでなく
 *    isAdmin 判定・既存行の名前解決にも共用されている。フィルタは候補提示の
 *    直前だけに適用する」
 * → フィルタ処理を1箇所 (このファイルが対象とする `apps/shared/utils/swimmerFilter.ts`)
 *   に集約し、Web/Mobile 双方の「候補提示の直前」だけがこれを呼ぶ設計にする。
 *   二重実装 (各画面が `.filter(m => m.is_swimmer !== false)` を独自に書く) を防ぐため、
 *   このユーティリティの純粋関数としての振る舞いを厳密に固定する。
 *
 * 契約 (Developer 実装対象、Phase A で QA が確定させた署名):
 *   export interface SwimmerAware { is_swimmer?: boolean | null }
 *   export function excludeNonSwimmers<T extends SwimmerAware>(members: readonly T[]): T[]
 *   export function selectNonSwimmers<T extends SwimmerAware>(members: readonly T[]): T[]
 *
 * 現時点 (Phase A) では `apps/shared/utils/swimmerFilter.ts` は存在しないため、
 * このファイルは import エラーで red になる。実装後に green になることを期待する。
 *
 * トートロジー回避: fixture の user_id は "swimmer-a" のような "swimmer" を含む文字列にせず、
 * 数値スタイルの一意な ID ("u1"〜"u4") にする。名前も部分文字列衝突が起きない値にする。
 * カウントは toHaveLength (厳密一致) で assert し、toContain 系の部分一致は使わない。
 */

import { describe, expect, it } from "vitest";
import { excludeNonSwimmers, selectNonSwimmers, type SwimmerAware } from "../../utils/swimmerFilter";

interface Fixture extends SwimmerAware {
  id: string;
}

const F = (id: string, is_swimmer?: boolean | null): Fixture => ({ id, is_swimmer });

describe("excludeNonSwimmers", () => {
  it("[V-04-01] is_swimmer=false の要素だけを除外する", () => {
    const members = [F("u1", true), F("u2", false), F("u3", true), F("u4", false)];

    const result = excludeNonSwimmers(members);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["u1", "u3"]);
  });

  it("[V-04-02] is_swimmer が undefined の要素は泳者として扱う (デフォルト true 相当)", () => {
    // ロールアウト直後、型は追従済みだがキャッシュ済みデータに is_swimmer が
    // まだ載っていないケースを模する。undefined を非泳者として消してはならない。
    const members = [F("u1", undefined), F("u2", false)];

    const result = excludeNonSwimmers(members);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("u1");
  });

  it("[V-04-03] is_swimmer が null の要素も泳者として扱う", () => {
    const members = [F("u1", null), F("u2", false)];

    const result = excludeNonSwimmers(members);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("u1");
  });

  it("[境界値] 空配列を渡すと空配列を返す", () => {
    expect(excludeNonSwimmers([])).toEqual([]);
  });

  it("[境界値] 全員が非泳者なら空配列を返す", () => {
    const members = [F("u1", false), F("u2", false)];
    expect(excludeNonSwimmers(members)).toEqual([]);
  });

  it("[境界値] 全員が泳者なら元の配列と同じ要素数・同じ順序を返す", () => {
    const members = [F("u1", true), F("u2", true), F("u3", true)];
    const result = excludeNonSwimmers(members);
    expect(result.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("元の配列を破壊的に変更しない (呼び出し元の生配列を書き換えない)", () => {
    const members = [F("u1", true), F("u2", false)];
    const snapshot = members.map((m) => ({ ...m }));

    excludeNonSwimmers(members);

    expect(members).toEqual(snapshot);
  });
});

describe("selectNonSwimmers", () => {
  it("[V-04-04] is_swimmer=false の要素だけを返す (非泳者トグル表示用)", () => {
    const members = [F("u1", true), F("u2", false), F("u3", false)];

    const result = selectNonSwimmers(members);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["u2", "u3"]);
  });

  it("[境界値] undefined/null は非泳者に含めない", () => {
    const members = [F("u1", undefined), F("u2", null), F("u3", false)];

    const result = selectNonSwimmers(members);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("u3");
  });

  it("excludeNonSwimmers と selectNonSwimmers は互いに排他的かつ網羅的である", () => {
    const members = [F("u1", true), F("u2", false), F("u3", undefined), F("u4", false)];

    const swimmers = excludeNonSwimmers(members);
    const nonSwimmers = selectNonSwimmers(members);

    expect(swimmers.length + nonSwimmers.length).toBe(members.length);
    const swimmerIds = new Set(swimmers.map((m) => m.id));
    const nonSwimmerIds = new Set(nonSwimmers.map((m) => m.id));
    for (const id of swimmerIds) {
      expect(nonSwimmerIds.has(id)).toBe(false);
    }
  });
});
