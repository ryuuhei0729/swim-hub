/**
 * RawStroke の型レベル導出ガード
 *
 * Sprint: GitHub Issue #13 種目略称ケーシング統一 (型ミラー拡張, PM実測 2026-09-01)
 *
 * PM 実測により、DB CHECK 制約を写した型が result-of-swimming にも存在することが
 * 判明した:
 *   `src/types.ts:14` — `export type RawStroke = Stroke | "unknown";`
 *   (`Stroke` は `@shared/racePace` 経由で `apps/shared/utils/racePace/types.ts` から、
 *   さらに `apps/shared/types/common.ts` の `SwimStyle` (canonical) から導出されている)
 *
 * このファイルは「RawStroke が独立したリテラルユニオンとして再導入されていないか
 * (Stroke からの導出関係が維持されているか)」を型レベルで検証する。
 * 型レベルの関係は実行時 assert では検証できない (型情報はコンパイル時に消える) ため、
 * apps/shared/__tests__/types/common.test.ts の [V-0-C] と同じ Equal<X,Y> 手法で
 * `tsc --noEmit` のコンパイルによって検証する。vitest run (esbuild, 型チェックなし) は
 * この不一致を検出できないため、CI では必ず `tsc --noEmit` もあわせて実行すること。
 */
import { describe, expect, it } from "vitest";
import type { Stroke } from "@shared/racePace";
import type { RawStroke } from "../src/types";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

// RawStroke が Stroke | "unknown" から構造的に導出されていること。
// RawStroke が独立したリテラルユニオンとして再定義され、Stroke (延いては
// SwimStyle canonical) の値集合とズレた場合、この行が tsc --noEmit で失敗する。
type _RawStrokeIsDerivedFromStroke = Expect<Equal<RawStroke, Stroke | "unknown">>;

describe("RawStroke の型レベル導出ガード (result-of-swimming)", () => {
  it("このファイルが tsc --noEmit を通過すること自体が証明である (プレースホルダ)", () => {
    // 上記 type _RawStrokeIsDerivedFromStroke が型不一致になった場合、
    // この it() に到達する前に tsc --noEmit がコンパイルエラーで失敗する。
    expect(true).toBe(true);
  });
});
