/**
 * チーム管理者向け「目標」タブの i18n キー実在検証 (Sprint Contract v1 S9)。
 *  (1) teamMemberGoals.* とタブ名2キーが5言語に存在し、キー集合・補間変数が一致
 *  (2) web / mobile の member-goals ディレクトリの新規ファイルが参照する静的 t("...") キーが
 *      5言語すべてに実在する (継ぎ目で落ちる過去実績への手当て)
 * 抽出対象ファイルが0件・抽出キーが0件なら赤 (空ディレクトリで素通りしない)。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import ko from "../../messages/ko.json";
import de from "../../messages/de.json";

type Tree = { [k: string]: string | Tree };
const LOCALES: Array<[string, Tree]> = [
  ["ja", ja as unknown as Tree],
  ["en", en as unknown as Tree],
  ["zh", zh as unknown as Tree],
  ["ko", ko as unknown as Tree],
  ["de", de as unknown as Tree],
];

function lookup(tree: Tree, dotted: string): string | Tree | undefined {
  let cur: string | Tree | undefined = tree;
  for (const p of dotted.split(".")) {
    if (cur === undefined || typeof cur === "string") return undefined;
    cur = cur[p];
  }
  return cur;
}
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

describe("teamMemberGoals.* の5言語パリティ", () => {
  const flats = LOCALES.map(([n, t]) => [n, flatten((lookup(t, "teamMemberGoals") as Tree) ?? {}, "teamMemberGoals")] as const);
  const base = flats[0]![1];

  it("アンカー: ja に teamMemberGoals.* が十分な件数ある (名前空間の空振りを検出)", () => {
    expect(Object.keys(base).length).toBeGreaterThanOrEqual(20);
  });
  for (const [name, flat] of flats.slice(1)) {
    it(`${name}: キー集合が ja と一致`, () => {
      expect(Object.keys(flat).sort()).toEqual(Object.keys(base).sort());
    });
    it(`${name}: 補間変数が ja と一致`, () => {
      for (const k of Object.keys(base)) expect(vars(flat[k] ?? ""), `${name}:${k}`).toEqual(vars(base[k]!));
    });
  }
  it("全言語・全キーが空でない", () => {
    for (const [n, flat] of flats) for (const [k, v] of Object.entries(flat)) expect(v.trim().length, `${n}:${k}`).toBeGreaterThan(0);
  });
  it("補間は単一波括弧 {var}。二重波括弧を使わない", () => {
    for (const [n, flat] of flats) for (const [k, v] of Object.entries(flat)) expect(v, `${n}:${k}`).not.toMatch(/\{\{/);
  });
});

describe("タブ名キー", () => {
  for (const key of ["teamsAdmin.tabs.goals", "teams.mobile.tabGoals"]) {
    for (const [name, tree] of LOCALES) {
      it(`${name}: ${key} が空でない文字列`, () => {
        const v = lookup(tree, key);
        expect(typeof v).toBe("string");
        expect((v as string).trim().length).toBeGreaterThan(0);
      });
    }
  }
});

// -----------------------------------------------------------------------------
// ソースから t("...") を抽出
// -----------------------------------------------------------------------------
const APPS = resolve(__dirname, "../../..");
const WEB_DIR = join(APPS, "web/components/team/member-goals");
const MOBILE_DIR = join(APPS, "mobile/components/teams/member-goals");

function listSources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...listSources(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** web: useTranslations("ns") の変数と、その変数の t("key") 呼び出しを解決する */
function extractWebKeys(src: string): string[] {
  const keys: string[] = [];
  const ns = new Map<string, string>();
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)) {
    ns.set(m[1]!, m[2] ?? "");
  }
  for (const [v, prefix] of ns) {
    for (const m of src.matchAll(new RegExp(`(?<![\\w.])${v}\\(\\s*(["'])([^"'\\\\\\n]+)\\1`, "g"))) {
      keys.push(prefix ? `${prefix}.${m[2]}` : m[2]!);
    }
    for (const m of src.matchAll(new RegExp(`(?<![\\w.])${v}\\.(?:rich|raw|markup)\\(\\s*(["'])([^"'\\\\\\n]+)\\1`, "g"))) {
      keys.push(prefix ? `${prefix}.${m[2]}` : m[2]!);
    }
  }
  return keys;
}

/** mobile: t("full.key") (react-i18next。名前空間なしのフルキー) */
function extractMobileKeys(src: string): string[] {
  const keys: string[] = [];
  for (const m of src.matchAll(/(?<![\w.])t\(\s*(["'])([^"'\\\n]+)\1/g)) keys.push(m[2]!);
  return keys;
}

/** 動的キー (テンプレートリテラル/変数) の件数。静的に検証できない箇所の可視化用 */
describe.each([
  ["web", WEB_DIR, extractWebKeys],
  ["mobile", MOBILE_DIR, extractMobileKeys],
] as const)("%s の member-goals が参照する i18n キー", (label, dir, extract) => {
  const files = listSources(dir);
  const refs = files.flatMap((f) => extract(readFileSync(f, "utf8")).map((k) => ({ file: f.replace(APPS, "apps"), key: k })));

  it(`アンカー: ${label} の対象ファイルが1件以上ある (${dir.replace(APPS, "apps")})`, () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
  it(`アンカー: ${label} から静的キーが1件以上抽出できる`, () => {
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  for (const [loc, tree] of LOCALES) {
    it(`${loc}: ${label} が参照する全キーが文字列として実在する`, () => {
      const missing = refs.filter((r) => typeof lookup(tree, r.key) !== "string").map((r) => `${r.file}: ${r.key}`);
      expect(missing).toEqual([]);
    });
  }

  it("補間変数: 参照キーの訳文の {var} が5言語で一致", () => {
    for (const { key } of refs) {
      const base = lookup(LOCALES[0]![1], key);
      if (typeof base !== "string") continue;
      for (const [loc, tree] of LOCALES.slice(1)) {
        const v = lookup(tree, key);
        if (typeof v === "string") expect(vars(v), `${loc}:${key}`).toEqual(vars(base));
      }
    }
  });
});
