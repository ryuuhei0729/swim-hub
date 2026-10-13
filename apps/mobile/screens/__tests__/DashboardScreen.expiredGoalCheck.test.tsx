// =============================================================================
// screens/__tests__/DashboardScreen.expiredGoalCheck.test.tsx  (S8 配線)
// =============================================================================
// 期限切れチェックの挙動本体は次の2ファイルが実行テストで担保する:
//   - hooks/__tests__/useExpiredGoalCheck.test.tsx   (判定->目標->マイルストーン順 / 1回ガード / スキップ / 連続表示)
//   - components/goals/__tests__/ReflectionModals.test.tsx (保存内容 / null ガード / 二重タップ / 失敗)
// DashboardScreen 全体の描画テストは依存が大きいため、本ファイルは「画面がそれらを正しく結線している」ことを
// ファイルの現在内容で検査する (git diff は使わない)。実画面での連続表示は実機 [E] で確認する。
// 壊したら赤: フックを使わなくなる / 目標とマイルストーンの優先を逆にする / onSkip に保存系を渡す /
//   「目標管理を見る」が目標タブに遷移しない
// =============================================================================
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "../DashboardScreen.tsx"), "utf8");
const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("DashboardScreen の期限切れチェック配線", () => {
  it("useExpiredGoalCheck(supabase, user?.id) を1回呼び、結果を分割代入で受ける", () => {
    expect((noComments.match(/useExpiredGoalCheck\(/g) ?? []).length).toBe(1);
    expect(noComments).toMatch(/useExpiredGoalCheck\(supabase,\s*user\?\.id\)/);
    for (const name of ["expiredGoal", "expiredMilestone", "handleGoalSaved", "handleMilestoneSaved", "skipGoal", "skipMilestone"]) {
      expect(noComments, name).toContain(name);
    }
  });

  it("目標の振り返りが優先: ReflectionModal は `!expiredGoal && expiredMilestone` のときだけ描画", () => {
    expect(noComments).toMatch(/\{expiredGoal && \(\s*<GoalReflectionModal/);
    expect(noComments).toMatch(/\{!expiredGoal && expiredMilestone && \(\s*<ReflectionModal/);
  });

  it("モーダルの key は対象 id (連続表示で入力 state が持ち越されない)", () => {
    expect(noComments).toMatch(/<GoalReflectionModal\s+key=\{expiredGoal\.id\}/);
    expect(noComments).toMatch(/<ReflectionModal\s+key=\{expiredMilestone\.id\}/);
  });

  it("スキップ = skip*、保存後 = handle*Saved (スキップで次を出さない / 保存で次を出す、を取り違えない)", () => {
    expect(noComments).toMatch(/<GoalReflectionModal[\s\S]*?onSkip=\{skipGoal\}[\s\S]*?onSaved=\{handleGoalSaved\}/);
    expect(noComments).toMatch(/<ReflectionModal[\s\S]*?onSkip=\{skipMilestone\}[\s\S]*?onSaved=\{handleMilestoneSaved\}/);
  });

  it("『目標管理を見る』はマイルストーン側のみ: モーダルを閉じて目標タブ (MainTabs/Goals) へ遷移。目標側には配線しない (遷移先の目標タブに過去の目標は出ないため)", () => {
    const hits = noComments.match(/skipMilestone\(\);\s*navigation\.navigate\("MainTabs", \{ screen: "Goals" \}\);/g) ?? [];
    expect(hits.length).toBe(1);
    expect((noComments.match(/onGoToGoals=/g) ?? []).length).toBe(1);
    expect(noComments).not.toMatch(/skipGoal\(\);\s*navigation\.navigate/);
    expect(noComments).not.toMatch(/<GoalReflectionModal[^>]*onGoToGoals/);
  });
});
