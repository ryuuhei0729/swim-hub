/**
 * safeFooterPadding 純関数テスト (Sprint Contract Round 2: D-8)
 *
 * 背景: Android Edge-to-Edge 強制 (SDK 55) + 3ボタンナビでフッターがナビバーに
 * 埋没する問題への対応で、TagSelectModal / ShareCardModal / StylePickerModal は
 * シートの `paddingBottom` を「デザイン上のハードコード値 (base)」から
 * 「base と実機の safe area inset (insetBottom) の大きい方」に置き換えた。
 * getSafeFooterPadding はその合成ロジックを担う純関数。
 *
 * 仕様 (実装を見ずに Sprint Contract の記述から導出。Math.max の再実装ではなく
 * 期待値を数値リテラルで固定することでトートロジーを避ける):
 *   - insetBottom が base 以下 (0 含む) の場合、base をそのまま維持する
 *     (ジェスチャーナビ/旧端末のようにナビバー inset が小さい/無い場合に
 *     デザイン上の余白を潰さない)
 *   - insetBottom が base を上回る場合、insetBottom を採用する
 *     (3ボタンナビのようにナビバーが厚い場合、確実にクリアする)
 *   - insetBottom が信頼できない値 (NaN・Infinity・負値) の場合は
 *     base にフォールバックする (「常に大きい方」実装がここで壊れて
 *     NaN 等を返さないことを保証する)
 */

import { describe, it, expect } from "vitest";
import { getSafeFooterPadding } from "../safeFooterPadding";

describe("getSafeFooterPadding", () => {
  describe("有効な inset の場合", () => {
    it("[D8-01] insetBottom=0 のとき base を維持する (ジェスチャーナビ/旧端末)", () => {
      expect(getSafeFooterPadding(34, 0)).toBe(34);
    });

    it("[D8-02] insetBottom(48) が base(34) を上回るとき insetBottom を採用する (3ボタンナビ)", () => {
      expect(getSafeFooterPadding(34, 48)).toBe(48);
    });

    it("[D8-03] insetBottom と base が等しい(34)とき その値を返す (iOS Home Indicator相当)", () => {
      expect(getSafeFooterPadding(34, 34)).toBe(34);
    });

    it("[D8-04] insetBottom(20) が base(32) を下回るとき base を維持する (「常に第2引数を返す」手抜き実装を落とすケース)", () => {
      expect(getSafeFooterPadding(32, 20)).toBe(32);
    });

    it("小数の insetBottom もそのまま採用する (丸め処理をしない)", () => {
      expect(getSafeFooterPadding(34, 47.5)).toBe(47.5);
    });
  });

  describe("不正な insetBottom は base にフォールバックする", () => {
    it("[D8-05] insetBottom=NaN のとき base を返す", () => {
      expect(getSafeFooterPadding(34, NaN)).toBe(34);
    });

    it("[D8-06] insetBottom が負値(-10)のとき base を返す", () => {
      expect(getSafeFooterPadding(34, -10)).toBe(34);
    });

    it("insetBottom=-0.5 (わずかに負) でも base を返す (0 ちょうどは有効値として扱う境界)", () => {
      expect(getSafeFooterPadding(34, -0.5)).toBe(34);
    });

    it("insetBottom=Infinity のとき base を返す (Number.isFinite ガードが無限大も弾く)", () => {
      expect(getSafeFooterPadding(34, Infinity)).toBe(34);
    });

    it("insetBottom=-Infinity のとき base を返す", () => {
      expect(getSafeFooterPadding(34, -Infinity)).toBe(34);
    });
  });

  describe("境界値", () => {
    it("[D8-07] base=0 かつ insetBottom=0 のとき 0 を返す", () => {
      expect(getSafeFooterPadding(0, 0)).toBe(0);
    });

    it("base=0 かつ insetBottom が正値のとき insetBottom を返す", () => {
      expect(getSafeFooterPadding(0, 48)).toBe(48);
    });

    it("base=0 かつ insetBottom が NaN のとき 0 を返す (フォールバック先の base が 0 でも NaN や undefined に汚染されない)", () => {
      expect(getSafeFooterPadding(0, NaN)).toBe(0);
    });
  });
});
