// =============================================================================
// ChipScrollRow.edgeFade.test.ts
// 右端フェードの表示判定 (shouldShowRightFade) の単体検証。
//
// 描画そのものは検証しない: フェードの表示可否は onLayout / onContentSizeChange /
// contentOffset という実機のレイアウト計測に依存し、jsdom + __mocks__/react-native
// ではどれも発火しない (= 常に 0 のまま非表示)。描画を assert しても
// 「何も起きていない」ことを緑にするだけなので、判定ロジックを純関数として切り出して
// そこを直接検証する。
// =============================================================================

import { describe, it, expect } from "vitest";
import { shouldShowRightFade } from "../ChipScrollRow";

describe("shouldShowRightFade", () => {
  it("中身が可視幅に収まっているときは出さない", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 300, scrollX: 0 }),
    ).toBe(false);
  });

  it("中身が可視幅ちょうどのときは出さない", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 360, scrollX: 0 }),
    ).toBe(false);
  });

  it("溢れていて先頭にいるときは出す", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 520, scrollX: 0 }),
    ).toBe(true);
  });

  it("溢れていて途中までスクロールしているときは出す", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 520, scrollX: 80 }),
    ).toBe(true);
  });

  it("右端まで到達したら消す", () => {
    // 到達点は contentWidth - containerWidth = 160
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 520, scrollX: 160 }),
    ).toBe(false);
  });

  it("右端の 1px 手前は許容範囲として消す (端末ごとの丸め差でフェードが残らないように)", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 520, scrollX: 159 }),
    ).toBe(false);
    // 2px 手前はまだ隠れているタブがあるので出したまま
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 520, scrollX: 158 }),
    ).toBe(true);
  });

  it("バウンドで右端を超えて引っ張られても消えたままにする", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 520, scrollX: 200 }),
    ).toBe(false);
  });

  it("溢れ幅が 1px 以内なら誤差とみなして出さない", () => {
    expect(
      shouldShowRightFade({ containerWidth: 360, contentWidth: 361, scrollX: 0 }),
    ).toBe(false);
  });

  it("計測前 (全て 0) は出さない", () => {
    expect(
      shouldShowRightFade({ containerWidth: 0, contentWidth: 0, scrollX: 0 }),
    ).toBe(false);
  });
});
