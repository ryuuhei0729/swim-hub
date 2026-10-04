// =============================================================================
// __tests__/goals/goalsNavigationAndEntry.test.tsx  (D3, D9, S13, U1 確定)
// =============================================================================
// U1 確定: 6つ目のタブ「目標」。実ナビゲーションの検証 (タブ順・遷移) は
//   __tests__/navigation-integration/goalsTab.integration.test.tsx (test:nav) が担当。
// 本ファイルは「ファイルの現在内容」を読む静的検査 (git diff は使わない):
//   - MyPage に目標の入口が無い (D9)
//   - Dashboard の振り返りモーダルが目標タブへ遷移する (D7)
//   - 大会削除の経路が shared hook のみ (S13)
//   - MainStack の param list 型 (tsc 側で pin: 下の型代入)
// 壊したら赤: MyPage に navigate("Goals") を足す / Dashboard の遷移先を stack の Goals に変える /
//   mobile が RecordAPI.deleteCompetition を直接呼ぶ
// =============================================================================
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { MainStackParamList, TabParamList } from "@/navigation/types";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (["node_modules", "__tests__", "ios", "android", ".expo", "__mocks__"].includes(e)) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

describe("型 (素の代入 + tsc で pin。expectTypeOf は無音で通るので使わない)", () => {
  it("MainStackParamList / TabParamList の目標関連エントリ", () => {
    const detail: MainStackParamList["GoalDetail"] = { goalId: "g" };
    const formNew: MainStackParamList["GoalForm"] = {};
    const formEdit: MainStackParamList["GoalForm"] = { goalId: "g" };
    const ms: MainStackParamList["MilestoneForm"] = { goalId: "g" };
    const msEdit: MainStackParamList["MilestoneForm"] = { goalId: "g", milestoneId: "m" };
    const tab: TabParamList["Goals"] = undefined;
    expect([detail, formNew, formEdit, ms, msEdit, tab].length).toBe(6);
  });
});

describe("D9 入口: MyPage に何も足さない", () => {
  it("MyPageScreen.tsx に目標への遷移・目標キーの参照が無い", () => {
    const src = read("screens/MyPageScreen.tsx");
    expect(src).not.toMatch(/["']Goals["']/);
    expect(src).not.toMatch(/["']GoalDetail["']|["']GoalForm["']|["']MilestoneForm["']/);
    expect(src).not.toMatch(/t\(["'`]goals\./);
  });
});

describe("D7 Dashboard のマイルストーン振り返りから目標タブへ", () => {
  it("DashboardScreen は navigate('MainTabs', { screen: 'Goals' }) を使い、GoalForm 等の stack 画面へは飛ばさない", () => {
    const src = read("screens/DashboardScreen.tsx");
    const hits = src.match(/navigation\.navigate\("MainTabs", \{ screen: "Goals" \}\)/g) ?? [];
    expect(hits.length).toBe(1); // マイルストーン用モーダルの onGoToGoals のみ (目標用は v6 で廃止)
    expect(src).not.toMatch(/<GoalReflectionModal[^>]*onGoToGoals/);
    expect(src).not.toMatch(/navigate\("Goals"/);
  });
});

describe("S13 大会削除の経路は shared の useDeleteCompetitionMutation のみ", () => {
  it("mobile のソースが RecordAPI.deleteCompetition を直接呼んでいない (invalidate 経路を迂回しない)", () => {
    const offenders = walk(ROOT).filter((f) => /\.deleteCompetition\(/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
  it("useDeleteCompetitionMutation の利用箇所は useDayDetailHandlers に実在する (空走査防止)", () => {
    const users = walk(ROOT).filter((f) => /useDeleteCompetitionMutation/.test(readFileSync(f, "utf8")));
    expect(users.map((f) => path.relative(ROOT, f))).toContain(path.join("hooks", "useDayDetailHandlers.ts"));
  });
});
