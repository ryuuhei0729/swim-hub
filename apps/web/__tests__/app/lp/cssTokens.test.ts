/**
 * LP v4.2 — CSS トークン存在確認テスト
 *
 * Sprint Contract 検証観点:
 *   [V-01] globals.css に `--lp-*` CSS 変数が追加されている
 *   [V-01] 必須トークン全16種が定義されていること
 *   [V-01] グラデーション系のスタイルが LP 専用コンポーネント内に混入していないこと
 *          （globals.css の既存 .bg-gradient-* ユーティリティは残存すること）
 *          ただし repeating-linear-gradient はデコ帯・レーンライン専用 (§6.3) として許容。
 *   [V-02] globals.css の既存グラデユーティリティ（.bg-gradient-swim 等）が削除されていないこと
 *   [V-23] LP コンポーネント (.tsx) 内に linear-gradient / radial-gradient /
 *           conic-gradient が直接使われていないこと（repeating-linear-gradient は除外）
 *
 * 検証手段: [unit] — ファイル内容を文字列として読み込み、キーワード存在を検証
 *
 * Developer への要求:
 *   `app/globals.css` の末尾に以下の CSS 変数ブロックを追加すること（既存内容は変更しない）:
 *
 *   :root {
 *     --lp-bg: #eef1f6;
 *     --lp-panel: #ffffff;
 *     --lp-navy: #0b1424;
 *     --lp-navy2: #111d33;
 *     --lp-royal: #2b5fa8;
 *     --lp-ice: #7ea8dd;
 *     --lp-silver: #bac4d3;
 *     --lp-ink: #0b1424;
 *     --lp-line: rgba(11,20,36,0.14);
 *     --lp-line-strong: rgba(11,20,36,0.34);
 *     --lp-dim: rgba(11,20,36,0.62);
 *     --lp-dim2: rgba(11,20,36,0.38);
 *     --lp-w-white: #f4f6fa;
 *     --lp-w-line: rgba(244,246,250,0.2);
 *     --lp-w-line-strong: rgba(244,246,250,0.45);
 *     --lp-w-dim: rgba(244,246,250,0.66);
 *     --lp-w-dim2: rgba(244,246,250,0.4);
 *     --lp-photo-clip: polygon(36px 0, calc(100% - 36px) 0, 100% 36px, 100% calc(100% - 36px), calc(100% - 36px) 100%, 36px 100%, 0 calc(100% - 36px), 0 36px);
 *     --lp-pad-x: clamp(20px, 5vw, 80px);
 *   }
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const GLOBALS_CSS_PATH = path.resolve(
  __dirname,
  "../../../app/globals.css"
);

/**
 * LP コンポーネントディレクトリ。
 * [locale] はブラケットをエスケープせずそのまま使う（Node.js のパス解決では glob 展開されない）。
 */
const LP_COMPONENTS_DIR = path.resolve(
  __dirname,
  "../../../app/[locale]/_components/lp"
);

const REQUIRED_LP_TOKENS = [
  "--lp-bg",
  "--lp-panel",
  "--lp-navy",
  "--lp-navy2",
  "--lp-royal",
  "--lp-ice",
  "--lp-silver",
  "--lp-ink",
  "--lp-line",
  "--lp-line-strong",
  "--lp-dim",
  "--lp-dim2",
  "--lp-w-white",
  "--lp-w-line",
  "--lp-w-line-strong",
  "--lp-w-dim",
  "--lp-w-dim2",
  "--lp-photo-clip",
  "--lp-pad-x",
] as const;

// 既存グラデユーティリティ（削除禁止）
const EXISTING_GRADIENT_CLASSES = [
  ".bg-gradient-swim",
  ".bg-gradient-ocean",
  ".bg-gradient-pool",
] as const;

/**
 * 禁止グラデーション関数パターン。
 * repeating-linear-gradient はデコ帯・レーンライン専用 (§6.3) として許容するため除外。
 * 検出対象: linear-gradient( / radial-gradient( / conic-gradient(
 *
 * 検出ロジック: 文字列から repeating-linear-gradient を取り除いたあとで
 * 残りの gradient( が存在するかを確認する。
 */
function containsDisallowedGradient(content: string): boolean {
  // repeating-linear-gradient を空文字に置換してから検索する
  const sanitized = content.replace(/repeating-linear-gradient\(/g, "");
  return (
    sanitized.includes("linear-gradient(") ||
    sanitized.includes("radial-gradient(") ||
    sanitized.includes("conic-gradient(")
  );
}

/**
 * LP コンポーネントディレクトリ配下の .tsx ファイルを再帰的に列挙する。
 */
function collectTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      result.push(fullPath);
    }
  }
  return result;
}

describe("globals.css — LP v4.2 CSS トークン検証", () => {
  let cssContent: string;

  try {
    cssContent = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  } catch {
    cssContent = "";
  }

  describe("必須 --lp-* トークンが追加されている", () => {
    for (const token of REQUIRED_LP_TOKENS) {
      it(`${token} が定義されている`, () => {
        expect(
          cssContent,
          `globals.css に ${token} が見つかりません`
        ).toContain(token);
      });
    }
  });

  describe("既存グラデユーティリティが削除されていない（リグレッション保護）", () => {
    for (const cls of EXISTING_GRADIENT_CLASSES) {
      it(`${cls} が保持されている`, () => {
        expect(
          cssContent,
          `globals.css から ${cls} が削除されています`
        ).toContain(cls);
      });
    }
  });
});

describe("LP コンポーネント — グラデーション混入チェック [V-01/V-23]", () => {
  /**
   * LP コンポーネント (.tsx) 内に linear-gradient / radial-gradient / conic-gradient が
   * 直接使われていないことを検証する。
   *
   * 設計方針: LP の色はすべて CSS トークン (--lp-*) または単色で表現する。
   * グラデーションはデザインの世界観を壊すため禁止。
   *
   * 例外: repeating-linear-gradient はデコ帯・レーンライン専用 (§6.3) として許容する。
   *   - LapProgressBar.tsx のレーンライン背景
   *   - LpFinalCta.tsx / LpScanner.tsx のデコパターン帯
   *   これらは意図的な例外であり、他のコンポーネントへの追加は禁止。
   */
  it("LP コンポーネントディレクトリが存在する", () => {
    expect(
      fs.existsSync(LP_COMPONENTS_DIR),
      `${LP_COMPONENTS_DIR} が存在しません`
    ).toBe(true);
  });

  const tsxFiles = collectTsxFiles(LP_COMPONENTS_DIR);

  it("LP コンポーネント .tsx ファイルが1件以上存在する", () => {
    expect(tsxFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of tsxFiles) {
    const fileName = path.relative(LP_COMPONENTS_DIR, filePath);
    it(`${fileName} に禁止グラデーション (linear-gradient/radial-gradient/conic-gradient) が混入していない`, () => {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(
        containsDisallowedGradient(content),
        `${fileName} に linear-gradient / radial-gradient / conic-gradient が使用されています。` +
        " LP の色は CSS トークン (--lp-*) または単色で表現してください。" +
        " デコ帯・レーンライン目的には repeating-linear-gradient を使用すること (§6.3)。"
      ).toBe(false);
    });
  }
});
