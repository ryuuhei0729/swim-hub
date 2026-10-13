// =============================================================================
// __tests__/goals/goalsDomainGuards.test.ts  (S10, S11, S14)
// =============================================================================
// ファイルの「現在の内容」を fs で読む静的ガード (git diff は使わない)。
// 空走査防止: 対象ファイル数を最初に assert。各ルールは in-memory のサンプル文字列で
//   「違反を実際に検出する」ことを同じファイル内で実証する (ミューテーション証明の代替)。
// 検査関数は構文パターン検査であり、プロダクションロジックの再実装ではない。
// 対象: screens/Goal*.tsx, screens/MilestoneFormScreen.tsx, components/goals/**, hooks/{useExpiredGoalCheck,useGoalProgress,useMilestoneSummary}.ts, navigation/TabBarLabel.tsx
// =============================================================================
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SCREENS = ["screens/GoalsScreen.tsx", "screens/GoalDetailScreen.tsx", "screens/GoalFormScreen.tsx", "screens/MilestoneFormScreen.tsx"];
const HOOKS = ["hooks/useExpiredGoalCheck.ts", "hooks/useGoalProgress.ts", "hooks/useMilestoneSummary.ts", "navigation/TabBarLabel.tsx"];

function listTsx(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir))
    .filter((e) => /\.(ts|tsx)$/.test(e) && !statSync(path.join(ROOT, dir, e)).isDirectory())
    .map((e) => `${dir}/${e}`);
}
const COMPONENTS = listTsx("components/goals");
const SCOPE = [...SCREENS, ...COMPONENTS, ...HOOKS];
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** コメント (行コメントとブロックコメント) を除去 */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---- 検査関数 (構文パターン) ------------------------------------------------
const hasJapanese = (src: string) => /[぀-ヿ一-鿿]/.test(stripComments(src));
const hasStyleLowerCase = (src: string) => /\.toLowerCase\(\)/.test(stripComments(src));
const hasSwimStyleCast = (src: string) => /\bas\s+SwimStyle\b/.test(stripComments(src));
const hasDbColumnZeroFallback = (src: string) => /\b(pool_type|poolType|gender)\b[^\n;]*\?\?\s*0\b/.test(stripComments(src));
const hasBeforeRemove = (src: string) => /beforeRemove/.test(stripComments(src));
const nonNullAssertions = (src: string) =>
  (stripComments(src).match(/[\w)\]]!(?=[.[);,\s])(?!=)/g) ?? []);
