/**
 * StyleCodeKey の型レベル導出ガード (型ミラー拡張, PM実測 2026-09-01)
 *
 * Sprint: GitHub Issue #13 種目略称ケーシング統一
 *
 * `apps/web/utils/swimStyle.ts` の `StyleCodeKey` は当初「web担当が導出/独立を
 * 判断中」の pending 項目だったが、Developer が `export type StyleCodeKey =
 * SwimStyle;` として導出する方針に決定した。このファイルは他の型ミラー
 * (apps/shared/__tests__/types/common.test.ts の Stroke、
 * result-of-swimming/__tests__/rawStrokeTypeDerivation.test.ts の RawStroke) と
 * 同じ Equal<X,Y> 手法で、独立したリテラルユニオンとして再導入されていないかを
 * 型レベルで検証する (実行時 assert では検証できないため tsc --noEmit のコンパイルで
 * 検証する。CI では必ず tsc --noEmit もあわせて実行すること)。
 */
import { describe, expect, it } from "vitest";
import type { SwimStyle } from "@apps/shared/types";
import type { StyleCodeKey } from "@/utils/swimStyle";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

// StyleCodeKey が SwimStyle から構造的に導出されていること。
type _StyleCodeKeyIsAliasOfSwimStyle = Expect<Equal<StyleCodeKey, SwimStyle>>;

describe("StyleCodeKey の型レベル導出ガード (web)", () => {
  it("このファイルが tsc --noEmit を通過すること自体が証明である (プレースホルダ)", () => {
    expect(true).toBe(true);
  });
});
