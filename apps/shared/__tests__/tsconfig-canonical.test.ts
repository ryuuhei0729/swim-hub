/**
 * [3リポ同期の不変条件]
 * このファイルは以下の2ファイルと同じ canonical 値をリテラルで重複定義している。
 * 3リポは独立した git リポジトリのため、単一の CI で跨リポの一致を検証することは
 * 原理的に不可能。canonical 値を変更するときは、この3ファイルすべてを手動で更新すること。
 *   - swimhub-scanner/apps/shared/__tests__/tsconfig-canonical.test.ts
 *   - swimhub-timer/apps/shared/__tests__/tsconfig-canonical.test.ts
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Sprint #14 (target / strictness 統一) の設定ドリフト検知テスト。
 *
 * 何を検証するか:
 *   `tsc --showConfig` は tsconfig の `extends` チェーンを解決した「実効設定」を返す。
 *   このテストは PM_RULINGS.md 第3部の canonical 値と「維持する per-project 逸脱」を
 *   実効設定に対して assert する。CI が緑でも tsc --noEmit が走っていないプロジェクト
 *   (result-of-swimming / scraping。PM_RULINGS.md 第4部) があるため、
 *   「型チェックが通るか」とは独立に「設定が将来サイレントに巻き戻らないか」を守る。
 *
 * なぜここに置くか (CI から実行される場所):
 *   swim-hub/.github/workflows/ci.yml の `type-check` ジョブは `pnpm -r --if-present type-check`
 *   経由で各プロジェクトの `tsc --noEmit` を呼ぶだけで、tsconfig の *設定値* 自体は検証しない
 *   (0エラーであれば緩い設定でも通る)。一方 `unit-tests` ジョブは
 *   `pnpm --filter @swim-hub/shared test` を明示的に呼ぶため、このファイルは確実に CI で実行される。
 *   apps/shared は web/mobile 双方から参照される中心的パッケージであり、
 *   result-of-swimming は pnpm workspace 外だが同じ git リポジトリ内なので、
 *   相対パスで `tsc --showConfig` を直接叩けば「型チェックは CI 未カバーでも設定ドリフトだけは検知できる」。
 *   scraping だけは事情が違う (下記「検証できないこと」を参照)。
 *
 * 検証できないこと (既知の限界。QA report 参照):
 *   - 3リポジトリ (swim-hub / swimhub-scanner / swimhub-timer) 間の cross-repo 一致そのもの。
 *     CI は自リポジトリしか checkout しないため、3つの canonical-test ファイルがそれぞれ
 *     同じリテラル値 (target: "es2022" 等) を hardcode することで初めて実質的に統一される。
 *     3ファイルのリテラルが将来ズレても、このテスト単体では検知できない。
 *   - CI 上での scraping/tsconfig.json。`/scraping/` は .gitignore で丸ごと除外されており
 *     (ローカル開発機にのみ存在する運用スクリプト群)、CI の checkout には存在しない。
 *     tsconfig.json 単体を追跡対象に戻しても `include: ["**\/*.ts"]` に一致する入力が 0 件になり
 *     `tsc --showConfig` が TS18003 で失敗するため、追跡による CI 検証は成立しない。
 *     よって scraping のケースはファイルが存在する環境 (= ローカル) でのみ実行する。
 *   - `lib` が未指定のときに TypeScript が暗黙に補う DOM 等のデフォルト。
 *     `tsc --showConfig` は明示的に設定された値だけを返すため、暗黙のデフォルトには頼らない
 *     (swim-hub/apps/shared に DOM を明示させるのはまさにこの暗黙依存を無くすための修正)。
 */

function showConfig(relTsconfigPath: string): Record<string, unknown> {
  // CLAUDE.md のルールにより require() は使わない (require.resolve でモジュール解決もしない)。
  // `--no-install` は、ローカルの devDependency 解決に失敗した場合に CDN 相当への
  // フェッチへフォールバックせず即エラーにするための保険 (ネットワークアクセスを禁止する運用に合わせる)。
  const cfgPath = path.resolve(process.cwd(), relTsconfigPath);
  const out = execFileSync("npx", ["--no-install", "tsc", "--showConfig", "-p", cfgPath], {
    encoding: "utf8",
  });
  return (JSON.parse(out).compilerOptions ?? {}) as Record<string, unknown>;
}

function normalizeLib(lib: unknown): string[] {
  if (!Array.isArray(lib)) return [];
  return [...lib].map((x) => String(x).toLowerCase()).sort();
}

// PM_RULINGS.md 第3部「採用する canonical 設定値」
const CANONICAL_CORE = {
  module: "esnext",
  moduleResolution: "bundler",
  strict: true,
  noUncheckedIndexedAccess: true,
  esModuleInterop: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
  resolveJsonModule: true,
  isolatedModules: true,
};