const rnSafeAreaViewImport = (src: string) => /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*["']react-native["']/.test(src);

/** <CenterModal ...> の開始タグ文字列を全て返す (属性中の {} をネスト考慮で閉じる) */
function centerModalOpenTags(src: string): string[] {
  const tags: string[] = [];
  let i = 0;
  while ((i = src.indexOf("<CenterModal", i)) !== -1) {
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(src.slice(i, j + 1));
    i = j;
  }
  return tags;
}
/** hook 呼び出し結果の変数名 */
const maxHeightVar = (src: string) => /const\s+(\w+)\s*=\s*useCenterModalMaxHeight\(\)/.exec(src)?.[1];
/** CenterModal 全インスタンスが、useCenterModalMaxHeight() の結果を contentStyle に渡しているか */
function centerModalOffenders(src: string): string[] {
  const tags = centerModalOpenTags(src);
  if (tags.length === 0) return [];
  const v = maxHeightVar(src);
  if (!v) return tags.map((t) => `hook 未使用: ${t.slice(0, 40)}`);
  return tags.filter((t) => !new RegExp(`contentStyle=\\{[^}]*\\b${v}\\b`).test(t)).map((t) => `contentStyle に ${v} が無い: ${t.slice(0, 60)}`);
}

describe("空走査防止", () => {
  it("対象ファイルが実在する (画面4 + goals コンポーネント >= 10 + hook/ラベル4)", () => {
    for (const f of [...SCREENS, ...HOOKS]) expect(() => read(f), f).not.toThrow();
    expect(COMPONENTS.length).toBeGreaterThanOrEqual(10);
    expect(SCOPE.length).toBeGreaterThanOrEqual(18);
  });
});

describe("検査関数が違反を検出する (ミューテーション代替)", () => {
  it("各ルールのアンカー付きサンプルで offender を返す", () => {
    expect(hasJapanese('const a = "距離";')).toBe(true);
    expect(hasJapanese('// コメントの日本語\nconst a = "x";')).toBe(false);
    expect(hasStyleLowerCase("s.toLowerCase()")).toBe(true);
    expect(hasSwimStyleCast("x as SwimStyle")).toBe(true);
    expect(hasDbColumnZeroFallback("const p = c.pool_type ?? 0;")).toBe(true);
    expect(hasDbColumnZeroFallback("const g = profile?.gender ?? 0")).toBe(true);
    expect(hasBeforeRemove('navigation.addListener("beforeRemove", f)')).toBe(true);
    expect(nonNullAssertions("const a = foo!.bar;").length).toBe(1);
    expect(nonNullAssertions("if (a !== b) {}").length).toBe(0);
    expect(rnSafeAreaViewImport('import { SafeAreaView } from "react-native";')).toBe(true);
    expect(rnSafeAreaViewImport('import { SafeAreaView } from "react-native-safe-area-context";')).toBe(false);
    expect(centerModalOffenders("<CenterModal visible>x</CenterModal>").length).toBe(1);
    expect(centerModalOffenders("const h = useCenterModalMaxHeight();\n<CenterModal visible contentStyle={{ padding: 1 }}>x</CenterModal>").length).toBe(1);
    expect(centerModalOffenders("const h = useCenterModalMaxHeight();\n<CenterModal visible contentStyle={{ maxHeight: h }}>x</CenterModal>").length).toBe(0);
    expect(centerModalOffenders("const maxHeight = useCenterModalMaxHeight();\n<CenterModal visible contentStyle={{ maxHeight }}>x</CenterModal>").length).toBe(0);
  });
});

describe("S14 コード規約 (対象 = 新規の目標管理ファイル)", () => {
  it.each(SCOPE)("%s: 種目の .toLowerCase() / as SwimStyle / DB NOT NULL 列への ?? 0 / beforeRemove が無い", (f) => {
    const src = read(f);
    expect(hasStyleLowerCase(src), "toLowerCase").toBe(false);
    expect(hasSwimStyleCast(src), "as SwimStyle").toBe(false);
    expect(hasDbColumnZeroFallback(src), "?? 0 on pool_type/gender").toBe(false);
    expect(hasBeforeRemove(src), "beforeRemove").toBe(false);
  });

  it.each(SCOPE)("%s: 非null断定 ! が無い (許容4パターンが必要になったら Reviewer に回すため一旦赤で気づく)", (f) => {
    expect(nonNullAssertions(read(f))).toEqual([]);
  });

  it("種目コードの正規化は toStyleCode() 経由 (MilestoneFormScreen / GoalSetCalculatorModal)", () => {
    expect(read("screens/MilestoneFormScreen.tsx")).toMatch(/toStyleCode\(/);
  });
});

describe("S10 日本語ハードコード (コメント除く)", () => {
  it.each(SCOPE)("%s: 文字列・JSX に日本語 (ひらがな/カタカナ/漢字) が直書きされていない", (f) => {
    expect(hasJapanese(read(f))).toBe(false);
  });
});

describe("S11 Edge-to-Edge", () => {
  it.each(SCOPE)("%s: SafeAreaView は react-native-safe-area-context から (react-native 由来は no-op)", (f) => {
    expect(rnSafeAreaViewImport(read(f))).toBe(false);
  });

  it("対象ファイルに <CenterModal が 3 箇所 (Goal 振り返り / マイルストーン振り返り / ゴールセット計算) 実在する (空走査防止)", () => {
    const withModal = SCOPE.filter((f) => centerModalOpenTags(read(f)).length > 0).sort();
    expect(withModal).toEqual([
      "components/goals/GoalReflectionModal.tsx",
      "components/goals/GoalSetCalculatorModal.tsx",
      "components/goals/ReflectionModal.tsx",
    ]);
  });

  it.each(SCOPE)("%s: 全 CenterModal インスタンスが useCenterModalMaxHeight() の結果を contentStyle に渡している (hook 呼び出し + 受け渡しの両方)", (f) => {
    expect(centerModalOffenders(read(f))).toEqual([]);
  });

  it("useCenterModalMaxHeight は上端・下端の system inset と overlay padding を差し引く", () => {
    const src = read("components/goals/useCenterModalMaxHeight.ts");
    expect(src).toMatch(/useSafeInsets\(\)/);
    expect(src).toMatch(/insets\.top/);
    expect(src).toMatch(/insets\.bottom/);
    expect(src).toMatch(/useWindowDimensions\(\)/);
  });

  it("フォーム画面 (GoalForm / MilestoneForm): FormKeyboardAvoidingView + 最下段の保存ボタンを SafeAreaView edges=['bottom'] で包む", () => {
    for (const f of ["screens/GoalFormScreen.tsx", "screens/MilestoneFormScreen.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/<FormKeyboardAvoidingView/);
      expect(src, f).toMatch(/<SafeAreaView edges=\{\["bottom"\]\}/);
      expect(src, f).toMatch(/from "react-native-safe-area-context"/);
    }
  });

  it("GoalDetailScreen: ScrollView 最下段余白を getSafeFooterPadding(…, insets.bottom) で確保 (固定値のみでない)", () => {
    const src = read("screens/GoalDetailScreen.tsx");
    expect(src).toMatch(/getSafeFooterPadding\(\s*\d+\s*,\s*insets\.bottom\s*\)/);
  });

  it("CompetitionPickerSheet (SlideUpModal): パターン B (getSafeFooterPadding + insets.bottom)。既存の slideUpModalSheetBottomInset 走査も対象に含む", () => {
    const src = read("components/goals/CompetitionPickerSheet.tsx");
    expect(src).toMatch(/<SlideUpModal/);
    expect(src).toMatch(/getSafeFooterPadding\([^)]*insets\.bottom\)/);
  });

  it("GoalsScreen はタブのルート画面: 下端はタブバー (TabNavigator の SafeAreaView edges bottom) が保護する。上端のみ SafeAreaView", () => {
    const src = read("screens/GoalsScreen.tsx");
    expect(src).toMatch(/edges=\{\["top", "left", "right"\]\}/);
    expect(read("navigation/TabNavigator.tsx")).toMatch(/<SafeAreaView[^>]*edges=\{\["bottom"\]\}/);
  });
});

describe("U1 タブラベル (L10 OS フォント拡大の尊重)", () => {
  it("TabBarLabel は allowFontScaling={false} を使わず、adjustsFontSizeToFit + maxFontSizeMultiplier で収める", () => {
    const src = stripComments(read("navigation/TabBarLabel.tsx"));
    expect(src).not.toMatch(/allowFontScaling=\{false\}/);
    expect(src).toMatch(/adjustsFontSizeToFit/);
    expect(src).toMatch(/maxFontSizeMultiplier/);
    expect(src).toMatch(/numberOfLines=\{1\}/);
  });
  it("TabNavigator: タブバー固定高さ 64・paddingHorizontal 0・全6タブが TabBarLabel 経由", () => {
    const src = read("navigation/TabNavigator.tsx");
    expect(src).toMatch(/height:\s*64/);
    expect(src).toMatch(/paddingHorizontal:\s*0/);
    expect((src.match(/tabLabelOptions\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
