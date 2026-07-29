/**
 * bestTimeSelection テスト (Sprint Contract Phase A スケルトン → Phase B 本実装用)
 *
 * 対象: `utils/bestTimeSelection.ts`（未実装。T-4 の実装で新設される想定）
 *   TeamMemberList.tsx の `getBestTime` に埋め込まれているベストタイム選択ロジックを
 *   純粋関数として切り出すための契約(web `useMemberBestTimes.ts:270-337` の
 *   `getBestTimeForMember` と同一の意味論):
 *
 *   export interface BestTimeCandidate {
 *     id: string;
 *     time: number;      // 秒
 *     poolType: 0 | 1;    // 0: 短水路, 1: 長水路
 *     isRelaying: boolean;
 *   }
 *   // candidates は同一種目×距離に該当する記録(短水路・長水路混在可)の集合。
 *   // 非引き継ぎ(isRelaying=false)は常に候補。引き継ぎ(isRelaying=true)は
 *   // includeRelaying=true のときのみ候補に追加され、その上で最速(time最小)を採用する。
 *   export function selectBestTime(
 *     candidates: BestTimeCandidate[],
 *     includeRelaying: boolean,
 *   ): BestTimeCandidate | null;
 *
 *   // 表示サフィックス。長水路(poolType=1)なら"L"、引き継ぎ(isRelaying)なら"R"、
 *   // 両方成立時は"LR"(L→Rの順)。短水路かつ非引き継ぎは""。
 *   export function formatBestTimeSuffix(
 *     bestTime: Pick<BestTimeCandidate, "poolType" | "isRelaying">,
 *   ): string;
 *
 * Sprint Contract 検証観点(最重要 = 後退防止):
 *   [V-10 最重要] includeRelaying=false(デフォルト)のとき、引き継ぎ記録がどれだけ速くても
 *                非引き継ぎ記録が選ばれる(現行 mobile 動作を一切変えない)
 *   [V-11] includeRelaying=true・引き継ぎの方が速い場合、引き継ぎ記録が選ばれる
 *   [V-12] includeRelaying=true・引き継ぎ無しの方が速い場合、引き継ぎ無し記録が選ばれる
 *   [V-13] 引き継ぎ記録しか無く includeRelaying=false の場合、候補が0件になり null を返す
 *   [V-14] 引き継ぎ記録しか無く includeRelaying=true の場合、その引き継ぎ記録が選ばれる
 *   [V-15] 記録が1件も無い(candidates=[])場合、includeRelaying の値に関わらず null
 *   [V-16] 短水路・長水路が混在するとき、プール種別に関わらず最速の1件を採用する
 *   [V-17] formatBestTimeSuffix: L/R/LR/空文字の4パターン
 *
 * トートロジー防止メモ: 期待値(具体的な time 秒数・id)はテスト側でハードコードしており、
 * 実装と同じ reduce/filter 処理をテスト内で再実行して比較する形にはしていない。
 */

import { describe, expect, it } from "vitest";
import {
  selectBestTime,
  formatBestTimeSuffix,
  type BestTimeCandidate,
} from "../bestTimeSelection";

describe("selectBestTime", () => {
  it("[V-10 最重要] includeRelaying=false: 引き継ぎの方が速くても非引き継ぎが選ばれる(後退防止)", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "non-relay", time: 35.2, poolType: 0, isRelaying: false },
      { id: "relay", time: 20.0, poolType: 0, isRelaying: true },
    ];

    const result = selectBestTime(candidates, false);

    expect(result?.id).toBe("non-relay");
    expect(result?.time).toBe(35.2);
  });

  it("[V-11] includeRelaying=true: 引き継ぎの方が速い場合、引き継ぎ記録が選ばれる", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "non-relay", time: 35.2, poolType: 0, isRelaying: false },
      { id: "relay", time: 20.0, poolType: 0, isRelaying: true },
    ];

    const result = selectBestTime(candidates, true);

    expect(result?.id).toBe("relay");
    expect(result?.time).toBe(20.0);
  });

  it("[V-12] includeRelaying=true: 非引き継ぎの方が速い場合、非引き継ぎ記録が選ばれる", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "non-relay", time: 18.5, poolType: 0, isRelaying: false },
      { id: "relay", time: 25.0, poolType: 0, isRelaying: true },
    ];

    const result = selectBestTime(candidates, true);

    expect(result?.id).toBe("non-relay");
  });

  it("[V-13] 引き継ぎ記録しか無く includeRelaying=false のとき null を返す", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "relay-only", time: 22.0, poolType: 0, isRelaying: true },
    ];

    expect(selectBestTime(candidates, false)).toBeNull();
  });

  it("[V-14] 引き継ぎ記録しか無く includeRelaying=true のとき、その記録が選ばれる", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "relay-only", time: 22.0, poolType: 0, isRelaying: true },
    ];

    const result = selectBestTime(candidates, true);

    expect(result?.id).toBe("relay-only");
  });

  it("[V-15] 記録が1件も無い場合、includeRelaying に関わらず null", () => {
    expect(selectBestTime([], false)).toBeNull();
    expect(selectBestTime([], true)).toBeNull();
  });

  it("[V-16] 短水路より長水路の方が速い場合、プール種別を問わず長水路記録が選ばれる", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "short-course", time: 30.1, poolType: 0, isRelaying: false },
      { id: "long-course", time: 28.9, poolType: 1, isRelaying: false },
    ];

    const result = selectBestTime(candidates, false);

    expect(result?.id).toBe("long-course");
    expect(result?.poolType).toBe(1);
  });

  it("[V-16b] 長水路より短水路の方が速い場合、短水路記録が選ばれる", () => {
    const candidates: BestTimeCandidate[] = [
      { id: "short-course", time: 26.4, poolType: 0, isRelaying: false },
      { id: "long-course", time: 29.9, poolType: 1, isRelaying: false },
    ];

    const result = selectBestTime(candidates, false);

    expect(result?.id).toBe("short-course");
    expect(result?.poolType).toBe(0);
  });
});

describe("formatBestTimeSuffix", () => {
  it("[V-17] 短水路・非引き継ぎは空文字", () => {
    expect(formatBestTimeSuffix({ poolType: 0, isRelaying: false })).toBe("");
  });

  it("[V-17] 長水路・非引き継ぎは 'L'", () => {
    expect(formatBestTimeSuffix({ poolType: 1, isRelaying: false })).toBe("L");
  });

  it("[V-17] 短水路・引き継ぎは 'R'", () => {
    expect(formatBestTimeSuffix({ poolType: 0, isRelaying: true })).toBe("R");
  });

  it("[V-17] 長水路・引き継ぎは 'LR'(L→Rの順で結合)", () => {
    expect(formatBestTimeSuffix({ poolType: 1, isRelaying: true })).toBe("LR");
  });
});