describe("Sprint #14 tsconfig canonical values (swim-hub)", () => {
  it("apps/web: target ES2022 + canonical strictness + lib(dom,dom.iterable,es2022) + jsx/plugins", () => {
    const co = showConfig("../web/tsconfig.json");
    expect(co).toMatchObject({ ...CANONICAL_CORE, target: "es2022" });
    expect(normalizeLib(co.lib)).toEqual(["dom", "dom.iterable", "es2022"]);
    expect(co.jsx).toBe("preserve");
    expect(co.plugins).toMatchObject([{ name: "next" }]);
  });

  it("apps/mobile: target ES2022 + canonical strictness + lib(dom,es2022) + jsx react-native", () => {
    const co = showConfig("../mobile/tsconfig.json");
    expect(co).toMatchObject({ ...CANONICAL_CORE, target: "es2022" });
    expect(normalizeLib(co.lib)).toEqual(["dom", "es2022"]);
    expect(co.jsx).toBe("react-native");
  });

  it("apps/shared (自身): target ES2022 + canonical strictness + lib は明示的に DOM を含む (地雷回避、必須)", () => {
    const co = showConfig("./tsconfig.json");
    expect(co).toMatchObject({ ...CANONICAL_CORE, target: "es2022" });
    // PM_RULINGS.md 第3部: 「swim-hub/apps/shared: lib: [ES2022, DOM, DOM.Iterable]（必須。論点1の地雷回避）」
    // base.json に lib:["ES2022"] を置くと apps/shared が DOM を失い window 系 15件 +
    // RequestCredentials 2件、計17件の新規エラーを生む。ここで明示的に DOM を含むことを固定し、
    // 将来 base に lib を寄せようとする変更が来た場合に検知できるようにする。
    expect(normalizeLib(co.lib)).toEqual(["dom", "dom.iterable", "es2022"]);
  });

  it("packages/oauth (tsconfig.json): target が base に追従して ES2022 化 + library系 (declaration/declarationMap/sourceMap)", () => {
    const co = showConfig("../../packages/oauth/tsconfig.json");
    expect(co).toMatchObject({ ...CANONICAL_CORE, target: "es2022" });
    // PM_RULINGS.md 論点2: target 追従は許可(0エラー実測済み)。publish は今スプリントで行わない
    // (このテストは配布物 dist/ の内容やバージョンには関与しない)。
    expect(co.declaration).toBe(true);
    expect(co.declarationMap).toBe(true);
    expect(co.sourceMap).toBe(true);
  });

  it("packages/oauth (tsconfig.build.json): module/moduleResolution=nodenext は既存 override として維持される", () => {
    const co = showConfig("../../packages/oauth/tsconfig.build.json");
    // PM_RULINGS.md 第3部: 「swim-hub/packages/oauth/tsconfig.build.json: module: nodenext,
    // moduleResolution: nodenext（既存 override 維持）」。target は base に追従して ES2022 化してよい。
    expect(co.module).toBe("nodenext");
    expect(co.moduleResolution).toBe("nodenext");
    expect(co.target).toBe("es2022");
  });

  it("result-of-swimming: target/lib は既に canonical。noUncheckedIndexedAccess と library系(declaration等) が新規に true化される", () => {
    const co = showConfig("../../result-of-swimming/tsconfig.json");
    expect(co).toMatchObject({ ...CANONICAL_CORE, target: "es2022" });
    expect(normalizeLib(co.lib)).toEqual(["es2022"]);
    // PM_RULINGS.md 第3部 library系バケットに result-of-swimming が明記されている。
    expect(co.declaration).toBe(true);
    expect(co.declarationMap).toBe(true);
    expect(co.sourceMap).toBe(true);
  });

  // `/scraping/` は .gitignore で除外されており CI の checkout には存在しない (上記「検証できないこと」参照)。
  // ローカル開発機では実在するので、そこでは通常どおり設定ドリフトを検知する。
  const scrapingTsconfigExists = existsSync(
    path.resolve(process.cwd(), "../../scraping/tsconfig.json"),
  );

  it.skipIf(!scrapingTsconfigExists)(
    "scraping: target は ES2022 化するが module/moduleResolution は Node CJS スクリプトとして維持される",
    () => {
      const co = showConfig("../../scraping/tsconfig.json");
      // PM_RULINGS.md 第3部「維持する per-project 逸脱」:
      // 「swim-hub/scraping: module: commonjs, moduleResolution: node10
      //  (Node CJS スクリプト。target のみ ES2022 化、実測0エラー)」
      expect(co.target).toBe("es2022");
      expect(co.module).toBe("commonjs");
      expect(co.moduleResolution).toBe("node10");
      expect(co.strict).toBe(true);
      expect(co.noUncheckedIndexedAccess).toBe(true);
      expect(co.esModuleInterop).toBe(true);
      expect(co.skipLibCheck).toBe(true);
      expect(co.forceConsistentCasingInFileNames).toBe(true);
      expect(co.resolveJsonModule).toBe(true);
      expect(co.isolatedModules).toBe(true);
      // NOTE(QA): scraping の最終的な lib の値 (ES2022+DOM に揃えるか ES2020+DOM のままか) は
      // PM_RULINGS.md に明記が無いため、意図的に assert しない。Developer の実装後、
      // 実際の値を PM/QA で確認してからこのテストに追記すること (Sprint Contract V-08 参照)。
    },
  );
});
