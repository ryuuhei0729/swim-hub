/**
 * middleware.ts の matcher: 除外語に境界があることの回帰テスト
 *
 * 背景:
 *   matcher の negative lookahead は先頭 "/" 直後に錨を打つ前方一致である。
 *   除外語を境界なしで書くと、その語で始まる任意のパスが matcher から外れ、
 *   next-intl のロケール付与も Supabase 認証ガードも通らず素通りする
 *   (例: "guide" だけだと /guidelines が、"api" だけだと /apiary が抜ける)。
 *   "favicon.ico" は "." が未エスケープだと /faviconXico にもマッチする。
 *   一方で正規の除外対象 (public/guide.html, public/guide/img/*.png,
 *   /api/*, /favicon.ico) は除外され続けなければならない
 *   (除外を外すと 307 → /ja/guide.html → 404 等の退行が起きる)。
 *
 * 検証方針:
 *   文字列を pin せず、matcher を実際に RegExp 化して**挙動**を assert する。
 *   境界を消す変異を加えると [V-02] 系が、除外自体を消す変異を加えると
 *   [V-01] 系が赤になることを確認済み。
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** middleware.ts から matcher の文字列リテラルを取り出し、エスケープを解いて返す */
function readMatcherPattern(): string {
  const source = fs.readFileSync(path.resolve(__dirname, "../../middleware.ts"), "utf-8");
  const match = source.match(/matcher:\s*\[\s*(?:\/\*[\s\S]*?\*\/\s*)?("(?:[^"\\]|\\.)*")/);
  if (!match?.[1]) {
    throw new Error("could not extract matcher string literal from middleware.ts");
  }
  // TS の文字列リテラル ("\\." 等) を JSON として解釈し実際の正規表現ソースへ戻す
  return JSON.parse(match[1]) as string;
}

/** Next.js は matcher を前後アンカー付きで評価する */
function middlewareRuns(pathname: string): boolean {
  return new RegExp(`^${readMatcherPattern()}$`).test(pathname);
}

describe("middleware.ts matcher: 除外語の境界", () => {
  it("[V-00-control] 取り出した文字列は実際に matcher である", () => {
    const pattern = readMatcherPattern();
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("guide");
  });

  it("[V-01] 正規の静的ガイドは除外され続ける (307 → 404 の退行防止)", () => {
    expect(middlewareRuns("/guide.html")).toBe(false);
    expect(middlewareRuns("/guide/img/01-login-choose.png")).toBe(false);
  });

  it("[V-02] guide で始まるだけの別パスは素通りしない (認証バイパス防止)", () => {
    expect(middlewareRuns("/guidelines")).toBe(true);
    expect(middlewareRuns("/guide-secret")).toBe(true);
    expect(middlewareRuns("/guideline/admin")).toBe(true);
  });

  it("[V-11] Route Handlers は除外され続ける", () => {
    expect(middlewareRuns("/api")).toBe(false);
    expect(middlewareRuns("/api/contact")).toBe(false);
    expect(middlewareRuns("/api/storage/videos/upload-url")).toBe(false);
  });

  it("[V-12] api で始まるだけの別パスは素通りしない (認証バイパス防止)", () => {
    expect(middlewareRuns("/apiary")).toBe(true);
    expect(middlewareRuns("/api-docs")).toBe(true);
  });

  it("[V-21] favicon.ico は除外され続ける", () => {
    expect(middlewareRuns("/favicon.ico")).toBe(false);
  });

  it("[V-22] favicon.ico の . はエスケープされている (任意の1文字にマッチしない)", () => {
    expect(middlewareRuns("/faviconXico")).toBe(true);
  });

  it("[V-03-control] 通常ページと既知の静的アセットの扱いは変わらない", () => {
    expect(middlewareRuns("/ja/dashboard")).toBe(true);
    // 過去に 404 していた 2 件 (middleware.ts のコメント参照)
    expect(middlewareRuns("/manifest.json")).toBe(false);
    expect(middlewareRuns("/fonts/dseg/DSEG7Classic-BoldItalic.woff2")).toBe(false);
  });
});
