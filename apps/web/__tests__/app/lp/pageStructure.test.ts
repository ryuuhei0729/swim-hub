/**
 * LP v4.2 — ページ構造・コンポーネント存在テスト
 *
 * Sprint Contract 検証観点:
 *   [V-10] `app/[locale]/_components/lp/` ディレクトリが存在する
 *   [V-10] 必須コンポーネントファイルが全て存在する
 *   [V-11] page.tsx が描画に使うコンポーネント (LpNav/LpHero/LpMarquee/LpFeatures/
 *           LpScanner/LpPricing/LpServices/LpFinalCta/LpFooter/LpStopwatch)
 *           を import している
 *   [V-11] LapProgressBar は page.tsx から直接描画されず、LpNav 内部で使用されること
 *           (LpNav.tsx が LapProgressBar を import していることで検証)
 *   [V-11] page.tsx が layout.tsx を分割していない（layout.tsx が存在し続けること）
 *   [V-12] LpNav が 'use client' ディレクティブを持つこと
 *   [V-12] LapProgressBar が 'use client' ディレクティブを持つこと
 *   [V-12] LpStopwatch が 'use client' ディレクティブを持つこと
 *   [V-12] LpMarquee が 'use client' ディレクティブを持つこと
 *
 * 検証手段: [unit] — ファイル存在確認 + ファイル内容の文字列確認
 *
 * [V-11] LapProgressBar の検証観点について:
 *   LapProgressBar は LpNav 内部でレンダリングされる設計。
 *   page.tsx への dead import (eslint-disable コメント付き) は削除されるべきであり、
 *   「LpNav.tsx が LapProgressBar を import している」ことで実使用を検証する。
 *   page.tsx に LapProgressBar の import が残っている場合は dead import であるため、
 *   page.tsx の描画コンポーネント import チェックには含めない。
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const LP_COMPONENTS_DIR = path.resolve(
  __dirname,
  "../../../app/[locale]/_components/lp"
);
const PAGE_TSX_PATH = path.resolve(
  __dirname,
  "../../../app/[locale]/page.tsx"
);
const LAYOUT_TSX_PATH = path.resolve(
  __dirname,
  "../../../app/[locale]/layout.tsx"
);
const LP_NAV_PATH = path.join(LP_COMPONENTS_DIR, "LpNav.tsx");

// 必須コンポーネントファイル名（拡張子あり）
const REQUIRED_COMPONENT_FILES = [
  "LpNav.tsx",
  "LapProgressBar.tsx",
  "LpStopwatch.tsx",
  "LpHero.tsx",
  "LpMarquee.tsx",
  "LpFeatures.tsx",
  "LpScanner.tsx",
  "LpPricing.tsx",
  "LpServices.tsx",
  "LpFinalCta.tsx",
  "LpFooter.tsx",
] as const;

/**
 * page.tsx が描画に使うコンポーネント名（直接 JSX として使用するもの）。
 * LapProgressBar は LpNav 内部で使用されるため、ここには含めない。
 * LapProgressBar の使用検証は「LpNav が import している」テストで行う。
 */
const REQUIRED_PAGE_RENDER_IMPORTS = [
  "LpNav",
  "LpHero",
  "LpMarquee",
  "LpFeatures",
  "LpScanner",
  "LpPricing",
  "LpServices",
  "LpFinalCta",
  "LpFooter",
  "LpStopwatch",
] as const;

// 'use client' が必要なコンポーネント
const CLIENT_COMPONENTS = [
  "LpNav.tsx",
  "LapProgressBar.tsx",
  "LpStopwatch.tsx",
  "LpMarquee.tsx",
] as const;

describe("LP v4.2 コンポーネントファイル構造", () => {
  describe("必須ディレクトリとファイルの存在", () => {
    it("app/[locale]/_components/lp/ ディレクトリが存在する", () => {
      expect(
        fs.existsSync(LP_COMPONENTS_DIR),
        `${LP_COMPONENTS_DIR} が存在しません`
      ).toBe(true);
    });

    for (const fileName of REQUIRED_COMPONENT_FILES) {
      it(`${fileName} が存在する`, () => {
        const filePath = path.join(LP_COMPONENTS_DIR, fileName);
        expect(
          fs.existsSync(filePath),
          `${filePath} が存在しません`
        ).toBe(true);
      });
    }
  });

  describe("page.tsx の描画コンポーネント import 確認", () => {
    let pageContent: string;

    try {
      pageContent = fs.readFileSync(PAGE_TSX_PATH, "utf-8");
    } catch {
      pageContent = "";
    }

    for (const componentName of REQUIRED_PAGE_RENDER_IMPORTS) {
      it(`page.tsx が描画コンポーネント ${componentName} を import している`, () => {
        expect(
          pageContent,
          `page.tsx に ${componentName} の import が見つかりません`
        ).toContain(componentName);
      });
    }

    it("page.tsx に LapProgressBar の dead import が残っていない（LpNav 内部で使用されるため page.tsx への直接 import は不要）", () => {
      // dead import であることの証拠。Developer が削除すべき。
      // page.tsx は LapProgressBar を JSX として直接使わないため、import があってはならない。
      expect(
        pageContent.includes("import LapProgressBar"),
        "page.tsx に LapProgressBar の dead import が残っています。" +
        " LapProgressBar は LpNav 内部でレンダリングされるため、page.tsx への直接 import は不要です。" +
        " Developer: `import LapProgressBar from ...` の行を削除してください。"
      ).toBe(false);
    });
  });

  describe("LapProgressBar が LpNav 内部で実使用されていること", () => {
    it("LpNav.tsx が LapProgressBar を import している（実使用の証拠）", () => {
      const lpNavContent = fs.existsSync(LP_NAV_PATH)
        ? fs.readFileSync(LP_NAV_PATH, "utf-8")
        : "";
      expect(
        lpNavContent,
        "LpNav.tsx が LapProgressBar を import していません。" +
        " LapProgressBar は LpNav 内部でレンダリングされる設計です。"
      ).toContain("LapProgressBar");
    });

    it("LpNav.tsx が <LapProgressBar を JSX として使用している", () => {
      const lpNavContent = fs.existsSync(LP_NAV_PATH)
        ? fs.readFileSync(LP_NAV_PATH, "utf-8")
        : "";
      expect(
        lpNavContent,
        "LpNav.tsx が <LapProgressBar を JSX として使用していません。import だけで実際に描画されていない可能性があります。"
      ).toContain("<LapProgressBar");
    });
  });

  describe("layout.tsx が存在し続けること（分割禁止）", () => {
    it("app/[locale]/layout.tsx が削除されていない", () => {
      expect(
        fs.existsSync(LAYOUT_TSX_PATH),
        "layout.tsx が削除されています。JSON-LD/構造化データの継承のために削除禁止です。"
      ).toBe(true);
    });
  });

  describe("Client Component の 'use client' ディレクティブ", () => {
    for (const fileName of CLIENT_COMPONENTS) {
      it(`${fileName} が 'use client' ディレクティブを持つ`, () => {
        const filePath = path.join(LP_COMPONENTS_DIR, fileName);
        if (!fs.existsSync(filePath)) {
          // ファイル未存在は前のテストで失敗しているためここでは skip 相当
          return;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        expect(
          content.trimStart().startsWith("'use client'") ||
            content.trimStart().startsWith('"use client"'),
          `${fileName} の先頭に 'use client' がありません`
        ).toBe(true);
      });
    }
  });
});
