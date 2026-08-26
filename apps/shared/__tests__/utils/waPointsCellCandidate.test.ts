// =============================================================================
// waPointsCellCandidate.test.ts
// マイページ ベストタイム表「WAポイント」トグル機能 (Sprint Contract) 検証観点:
//
//   対象: apps/shared/utils/waPoints.ts に新設する薄いヘルパー
//     getBestWaPointsForCandidates(candidates, gender, styleKey, distance)
//   契約 (QA が定義した制約ハーネス。BestTimesTable.test.tsx の Phase B 実装ガイド):
//     - candidates は「1つの style/distance について、呼び出し側が既に非リレーに
//       絞り込んだ」候補配列 ({ time, poolType }[])。この関数自身はリレー除外を
//       行わない (D1: リレー除外は呼び出し側の責務。WaPointsCellCandidate 型に
//       isRelaying フィールドが存在しないことで構造的に強制する)
//     - candidates が空 → null
//     - 全 candidate が base time 不在 (getWaBaseTime が null を返す組合せ) → null
//     - base time がある candidate の中で「WA ポイントが最大」の1件を返す
//       (D2: 絶対タイムが最速ではなく、得点が最大の candidate を選ぶ)
//     - 既存 export (getWaBaseTime/calculateWaPoints/getMemberBestWaPoints/
//       rankMembersByWaPoints) のシグネチャ・挙動は変更しない
//
// 現時点で `getBestWaPointsForCandidates` は未実装のため、本テストは import
// 解決 or 型エラーで全滅する。これは意図的な「検出器」であり、Developer 実装後に
// green になることを Sprint Contract の完了条件とする (waPoints.test.ts と同方針)。
//
// 期待値は全て PM 確定の base time 実数値 + P=floor(1000*(B/T)^3) の数式から
// 独立に `node -e` で計算したハードコード値 (トートロジー回避)。
// 既存 apps/shared/__tests__/utils/waPoints.test.ts は変更しない (別ファイル)。
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  getBestWaPointsForCandidates,
  getWaBaseTime,
  type Gender,
  type WaPointsCellCandidate,
} from "../../utils/waPoints";

function candidate(overrides: Partial<WaPointsCellCandidate>): WaPointsCellCandidate {
  return {
    time: 100,
    poolType: 0,
    ...overrides,
  };
}

describe("[V-HELPER-01] getBestWaPointsForCandidates: 空配列", () => {
  it("candidates が空配列のとき null を返す", () => {
    expect(getBestWaPointsForCandidates([], 0, "Fr", 100)).toBeNull();
  });
});

describe("[V-HELPER-02] getBestWaPointsForCandidates: base time が無い組合せは除外される", () => {
  it("IM100×LCM(poolType=1) のみの candidate は null を返す (base time が公式に存在しない)", () => {
    const candidates: WaPointsCellCandidate[] = [candidate({ time: 56.0, poolType: 1 })];
    expect(getBestWaPointsForCandidates(candidates, 0, "IM", 100)).toBeNull();
  });

  it("IM100×LCM(base無し)とIM100×SCM(base有り)が混在する場合、base有りの方が採用される", () => {
    // SCM男子 IM100 base=49.28, T=49.28 → floor(1000*(49.28/49.28)^3) = 1000
    const candidates: WaPointsCellCandidate[] = [
      candidate({ time: 56.0, poolType: 1 }), // base無し → 除外される
      candidate({ time: 49.28, poolType: 0 }), // base=49.28
    ];
    const result = getBestWaPointsForCandidates(candidates, 0, "IM", 100);
    expect(result).not.toBeNull();
    expect(result?.points).toBe(1000);
    expect(result?.poolType).toBe(0);
    expect(result?.time).toBe(49.28);
  });
});

describe("[V-HELPER-03] getBestWaPointsForCandidates: 単一 candidate", () => {
  it("SCM 男子 Fr50, T=19.90 (=base) → 1000点", () => {
    const candidates: WaPointsCellCandidate[] = [candidate({ time: 19.9, poolType: 0 })];
    const result = getBestWaPointsForCandidates(candidates, 0, "Fr", 50);
    expect(result?.points).toBe(1000);
    expect(result?.time).toBe(19.9);
    expect(result?.poolType).toBe(0);
  });
});

describe("[V-HELPER-04] getBestWaPointsForCandidates: floor 丸めのpin (round実装への回帰検出)", () => {
  it("LCM 男子 Fr100, T=44.94 (base=46.40) → 1100 (raw=1100.66..., roundなら1101になり本テストが red になる)", () => {
    const candidates: WaPointsCellCandidate[] = [candidate({ time: 44.94, poolType: 1 })];
    const result = getBestWaPointsForCandidates(candidates, 0, "Fr", 100);
    expect(result?.points).toBe(1100);
  });
});

