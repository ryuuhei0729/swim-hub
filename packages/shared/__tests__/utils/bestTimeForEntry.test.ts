import { describe, it, expect } from "vitest";
import {
  getBestTimeForEntry,
  type BestTimeCandidate,
} from "../../utils/bestTimeForEntry";

/**
 * ベストタイム参照バッジの優先順位表 (web/mobile 共通の唯一の定義元)。
 *
 * 人間の意図: 「リレー(引き継ぎ)で入力しているのに通常のスタートタイムがベストとして
 * 出る」「短水路の大会なのに長水路のベストが優先される」といった、値としては正しいが
 * 文脈として間違った表示を防ぐ。どの候補が選ばれたかは**ラベルでしか見分けられない**
 * ので、time だけでなく labelKey も必ず固定する。
 */

const cand = (
  over: Partial<BestTimeCandidate> & Pick<BestTimeCandidate, "time">,
): BestTimeCandidate => ({
  pool_type: 0,
  is_relaying: false,
  style: { name_jp: "50m自由形" },
  ...over,
});

describe("getBestTimeForEntry — 引き継ぎフラグによる優先順位の切り替え", () => {
  it("リレーONのとき、同一水路に引き継ぎベストがあれば通常ベストより優先する", () => {
    const result = getBestTimeForEntry("50m自由形", 0, true, [
      cand({ time: 25.0, relayingTime: { time: 24.1 } }),
    ]);
    expect(result).toEqual({ time: 24.1, labelKey: "bestTimeRelay" });
  });

  it("リレーOFFのとき、引き継ぎベストの方が速くても通常ベストを出す (別レースなので混ぜない)", () => {
    const result = getBestTimeForEntry("50m自由形", 0, false, [
      cand({ time: 25.0, relayingTime: { time: 24.1 } }),
    ]);
    expect(result).toEqual({ time: 25.0, labelKey: "bestTimeLabel" });
  });

  it("リレーONで同一水路に引き継ぎが無ければ、同一水路の通常ベストへ落ちる", () => {
    const result = getBestTimeForEntry("50m自由形", 0, true, [cand({ time: 25.0 })]);
    expect(result).toEqual({ time: 25.0, labelKey: "bestTimeLabel" });
  });

  it("同一水路に記録が1件も無ければ他水路へ落ち、ラベルで他水路だと分かる (短水路の大会 → 長水路ベスト)", () => {
    const result = getBestTimeForEntry("50m自由形", 0, false, [
      cand({ time: 26.5, pool_type: 1 }),
    ]);
    expect(result).toEqual({ time: 26.5, labelKey: "bestTimeLong" });
  });

  it("長水路の大会で短水路ベストへ落ちるときは bestTimeShort を返す (ラベルの向きが逆にならない)", () => {
    const result = getBestTimeForEntry("50m自由形", 1, false, [
      cand({ time: 24.0, pool_type: 0 }),
    ]);
    expect(result).toEqual({ time: 24.0, labelKey: "bestTimeShort" });
  });

  it("リレーONで他水路まで落ちる場合は他水路の引き継ぎベストを先に見る", () => {
    const result = getBestTimeForEntry("50m自由形", 0, true, [
      cand({ time: 26.5, pool_type: 1, relayingTime: { time: 25.9 } }),
    ]);
    expect(result).toEqual({ time: 25.9, labelKey: "bestTimeLongRelay" });
  });

  it("引き継ぎ記録しか無い種目 (is_relaying=true) は、リレーOFFのとき通常ベストとして採用しない", () => {
    // is_relaying=true の候補は「引き継ぎスタートのタイム」なので、通常のスタートの
    // ベストとして出すと 0.6 秒ほど速い値が自己ベストとして表示されてしまう
    const result = getBestTimeForEntry("50m自由形", 0, false, [
      cand({ time: 24.1, is_relaying: true }),
    ]);
    expect(result).toBeNull();
  });

  it("種目名が一致しない候補は使わない (別種目のベストが漏れない)", () => {
    const result = getBestTimeForEntry("100m平泳ぎ", 0, false, [cand({ time: 25.0 })]);
    expect(result).toBeNull();
  });

  it("候補が空、または種目名が空文字なら null", () => {
    expect(getBestTimeForEntry("50m自由形", 0, false, [])).toBeNull();
    expect(getBestTimeForEntry("", 0, false, [cand({ time: 25.0 })])).toBeNull();
  });
});
