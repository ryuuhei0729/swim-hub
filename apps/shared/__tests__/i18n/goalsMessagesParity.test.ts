// =============================================================================
// goalsMessagesParity.test.ts  (S10 / D2 / D1 のキー部分)
// =============================================================================
// 目的: goals 名前空間 (既存 + goals.mobile.* + goals.milestoneSummary.*) と
//       navigation.mobile.titles.* が5言語で「キー集合・補間変数集合」が一致し続けること。
// 何を壊したら赤くなるべきか:
//   - ja にだけ goals.mobile.xxx を足して他4言語を忘れる           -> キー集合テストが赤
//   - de の補間変数 {count} を {anzahl} に打ち間違える              -> 補間テストが赤
//   - en/de に日本語を残す、zh/ko に仮名を残す                     -> ハードコード検査が赤
//   - goals.mobile.* に既存 goals.* と ja が同文言のキーを新設     -> 重複検査が赤 (D2)
// 実装側のキー一覧はハードコードしない (実測のみ)。ベースライン時点で緑 (goals 5言語 197 キー)。
// =============================================================================
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

function pick(tree: Tree, dotted: string): Tree | undefined {
  let cur: string | Tree | undefined = tree;
  for (const part of dotted.split(".")) {
    if (cur === undefined || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "object" ? cur : undefined;
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

const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

const NAMESPACES = ["goals", "navigation.mobile.titles", "navigation.mobile.tabs"] as const;

describe.each(NAMESPACES)("%s: 5言語の一致", (ns) => {
  const flat = new Map(
    LOCALES.map(([loc, tree]) => [loc, flatten(pick(tree, ns) ?? {})] as const),
  );
  const jaFlat = flat.get("ja") as Record<string, string>;

  it("ja に名前空間が実在し、空ではない (空集合同士の一致で緑にならない)", () => {
    expect(Object.keys(jaFlat).length).toBeGreaterThan(0);
  });

  it.each(LOCALES.filter(([l]) => l !== "ja").map(([l]) => l))(
    "%s のキー集合が ja と厳密一致 (過不足なし)",
    (loc) => {
      const other = flat.get(loc) as Record<string, string>;
      const jaKeys = Object.keys(jaFlat).sort();
      const otherKeys = Object.keys(other).sort();
      expect(otherKeys.filter((k) => !jaKeys.includes(k))).toEqual([]);
      expect(jaKeys.filter((k) => !otherKeys.includes(k))).toEqual([]);
    },
  );

  it.each(LOCALES.filter(([l]) => l !== "ja").map(([l]) => l))(
    "%s の各キーで {var} 補間変数が ja と同一集合 (単一波括弧のみ)",
    (loc) => {
      const other = flat.get(loc) as Record<string, string>;
      const mismatches = Object.keys(jaFlat)
        .filter((k) => k in other)
        .filter(
          (k) =>
            JSON.stringify(placeholders(jaFlat[k] as string)) !==
            JSON.stringify(placeholders(other[k] as string)),
        );
      expect(mismatches).toEqual([]);
    },
  );

  it("全言語で二重波括弧 {{var}} (i18next 既定形式) を使っていない", () => {
    const offenders = LOCALES.flatMap(([loc]) =>
      Object.entries(flat.get(loc) as Record<string, string>)
        .filter(([, v]) => /\{\{/.test(v))
        .map(([k]) => `${loc}:${ns}.${k}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("goals.milestoneSummary (D1 完了済み): 実在・3キー・補間変数", () => {
  it("ja に time / repsTime / set の3キーが厳密に実在する (空走査で緑にならない)", () => {
    const sec = pick(ja as unknown as Tree, "goals.milestoneSummary");
    expect(Object.keys(sec ?? {}).sort()).toEqual(["repsTime", "set", "time"]);
  });
  it.each(LOCALES.map(([l]) => l))("%s: 各キーの補間変数が仕様どおり (time={distance,time} / repsTime={distance,reps,time} / set={circle,distance,reps,sets})", (loc) => {
    const tree = LOCALES.find(([l]) => l === loc)![1];
    const f = flatten(pick(tree, "goals.milestoneSummary") ?? {});
    expect(placeholders(f.time as string)).toEqual(["distance", "time"]);
    expect(placeholders(f.repsTime as string)).toEqual(["distance", "reps", "time"]);
    expect(placeholders(f.set as string)).toEqual(["circle", "distance", "reps", "sets"]);
  });
});

describe("goals.mobile.* / goals.milestoneSummary.* の言語混入 (S10: ja 以外で 本/セット/年 等が出ない)", () => {
  const SUBTREES = ["goals.mobile", "goals.milestoneSummary"];
  const KANA = /[぀-ヿ]/;
  const CJK_IDEOGRAPH = /[一-鿿]/;

  it.each(SUBTREES)("%s は新設時点で5言語すべてに存在する (ja に在って他に無い=赤)", (sub) => {
    // 実装前 (ja に無い) は skip 相当で緑になるが、ja に在れば全言語必須。
    const jaSub = pick(ja as unknown as Tree, sub);
    expect(jaSub, `${sub} が ja に無い`).toBeDefined();
    for (const [loc, tree] of LOCALES) {
      expect(pick(tree, sub), `${loc} に ${sub} が無い`).toBeDefined();
    }
  });

  it.each(SUBTREES)("%s: en/de に日本語文字なし、zh/ko に仮名なし", (sub) => {
    const offenders: string[] = [];
    for (const [loc, tree] of LOCALES) {
      const sec = pick(tree, sub);
      expect(sec, `${loc}:${sub}`).toBeDefined();
      if (!sec) continue;
      for (const [k, v] of Object.entries(flatten(sec))) {
        if ((loc === "en" || loc === "de") && (KANA.test(v) || CJK_IDEOGRAPH.test(v))) offenders.push(`${loc}:${sub}.${k}`);
        if ((loc === "zh" || loc === "ko") && KANA.test(v)) offenders.push(`${loc}:${sub}.${k}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("goals.mobile.* の ja 文言が、既存 goals.* (mobile 以外) の ja 文言と重複しない (D2: 同文言の別キー新設禁止)", () => {
    const g = pick(ja as unknown as Tree, "goals");
    const mob = pick(ja as unknown as Tree, "goals.mobile");
    expect(g).toBeDefined();
    expect(mob).toBeDefined();
    if (!g || !mob) return;
    const mobFlat = Object.values(flatten(mob));
    const { mobile: _omit, ...rest } = g;
    void _omit;
    const existing = new Set(Object.values(flatten(rest as Tree)));
    expect(mobFlat.filter((v) => existing.has(v))).toEqual([]);
  });
});

// U1 (6タブ化): 目標タブのラベル。実際の切れ/折り返しは vitest で測れないため実機 [E-TAB1] で担保する。
describe("目標タブラベル (navigation.mobile.tabs.goals)", () => {
  it.each(LOCALES.map(([l]) => l))("%s: navigation.mobile.tabs.goals が実在し非空、他の5タブラベルと重複しない", (loc) => {
    const tabs = flatten(pick(LOCALES.find(([l]) => l === loc)![1], "navigation.mobile.tabs") ?? {});
    expect(typeof tabs.goals === "string" && tabs.goals.length > 0).toBe(true);
    const others = ["home", "practices", "competitions", "teams", "myPage"].map((k) => tabs[k]);
    expect(others).not.toContain(tabs.goals);
  });
});

// v5 L-b/L-d: goals.paramsForm.paramsInvalid は項目名を列挙しない汎用文 (type ごとに項目が違う問題と訳語の揺れを避ける)
describe("goals.paramsForm.paramsInvalid", () => {
  it.each(LOCALES.map(([l]) => l))("%s: 実在し非空。ja 以外はキー集合の一致は上のパリティ検査が担保", (loc) => {
    const tree = LOCALES.find(([l]) => l === loc)![1];
    const v = (pick(tree, "goals.paramsForm") as Tree | undefined)?.paramsInvalid;
    expect(typeof v === "string" && v.length > 0).toBe(true);
  });
  it("ja: 特定の項目名 (距離/本数/セット数/サークル) を列挙しない", () => {
    const v = (pick(ja as unknown as Tree, "goals.paramsForm") as Tree).paramsInvalid as string;
    for (const word of ["距離", "本数", "セット", "サークル"]) expect(v, word).not.toContain(word);
  });
  it("旧キー goals.mobile.paramsInvalid / goals.mobile.competitionDatePast は残っていない (移動済み)", () => {
    for (const [loc, tree] of LOCALES) {
      const mob = (pick(tree, "goals.mobile") ?? {}) as Tree;
      expect(mob.paramsInvalid, loc).toBeUndefined();
      expect(mob.competitionDatePast, loc).toBeUndefined();
    }
  });
  it("goals.form.competitionDatePast が5言語に実在", () => {
    for (const [loc, tree] of LOCALES) {
      const v = (pick(tree, "goals.form") as Tree).competitionDatePast;
      expect(typeof v === "string" && v.length > 0, loc).toBe(true);
    }
  });
});

// =============================================================================
// S10: 目標関連ソースが使う静的な t("…") キーが、5言語すべてに実在する
// =============================================================================
// ソース (fs) から t("literal") を抽出し、各言語ツリーに文字列として実在することを検証する。
// 動的キー (テンプレートリテラル / 変数) は抽出対象外とし、除外件数を出力する (0 件抽出なら赤)。
// web は useTranslations("goals") の相対キー、mobile は完全修飾キー。
// =============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

const APPS = path.resolve(__dirname, "../../..");
function walkSrc(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (["__tests__", "node_modules", "__mocks__"].includes(e)) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walkSrc(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}
const MOBILE_FILES = [
  "screens/GoalsScreen.tsx", "screens/GoalDetailScreen.tsx", "screens/GoalFormScreen.tsx", "screens/MilestoneFormScreen.tsx",
  "hooks/useExpiredGoalCheck.ts", "hooks/useGoalProgress.ts", "hooks/useMilestoneSummary.ts",
  "navigation/TabNavigator.tsx", "navigation/MainStack.tsx", "navigation/TabBarLabel.tsx",
  ...walkSrc(path.join(APPS, "mobile/components/goals")).map((f) => path.relative(path.join(APPS, "mobile"), f)),
].map((f) => path.join(APPS, "mobile", f));
const WEB_GOALS = walkSrc(path.join(APPS, "web/app/[locale]/(authenticated)/goals"));

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** t("a.b") / t('a.b') の静的リテラルと、t(`...${`) 等の動的呼び出し件数 */
function extractKeys(src: string): { statics: string[]; dynamic: number } {
  const code = stripComments(src);
  const statics = [...code.matchAll(/(?<![\w.])t\(\s*(["'])([\w.]+)\1/g)].map((m) => m[2] as string);
  const dynamic = (code.match(/(?<![\w.])t\(\s*`/g) ?? []).length;
  return { statics, dynamic };
}
const exists = (tree: Tree, dotted: string) => {
  let cur: string | Tree | undefined = tree;
  for (const part of dotted.split(".")) {
    if (cur === undefined || typeof cur === "string") return false;
    cur = cur[part];
  }
  return typeof cur === "string";
};

describe("S10 使用キーの実在 (静的 t('…') を抽出)", () => {
  it("mobile: 目標関連ソースの完全修飾キーが5言語に実在する", () => {
    const keys = new Set<string>();
    let dynamic = 0;
    for (const f of MOBILE_FILES) {
      const r = extractKeys(readFileSync(f, "utf8"));
      r.statics.forEach((k) => keys.add(k));
      dynamic += r.dynamic;
    }
    // 空走査防止: 画面・コンポーネント群から相当数のキーが取れていること
    expect(keys.size).toBeGreaterThan(80);
    const missing = [...keys].flatMap((k) => LOCALES.filter(([, tree]) => !exists(tree, k)).map(([l]) => `${l}:${k}`));
    expect(missing).toEqual([]);
    console.log(`[S10 mobile] 静的キー ${keys.size} 件を検証、動的キー (対象外) ${dynamic} 件`);
  });

  it("web: goals 配下の useTranslations('goals') 相対キーが5言語の goals.* に実在する", () => {
    const keys = new Set<string>();
    let dynamic = 0;
    let files = 0;
    for (const f of WEB_GOALS) {
      const src = readFileSync(f, "utf8");
      if (!/useTranslations\(\s*["']goals["']\s*\)/.test(src)) continue;
      files++;
      const r = extractKeys(src);
      r.statics.forEach((k) => keys.add(`goals.${k}`));
      dynamic += r.dynamic;
    }
    expect(files).toBeGreaterThan(5);
    expect(keys.size).toBeGreaterThan(80);
    const missing = [...keys].flatMap((k) => LOCALES.filter(([, tree]) => !exists(tree, k)).map(([l]) => `${l}:${k}`));
    expect(missing).toEqual([]);
    console.log(`[S10 web] ${files} ファイルの静的キー ${keys.size} 件を検証、動的キー (対象外) ${dynamic} 件`);
  });

  it("抽出関数が欠落キーを実際に検出する (自己検査)", () => {
    expect(extractKeys('const a = t("goals.nope.x");').statics).toEqual(["goals.nope.x"]);
    expect(exists(ja as unknown as Tree, "goals.nope.x")).toBe(false);
    expect(extractKeys("t(`goals.${k}`)").dynamic).toBe(1);
  });
});