describe("[V-HELPER-05] getBestWaPointsForCandidates: D2 逆転ケース (最速タイムではなく最高得点を選ぶ)", () => {
  it("SCM(T=54.97,44.84 base)とLCM(T=55.50,46.40 base)混在時、タイムが遅いLCMのほうが高得点(584>542)なのでLCMが選ばれる", () => {
    // SCM: floor(1000*(44.84/54.97)^3) = 542 (絶対タイムはSCMのほうが速い)
    // LCM: floor(1000*(46.40/55.50)^3) = 584 (得点はLCMのほうが高い)
    const candidates: WaPointsCellCandidate[] = [
      candidate({ time: 54.97, poolType: 0 }), // SCM: 速いが低得点
      candidate({ time: 55.5, poolType: 1 }), // LCM: 遅いが高得点
    ];
    const result = getBestWaPointsForCandidates(candidates, 0, "Fr", 100);
    expect(result).not.toBeNull();
    expect(result?.points).toBe(584);
    expect(result?.poolType).toBe(1);
    expect(result?.time).toBe(55.5);
    // 542 (SCMの得点) ではないことも明示的に否定する
    expect(result?.points).not.toBe(542);
  });

  it("逆に候補が1件 (SCMのみ) の場合は542点のSCMがそのまま採用される (対照ケース)", () => {
    const candidates: WaPointsCellCandidate[] = [candidate({ time: 54.97, poolType: 0 })];
    const result = getBestWaPointsForCandidates(candidates, 0, "Fr", 100);
    expect(result?.points).toBe(542);
    expect(result?.poolType).toBe(0);
  });
});

describe("[V-HELPER-06] getBestWaPointsForCandidates: 性別分岐 (既存 getWaBaseTime への正しい委譲)", () => {
  it("SCM Fr100, T=50.00: 男性(base=44.84)→721点、女性(base=50.25)→1015点", () => {
    const candidates: WaPointsCellCandidate[] = [candidate({ time: 50.0, poolType: 0 })];
    const male = getBestWaPointsForCandidates(candidates, 0, "Fr", 100);
    const female = getBestWaPointsForCandidates(candidates, 1, "Fr", 100);
    expect(male?.points).toBe(721);
    expect(female?.points).toBe(1015);
    expect(male?.points).not.toBe(female?.points);
  });
});

describe("[V-HELPER-07] getBestWaPointsForCandidates: isRelaying フィールドが型に存在しないこと (D1の構造的強制)", () => {
  it("WaPointsCellCandidate は time/poolType のみで構成される (isRelaying を渡すと型エラーになるべき)", () => {
    // @ts-expect-error - WaPointsCellCandidate に isRelaying は存在しない (D1: リレー除外は呼び出し側の責務)。
    // このアサーションは tsc --noEmit (CI Audit) で検証される。将来 isRelaying が型に追加されると
    // ts-expect-error が「不要な指示」としてtscエラーになり、本ガードの破損を検出する。
    const withRelayingField: WaPointsCellCandidate = { time: 30.0, poolType: 0, isRelaying: true };
    expect(withRelayingField.time).toBe(30.0);
  });
});

describe("[V-HELPER-08] getWaBaseTime: 範囲外 gender に対する null フォールバック (load-bearing behavior)", () => {
  // 実測 (2026-08-26, node -e で BASE_TIME_TABLE 実装を直接実行して確認済み):
  //   getWaBaseTime(0, 2, "Fr", 100)         -> null
  //   getWaBaseTime(0, -1, "Fr", 100)        -> null
  //   getWaBaseTime(0, undefined, "Fr", 100) -> null
  //   getWaBaseTime(0, NaN, "Fr", 100)       -> null
  // BASE_TIME_TABLE のキーは `${poolType}_${gender}_${styleKey}_${distance}` の文字列連結であり、
  // gender が 0/1 以外だとテーブルに存在しないキーになり自動的に undefined -> null に変換される。
  // BestTimesTable.tsx の D3 ガード (`if (gender !== 0 && gender !== 1) return null`) が削除されても
  // この fallback が最終防御線になる。この fallback 自体が崩れる (null 以外を返す) と
  // WaPointsCellResult | null の契約が破れ、呼び出し側 (BestTimesTable, WaPointsCompareModal 等) の
  // 前提が総崩れになるため、ここで behavioral に pin する。
  it.each([
    ["gender=2 (範囲外・正の整数)", 2 as Gender],
    ["gender=-1 (範囲外・負の整数)", -1 as Gender],
    ["gender=undefined", undefined as unknown as Gender],
    ["gender=NaN", NaN as Gender],
  ])("%s のとき null を返す", (_label, gender) => {
    expect(getWaBaseTime(0, gender, "Fr", 100)).toBeNull();
  });
});

describe("[V-HELPER-09] getBestWaPointsForCandidates: 範囲外 gender は BestTimesTable の D3 ガードを経由しない直接経路でも null になる", () => {
  // getBestWaPointsForCandidates は BestTimesTable の D3 ガードの後段で呼ばれるだけでなく、
  // 前スプリントの WaPointsCompareModal 等からも直接呼ばれる。D3 ガードが存在しない呼び出し元でも
  // 範囲外 gender が安全に null に落ちることを直接 pin する (BestTimesTable のガードの有無に依存しない)。
  it.each([
    ["gender=2", 2 as Gender],
    ["gender=-1", -1 as Gender],
    ["gender=undefined", undefined as unknown as Gender],
    ["gender=NaN", NaN as Gender],
  ])("%s のとき候補が1件以上あっても null を返す", (_label, gender) => {
    const candidates: WaPointsCellCandidate[] = [candidate({ time: 50.0, poolType: 0 })];
    expect(getBestWaPointsForCandidates(candidates, gender, "Fr", 100)).toBeNull();
  });
});
