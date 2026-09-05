/**
 * `/time-level` 認証チェック回帰テスト (Sprint Contract D8, 最優先項目)
 *
 * 背景 (PM 実測確認済み):
 *   `lib/supabase-auth/middleware.ts` の `publicRoutes` 配列に `/time-level` が
 *   含まれていない場合、匿名ユーザーが `/ja/time-level` に直アクセスすると
 *   `if (!user && !isPublicRoute(...) && !isStaticAsset(...))` に引っかかり
 *   `/ja/login` へリダイレクトされる。`(unauthenticated)` レイアウトに配置しても
 *   `authRoutes`/`publicRoutes` は別配列で判定されるため、レイアウト配置だけでは
 *   認証チェックを回避できない。「ログイン済みでは気づかず、ログアウト状態だけ壊れる」
 *   典型パターンのため、Verification Checklist の最上位に置く。
 *
 * ## 既知の環境制約 (jsdom で updateSession を直接実行できない)
 * `updateSession()` を実際に呼び出して匿名ユーザーのリダイレクト有無を検証しようとしたが、
 * `NextResponse.next({ request })` 内部の `request.headers instanceof Headers` チェックが
 * 本リポジトリの jsdom 環境下では常に false になり (`next/server` の NextRequest が
 * 生成する Headers インスタンスと、jsdom 環境のグローバル Headers が別実体になる
 * 実測済みの環境依存の問題。テスト実行環境を node に切り替えても
 * `vitest.setup.ts` が無条件に `window` を参照するため setup 自体が落ちる)、
 * production コードとは無関係な理由で必ず例外になる。
 * → 本ファイルはやむを得ず「ソースの構造的 pin」(既存 `middleware.test.ts` の
 *   C-1 テストと同じ手法: ソースを直接読み、対象の配列リテラルの中身を検証する) に
 *   フォールバックする。isPublicRoute の startsWith マッチングロジック自体は
 *   再実装しない (配列に該当の文字列要素が入っているかだけを見る)。
 * → **実際にブラウザで /ja/time-level が /login にリダイレクトされないことの
 *   最終確認は Phase B の Playwright 実機検証で必ず行うこと** (最優先の検証項目)。
 *
 * Sprint Contract 検証観点:
 *   [V-01] `publicRoutes` 配列リテラルに `"/time-level"` が要素として含まれる
 *          (静的 pin。実機確認は Phase B Playwright が担う)
 *   [V-01-control] 抽出した部分文字列が実際に publicRoutes 配列であることの検証
 *          (保護ルート `/dashboard` を含まないことで、無関係な配列を誤って
 *          読んでいないことを確認する)
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readMiddlewareSource(): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../lib/supabase-auth/middleware.ts"),
    "utf-8",
  );
}

function extractArrayLiteral(source: string, constName: string): string {
  const startMarker = `const ${constName} = [`;
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`could not find "const ${constName} = [" in middleware.ts`);
  }
  const bodyStart = startIndex + startMarker.length;
  const endIndex = source.indexOf("];", bodyStart);
  if (endIndex === -1) {
    throw new Error(`could not find closing "];" for ${constName} in middleware.ts`);
  }
  return source.slice(bodyStart, endIndex);
}

describe("[V-01] lib/supabase-auth/middleware.ts: publicRoutes に /time-level が含まれる", () => {
  it('publicRoutes 配列に "/time-level" が要素として存在する (D8 の核心)', () => {
    const source = readMiddlewareSource();
    const publicRoutesBody = extractArrayLiteral(source, "publicRoutes");
    const hasTimeLevel = /["']\/time-level["']/.test(publicRoutesBody);
    expect(hasTimeLevel).toBe(true);
  });

  it("[V-01-control] 抽出した配列は実際に publicRoutes である (保護ルート /dashboard を含まない)", () => {
    const source = readMiddlewareSource();
    const publicRoutesBody = extractArrayLiteral(source, "publicRoutes");
    // /dashboard は protectedRoutes 側の要素であり、publicRoutes には含まれないはず。
    // これが失敗する場合、extractArrayLiteral が誤った配列を切り出している可能性がある。
    expect(/["']\/dashboard["']/.test(publicRoutesBody)).toBe(false);
  });

  it("[V-01-control] 既存の公開ルート /pricing は引き続き含まれている (抽出ロジック自体の健全性確認・非退行)", () => {
    const source = readMiddlewareSource();
    const publicRoutesBody = extractArrayLiteral(source, "publicRoutes");
    expect(/["']\/pricing["']/.test(publicRoutesBody)).toBe(true);
  });
});
