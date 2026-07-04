import { describe, expect, it } from "vitest";
import { formatBestDelta, getShareBadgeState } from "@/components/share/utils";

// formatTime (share/utils) の挙動確認:
//   - mins=0: "${wholeSecs}.${hundredths.padStart(2,'0')}"  例) 0.00, 0.69, 1.20
//   - mins>0: "${mins}:${wholeSecs.padStart(2,'0')}.${hundredths.padStart(2,'0')}"  例) 2:05.00

describe("formatBestDelta", () => {
  it("改善(time < previousBest)は先頭マイナスで差分を返す", () => {
    // delta = 54.32 - 55.01 = -0.69 → formatTime(0.69) = "0.69"
    expect(formatBestDelta(54.32, 55.01)).toBe("-0.69");
  });

  it("同記録(|delta|<0.005)は ±0.00 を返す", () => {
    expect(formatBestDelta(55.01, 55.01)).toBe("±0.00");
  });

  it("悪化(time > previousBest)は先頭プラスで差分を返す", () => {
    // delta = 56.21 - 55.01 = 1.20 → formatTime(1.20) = "1.20"
    expect(formatBestDelta(56.21, 55.01)).toBe("+1.20");
  });

  it("分をまたぐ差分: (125.00 - 124.00) = 1.00 → '+1.00'", () => {
    // formatTime(1.00): mins=0, wholeSecs=1, hundredths=0 → "1.00"
    expect(formatBestDelta(125.0, 124.0)).toBe("+1.00");
  });
});

describe("getShareBadgeState", () => {
  it("[Case 1] isFirstRecord=true かつ previousBest が存在する → kind 'first' (isFirstRecord 優先)", () => {
    expect(getShareBadgeState(54.32, 100, true)).toEqual({ kind: "first" });
  });

  it("[Case 2] isFirstRecord=false, previousBest=null → kind 'none'", () => {
    expect(getShareBadgeState(54.32, null, false)).toEqual({ kind: "none" });
  });

  it("[Case 3] previousBest=undefined, isFirstRecord=undefined → kind 'none'", () => {
    expect(getShareBadgeState(54.32, undefined, undefined)).toEqual({ kind: "none" });
  });

  it("[Case 4] 明確な改善(time=54.32, previousBest=55.01) → kind 'best', label '-0.69'", () => {
    expect(getShareBadgeState(54.32, 55.01)).toEqual({ kind: "best", label: "-0.69" });
  });

  it("[Case 5] 完全同記録(time=55.01, previousBest=55.01) → kind 'best', label '±0.00'", () => {
    expect(getShareBadgeState(55.01, 55.01)).toEqual({ kind: "best", label: "±0.00" });
  });

  it("[Case 6] BEST_EPSILON 誤差内(+0.004) → kind 'best', label '±0.00'", () => {
    // time - previousBest = 0.004 < 0.005 → best 判定
    expect(getShareBadgeState(55.014, 55.01)).toEqual({ kind: "best", label: "±0.00" });
  });

  it("[Case 7] BEST_EPSILON を超えた悪化(+0.01) → kind 'slower', label '+0.01'", () => {
    expect(getShareBadgeState(55.02, 55.01)).toEqual({ kind: "slower", label: "+0.01" });
  });

  it("[Case 8] 明確な悪化(time=56.21, previousBest=55.01) → kind 'slower', label '+1.20'", () => {
    expect(getShareBadgeState(56.21, 55.01)).toEqual({ kind: "slower", label: "+1.20" });
  });
});
