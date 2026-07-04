/**
 * LP v4.2 — DSEG フォントセルフホスト確認テスト
 *
 * Sprint Contract 検証観点:
 *   [V-07] `dseg` npm パッケージが dependencies に追加されていること
 *   [V-07] `public/fonts/` に DSEG7 のフォントファイルが存在すること
 *          （dseg パッケージから next.config でコピーするか、scripts で配置する）
 *   [V-07] middleware.ts の `font-src 'self'` に変更が加えられていないこと
 *          （CDN フォント禁止制約の維持）
 *
 * 検証手段: [unit] — ファイル/パッケージ存在確認
 *
 * Developer への要求:
 *   1. `pnpm add dseg` で dseg を dependencies に追加
 *   2. `node_modules/dseg/fonts/DSEG7Classic-*.woff2` を
 *      `public/fonts/dseg/` にコピーする（next.config の copyFiles または
 *      scripts/copy-dseg-fonts.mjs で自動化）
 *   3. LP の CSS で `@font-face { font-family: 'DSEG7Classic'; src: url('/fonts/dseg/...') }` を定義
 *   4. middleware.ts の CSP `font-src 'self'` は変更しない
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const WEB_ROOT = path.resolve(__dirname, "../../..");
const PACKAGE_JSON_PATH = path.join(WEB_ROOT, "package.json");
const PUBLIC_FONTS_DIR = path.join(WEB_ROOT, "public", "fonts", "dseg");
const MIDDLEWARE_PATH = path.join(WEB_ROOT, "middleware.ts");

describe("DSEG フォントセルフホスト検証", () => {
  describe("npm パッケージ", () => {
    it("package.json の dependencies に dseg が追加されている", () => {
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(
        "dseg" in allDeps,
        'package.json に "dseg" が見つかりません。`pnpm add dseg` で追加してください。'
      ).toBe(true);
    });
  });

  describe("フォントファイル配置", () => {
    it("public/fonts/dseg/ ディレクトリが存在する", () => {
      expect(
        fs.existsSync(PUBLIC_FONTS_DIR),
        `${PUBLIC_FONTS_DIR} が存在しません`
      ).toBe(true);
    });

    it("DSEG7Classic のフォントファイル (.woff2 または .woff) が1つ以上存在する", () => {
      if (!fs.existsSync(PUBLIC_FONTS_DIR)) {
        // ディレクトリが存在しない場合は前のテストで失敗するため skip 相当
        return;
      }
      const files = fs.readdirSync(PUBLIC_FONTS_DIR);
      const dseg7Files = files.filter(
        (f) =>
          f.toLowerCase().includes("dseg7") &&
          (f.endsWith(".woff2") || f.endsWith(".woff"))
      );
      expect(
        dseg7Files.length,
        `public/fonts/dseg/ に DSEG7 フォントファイルが見つかりません。ファイル一覧: ${files.join(", ")}`
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe("CSP 制約の維持", () => {
    it("middleware.ts の font-src が 'self' のみであること（CDN 追加なし）", () => {
      const content = fs.readFileSync(MIDDLEWARE_PATH, "utf-8");
      // font-src の行を抽出
      const fontSrcMatch = content.match(/font-src[^,;'"]*['"][^'"]*['"]/);
      if (!fontSrcMatch) {
        // font-src が見つからない場合は別の形式の可能性があるため、
        // CDN URL が含まれていないことを確認する
        expect(content).not.toContain("jsdelivr.net");
        expect(content).not.toContain("fonts.googleapis.com");
        return;
      }
      const fontSrcLine = fontSrcMatch[0];
      expect(
        fontSrcLine,
        "font-src に CDN URL が追加されています。DSEG はセルフホストしてください。"
      ).not.toContain("jsdelivr");
      expect(
        fontSrcLine,
        "font-src に Google Fonts が追加されています。"
      ).not.toContain("googleapis");
    });
  });
});
