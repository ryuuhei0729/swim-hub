// =============================================================================
// screenHarnesses.test.ts
// =============================================================================
//
// テスト用ハーネス (`*Harness.tsx`) を import するテストファイルが、ハーネスの担当
// モジュールを vi.mock し直していないことを検証する。
//
// ファイル側の vi.mock は巻き上げで先に登録され、ハーネスの import 時に上書きされて
// エラーも出ずに無効になる (2026-10-04 にプローブで実測: ファイル側で useAuth を
// 差し替えてもハーネス側の値が返った)。例えばプレミアム分岐を見るために
// AuthProvider を vi.mock し直しても subscription: null のままで、分岐を一度も
// 通らないテストが緑になる。
//
// ハーネスの一覧はファイル名 (`*Harness.ts(x)`) から、担当モジュールの一覧は各ハーネス自身の
// vi.mock 呼び出しから読む (二重管理しない)。
//
// 検出できる範囲: ハーネスと同じディレクトリのテストが `"./<ハーネス名>"` で import し、
// vi.mock / vi.doMock のモジュール名をハーネスと同じ文字列 (ダブルクォート) で書いた場合。
// 別ディレクトリからの import や、同じモジュールを相対パスなど別の書き方で指す場合は検出できない。
// 現在のハーネス利用ファイルはすべて上の形に揃っている。
// ミューテーション確認方法: ハーネスを import するテストに担当モジュールの
// vi.mock を1つ足すと赤になる。

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(__dirname, "..");

const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".expo", "ios", "android", "dist", "web-build"]);

function collectFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry)) continue;
      results.push(...collectFiles(full, pattern));
      continue;
    }
    if (pattern.test(entry)) results.push(full);
  }
  return results;
}

function mockedModules(source: string): string[] {
  return [...source.matchAll(/vi\.(?:mock|doMock)\(\s*"([^"]+)"/g)].map(([, name = ""]) => name);
}

const harnesses = collectFiles(APP_ROOT, /Harness\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f));
const testFiles = collectFiles(APP_ROOT, /\.(test|spec)\.(ts|tsx)$/);

describe("テスト用ハーネスの担当モジュール", () => {
  it("ハーネスが見つかっている (空走査で緑になるのを防ぐ)", () => {
    expect(harnesses.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(["teamRecordBulkScreenHarness.tsx", "recordFormScreenHarness.tsx"]),
    );
  });

  describe.each(harnesses.map((f) => [path.relative(APP_ROOT, f), f] as const))("%s", (_rel, harnessPath) => {
    const owned = new Set(mockedModules(readFileSync(harnessPath, "utf8")));
    const importSpecifier = `./${path.basename(harnessPath).replace(/\.tsx?$/, "")}`;
    const users = testFiles.filter(
      (f) =>
        path.dirname(f) === path.dirname(harnessPath) &&
        new RegExp(`(?:from|import) "${importSpecifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(
          readFileSync(f, "utf8"),
        ),
    );

    it("担当モジュールと、ハーネスを使うテストが1つ以上ある", () => {
      expect(owned.size).toBeGreaterThan(0);
      expect(users.length).toBeGreaterThan(0);
    });

    it("ハーネスを import するテストは担当モジュールを vi.mock し直さない", () => {
      const offenders = users.flatMap((f) =>
        mockedModules(readFileSync(f, "utf8"))
          .filter((name) => owned.has(name))
          .map((name) => `${path.relative(APP_ROOT, f)}: ${name}`),
      );

      expect(
        offenders,
        "ハーネスが vi.mock しているモジュールをファイル側で vi.mock しても黙って無効になる。" +
          "挙動を変えたいときは harness にプロパティを足すこと:\n" +
          offenders.join("\n"),
      ).toEqual([]);
    });
  });
});
