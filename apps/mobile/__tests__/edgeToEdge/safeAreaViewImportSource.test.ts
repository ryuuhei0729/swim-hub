// =============================================================================
// safeAreaViewImportSource.test.ts
// =============================================================================
//
// Android の Edge-to-Edge 強制 (Expo SDK 55 / gradle.properties edgeToEdgeEnabled=true)
// 下では、画面・モーダルの上下端がステータスバー/システムナビゲーションバー(3ボタン)の
// 領域まで描画される。これを回避する SafeAreaView には同名のコンポーネントが2つあり、
//
//   - react-native の SafeAreaView            → **iOS 専用。Android では何もしない**
//   - react-native-safe-area-context の同名品 → Android でも inset を適用する
//
// 前者を使うと「SafeAreaView を使っているのに Android だけ埋没する」という、
// grep では "対応済み" に見えてしまう不具合になる (実際に TagManageModal /
// MemberDetailModal / ImageViewerModal の3ファイルがこの状態だった)。
//
// このテストはソースを実際に読み、react-native から SafeAreaView を import している
// ファイルが存在しないことを検証する。ミューテーション確認方法:
// 任意のコンポーネントの import を `react-native` 由来に書き換えるとこのテストは赤になる。

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(__dirname, "../..");

/** 走査対象。アプリの JSX を持つディレクトリすべて (テスト・モックは除外)。 */
const SCAN_DIRS = ["screens", "components", "navigation", "hooks", "providers", "contexts"];

const EXCLUDED_DIR_NAMES = new Set(["__tests__", "__mocks__", "node_modules"]);

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry)) continue;
      results.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * `import { ... } from "<module>"` の名前付き import 節だけを対象にする
 * (コメント中の "SafeAreaView" や、別モジュールからの import を誤検出しないため)。
 */
function findsSafeAreaViewFromReactNative(source: string): boolean {
  const importRe = /import\s+(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g;
  for (const match of source.matchAll(importRe)) {
    const [, clause = "", moduleName = ""] = match;
    if (moduleName !== "react-native") continue;
    const named = clause.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]?.trim());
    if (named.includes("SafeAreaView")) return true;
  }
  return false;
}

describe("Edge-to-Edge: SafeAreaView の import 元", () => {
  const files = SCAN_DIRS.flatMap((d) => collectSourceFiles(path.join(APP_ROOT, d)));

  it("走査対象のソースが実際に見つかっている (空走査で緑になるのを防ぐ)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("react-native から SafeAreaView を import しているファイルが無い", () => {
    const offenders = files
      .filter((f) => findsSafeAreaViewFromReactNative(readFileSync(f, "utf8")))
      .map((f) => path.relative(APP_ROOT, f));

    expect(
      offenders,
      "react-native の SafeAreaView は iOS 専用で Android では inset を適用しない。" +
        'react-native-safe-area-context から import すること:\n' +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
