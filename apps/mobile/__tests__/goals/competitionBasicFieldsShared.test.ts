// v7 C: 新規大会の入力 UI (開始日/終了日・大会名・場所・水路) は切り出した表示専用コンポーネントを
// CompetitionTabFormScreen と GoalFormScreen の両方が使う (同じ UI を2か所にコピーしない)。
// ファイルの現在内容を fs で読む (git diff は使わない)。コンポーネント名・パスは App Dev の実装に依存しない形で、
// 「components/competitions/ 配下から import したコンポーネントを両画面が共有している」ことを検査する。
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const importsFromCompetitionComponents = (src: string) =>
  [...src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@\/components\/competitions\/([\w/]+)["']/g)].map((m) => ({ names: m[1]!.split(",").map((s) => s.trim()), mod: m[2]! }));

describe("CompetitionTabFormScreen と GoalFormScreen が同じ入力部品を使う", () => {
  const tab = importsFromCompetitionComponents(read("screens/CompetitionTabFormScreen.tsx"));
  const goal = importsFromCompetitionComponents(read("screens/GoalFormScreen.tsx"));

  it("両画面とも components/competitions/ から import している", () => {
    expect(goal.length).toBeGreaterThan(0);
    expect(tab.length).toBeGreaterThan(0);
  });

  it("共通で import しているモジュール (切り出したコンポーネント) が存在し、実ファイルがある", () => {
    const common = goal.filter((g) => tab.some((t) => t.mod === g.mod));
    expect(common.length).toBeGreaterThan(0);
    for (const c of common) {
      const file = path.join(ROOT, "components/competitions", `${c.mod}.tsx`);
      expect(() => readFileSync(file, "utf8"), file).not.toThrow();
    }
  });

  it("GoalFormScreen は DatePickerField を直接2か所で組み立てて新規大会の日付欄をコピーしていない (開始日/終了日は共通部品内)", () => {
    const src = read("screens/GoalFormScreen.tsx");
    expect((src.match(/<DatePickerField/g) ?? []).length).toBe(0);
  });

  it("切り出した部品は表示専用: supabase / API / navigation を import しない", () => {
    const common = goal.filter((g) => tab.some((t) => t.mod === g.mod));
    for (const c of common) {
      const src = read(`components/competitions/${c.mod}.tsx`);
      expect(src, c.mod).not.toMatch(/@\/contexts\/AuthProvider|@apps\/shared\/api|@react-navigation/);
    }
  });

  it("components/competitions に新規ファイルが増えている (空走査防止)", () => {
    expect(readdirSync(path.join(ROOT, "components/competitions")).length).toBeGreaterThan(0);
  });
});
