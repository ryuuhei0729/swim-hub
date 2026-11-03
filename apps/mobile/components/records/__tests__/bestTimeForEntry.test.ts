// =============================================================================
// bestTimeForEntry.test.ts - mobile 版ベストタイム参照バッジの表示形式
// =============================================================================
// 優先順位表そのものは shared (packages/shared/__tests__/utils/bestTimeForEntry.test.ts) で
// 検証済み。ここでは mobile 固有の変換だけを見る:
//   - ラベルには水路の情報だけを載せる (引継の有無はラベルに含めない)
//   - 引き継ぎのタイムはタイム末尾に " R" を付ける
//   例: 「ベストタイム(長水路): 55.00 R」
// =============================================================================

import { describe, it, expect } from "vitest";
import type { BestTimeCandidate } from "@apps/shared/utils/bestTimeForEntry";
import {
  getBestTimeForEntry,
  formatBestTimeBadgeText,
  formatBestTimeValue,
} from "../bestTimeForEntry";

const cand = (
  over: Partial<BestTimeCandidate> & Pick<BestTimeCandidate, "time">,
): BestTimeCandidate => ({
  pool_type: 0,
  is_relaying: false,
  style: { name_jp: "50m自由形" },
  ...over,
});

/** ja.json の文言に依存しないよう、キーをそのまま返す t */
const t = (key: string) => key;

describe("getBestTimeForEntry (mobile) — ラベルは水路のみ、引継は isRelaying で返す", () => {
  it("同一水路・引継なし → bestTimeLabel / isRelaying=false", () => {
    expect(getBestTimeForEntry("50m自由形", 0, false, [cand({ time: 25.0 })])).toEqual({
      time: 25.0,
      labelKey: "forms.recordLog.bestTimeLabel",
      isRelaying: false,
    });
  });

  it("同一水路・引継 → ラベルは引継無しと同じ bestTimeLabel のまま、isRelaying=true", () => {
    expect(
      getBestTimeForEntry("50m自由形", 0, true, [
        cand({ time: 25.0, relayingTime: { time: 24.1 } }),
      ]),
    ).toEqual({ time: 24.1, labelKey: "forms.recordLog.bestTimeLabel", isRelaying: true });
  });

  it("他水路・引継 → ラベルは水路だけ (bestTimeLong) で、isRelaying=true", () => {
    expect(
      getBestTimeForEntry("50m自由形", 0, true, [
        cand({ time: 26.5, pool_type: 1, relayingTime: { time: 25.9 } }),
      ]),
    ).toEqual({ time: 25.9, labelKey: "forms.recordLog.bestTimeLong", isRelaying: true });
  });

  it("長水路の大会で短水路の引継ベストへ落ちる → bestTimeShort / isRelaying=true", () => {
    expect(
      getBestTimeForEntry("50m自由形", 1, true, [
        cand({ time: 24.5, pool_type: 0, relayingTime: { time: 24.0 } }),
      ]),
    ).toEqual({ time: 24.0, labelKey: "forms.recordLog.bestTimeShort", isRelaying: true });
  });

  it("候補が無ければ null", () => {
    expect(getBestTimeForEntry("50m自由形", 0, false, [])).toBeNull();
  });
});

describe("formatBestTimeValue / formatBestTimeBadgeText — 引継はタイム末尾の R", () => {
  it("引継なしは R を付けない", () => {
    expect(formatBestTimeValue({ time: 55.0, isRelaying: false })).toBe("55.00");
  });

  it("引継ありはタイム末尾に半角スペース + R", () => {
    expect(formatBestTimeValue({ time: 55.0, isRelaying: true })).toBe("55.00 R");
    // 1分超も同じ形
    expect(formatBestTimeValue({ time: 65.5, isRelaying: true })).toBe("1:05.50 R");
  });

  it("バッジ全文は「ラベル: タイム[ R]」", () => {
    expect(
      formatBestTimeBadgeText(
        { time: 55.0, labelKey: "forms.recordLog.bestTimeLong", isRelaying: true },
        t,
      ),
    ).toBe("forms.recordLog.bestTimeLong: 55.00 R");
    expect(
      formatBestTimeBadgeText(
        { time: 55.0, labelKey: "forms.recordLog.bestTimeLabel", isRelaying: false },
        t,
      ),
    ).toBe("forms.recordLog.bestTimeLabel: 55.00");
  });
});
