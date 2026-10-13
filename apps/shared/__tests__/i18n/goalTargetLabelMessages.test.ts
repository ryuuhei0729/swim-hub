/**
 * 目標バッジの i18n (Sprint Contract goal_target_badge)
 *  (1) forms.recordLog.goalTargetLabel が5言語に存在し、値にコロンを含まない
 *      (UI が `{label}: {time}` と組み立てるので二重コロンを防ぐ)
 *  (2) web / mobile の GoalTargetBadge.tsx が参照する静的 t("...") キーが5言語に実在する
 *      (対象ファイル0件・抽出0件なら赤。キーの継ぎ目落ち対策)
 */
import { existsSync, readFileSync } from "node:fs";
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

describe("forms.recordLog.goalTargetLabel", () => {
  for (const [name, tree] of LOCALES) {
    it(`${name}: 存在し、空でなく、コロンを含まない`, () => {
      const v = lookup(tree, "forms.recordLog.goalTargetLabel");
      expect(typeof v).toBe("string");
      expect((v as string).trim().length).toBeGreaterThan(0);
      expect(v as string).not.toMatch(/[:：]/);
    });
  }
  it("既存の bestTimeLabel もコロンを含まない (同じ規約 `{label}: {time}` に揃っている)", () => {
    for (const [name, tree] of LOCALES) {
      const v = lookup(tree, "forms.recordLog.bestTimeLabel");
      expect(typeof v, name).toBe("string");
      expect(v as string, name).not.toMatch(/[:：]\s*$/);
    }
  });
});

const APPS = resolve(__dirname, "../../..");
const FILES = {
  web: join(APPS, "web/components/forms/GoalTargetBadge.tsx"),
  mobile: join(APPS, "mobile/components/records/GoalTargetBadge.tsx"),
};

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
  }
  return keys;
}
function extractMobileKeys(src: string): string[] {
  return [...src.matchAll(/(?<![\w.])t\(\s*(["'])([^"'\\\n]+)\1/g)].map((m) => m[2]!);
}

describe.each([
  ["web", FILES.web, extractWebKeys],
  ["mobile", FILES.mobile, extractMobileKeys],
] as const)("%s の GoalTargetBadge が参照する i18n キー", (label, file, extract) => {
  const exists = existsSync(file);
  const keys = exists ? extract(readFileSync(file, "utf8")) : [];

  it(`アンカー: ${label} の GoalTargetBadge.tsx が存在する`, () => {
    expect(exists).toBe(true);
  });
  it(`アンカー: ${label} から静的キーが1件以上抽出でき、goalTargetLabel を含む`, () => {
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys).toContain("forms.recordLog.goalTargetLabel");
  });
  for (const [loc, tree] of LOCALES) {
    it(`${loc}: ${label} が参照する全キーが文字列として実在する`, () => {
      const missing = keys.filter((k) => typeof lookup(tree, k) !== "string");
      expect(missing).toEqual([]);
    });
  }
});
