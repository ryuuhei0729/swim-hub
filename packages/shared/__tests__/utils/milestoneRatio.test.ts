/**
 * computeMilestoneRatio (Sprint Contract v2 共有インターフェース / SC7)
 *
 * 目標の達成率は「マイルストーンの達成数 ÷ 全件 × 100」だけ。0件は null (画面は「未設定」で
 * % もバーも出さない)。web 詳細・mobile 詳細・管理者カード (web / mobile) の唯一の定義元。
 *
 * 壊したら赤:
 *   - 0件で 0 を返す (null と 0% の区別が消える)        -> 「0件は null」が赤
 *   - in_progress / expired / not_started を達成に数える  -> 状態別のケースが赤
 *   - 100 倍し忘れ / 丸めを関数内で行う                   -> 1/3 のケースが赤
 */
import { describe, expect, it } from "vitest";
import { computeMilestoneRatio } from "../../utils/milestoneRatio";

const ms = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("computeMilestoneRatio", () => {
  it("0件は null (0 ではない)", () => {
    expect(computeMilestoneRatio([])).toBeNull();
  });

  it("全件達成は 100", () => {
    expect(computeMilestoneRatio(ms("achieved", "achieved"))).toBe(100);
  });

  it("1件中1件達成は 100、1件中0件達成は 0 (0件の null と区別する)", () => {
    expect(computeMilestoneRatio(ms("achieved"))).toBe(100);
    expect(computeMilestoneRatio(ms("in_progress"))).toBe(0);
  });

  it("2件中1件達成は 50", () => {
    expect(computeMilestoneRatio(ms("achieved", "in_progress"))).toBe(50);
  });

  it("達成に数えるのは status === 'achieved' だけ (not_started / in_progress / expired は数えない)", () => {
    expect(computeMilestoneRatio(ms("not_started", "in_progress", "expired", "achieved"))).toBe(25);
    expect(computeMilestoneRatio(ms("not_started", "in_progress", "expired"))).toBe(0);
  });

  it("割り切れない値は丸めずに返す (表示の丸めは呼び出し側)", () => {
    expect(computeMilestoneRatio(ms("achieved", "in_progress", "in_progress"))).toBeCloseTo(100 / 3, 10);
    expect(computeMilestoneRatio(ms("achieved", "achieved", "in_progress"))).toBeCloseTo(200 / 3, 10);
  });

  it("status 以外のフィールドを持つマイルストーン (Milestone / TeamMemberMilestone) をそのまま渡せ、入力を変更しない", () => {
    const input = Object.freeze([
      Object.freeze({ id: "m1", title: "a", status: "achieved" }),
      Object.freeze({ id: "m2", title: "b", status: "expired" }),
    ]);
    expect(computeMilestoneRatio(input)).toBe(50);
    expect(input.map((m) => m.status)).toEqual(["achieved", "expired"]);
  });
});
