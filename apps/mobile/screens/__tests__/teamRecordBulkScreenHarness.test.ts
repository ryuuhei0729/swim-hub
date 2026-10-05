// =============================================================================
// teamRecordBulkScreenHarness.test.ts
// =============================================================================
//
// teamRecordBulkScreenHarness を import するテストファイルが、ハーネスの担当
// モジュールを vi.mock し直していないことを検証する。
//
// ファイル側の vi.mock は巻き上げで先に登録され、ハーネスの import 時に上書きされて
// エラーも出ずに無効になる (2026-10-04 にプローブで実測: ファイル側で useAuth を
// 差し替えてもハーネス側の値が返った)。例えばプレミアム分岐を見るために
// AuthProvider を vi.mock し直しても subscription: null のままで、分岐を一度も
// 通らないテストが緑になる。
//
// 担当モジュールの一覧はハーネス自身の vi.mock 呼び出しから読む (二重管理しない)。
// ミューテーション確認方法: ハーネスを import するテストに担当モジュールの
// vi.mock を1つ足すと赤になる。

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(__dirname, "../..");
const HARNESS_PATH = path.join(__dirname, "teamRecordBulkScreenHarness.tsx");

const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".expo", "ios", "android", "dist", "web-build"]);

function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry)) continue;
      results.push(...collectTestFiles(full));
      continue;
    }
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) results.push(full);
  }
  return results;
}

function mockedModules(source: string): string[] {
  return [...source.matchAll(/vi\.(?:mock|doMock)\(\s*"([^"]+)"/g)].map(([, name = ""]) => name);
}

describe("teamRecordBulkScreenHarness の担当モジュール", () => {
  const owned = new Set(mockedModules(readFileSync(HARNESS_PATH, "utf8")));
  const harnessUsers = collectTestFiles(APP_ROOT).filter((f) =>
    /from "\.\/teamRecordBulkScreenHarness"/.test(readFileSync(f, "utf8")),
  );

  it("担当モジュールとハーネスの利用ファイルが実際に見つかっている (空走査で緑になるのを防ぐ)", () => {
    expect(owned.has("@/contexts/AuthProvider")).toBe(true);
    expect(harnessUsers.map((f) => path.basename(f))).toContain(
      "teamRecordBulk.detailScreenAdminGuard.test.tsx",
    );
  });

  it("ハーネスを import するテストは担当モジュールを vi.mock し直さない", () => {
    const offenders = harnessUsers.flatMap((f) =>
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
