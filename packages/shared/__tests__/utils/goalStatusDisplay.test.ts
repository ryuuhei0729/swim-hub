/**
 * goal 3種 / milestone 4種のステータス表示対応表 (Sprint Contract v1)。
 * 網羅性と、labelKey が 5 言語の `teamMemberGoals.` 配下に実在することを見る。
 */
import { describe, expect, it } from "vitest";
import { GOAL_STATUS_DISPLAY, MILESTONE_STATUS_DISPLAY } from "../../utils/goalStatusDisplay";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import ko from "../../messages/ko.json";
import de from "../../messages/de.json";

const LOCALES = { ja, en, zh, ko, de } as Record<string, unknown>;
const TONES = ["success", "info", "warning", "neutral"];

function lookup(tree: unknown, dotted: string): unknown {
  let cur: unknown = tree;
  for (const p of dotted.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

describe("GOAL_STATUS_DISPLAY / MILESTONE_STATUS_DISPLAY", () => {
  it("goal status は active / achieved / cancelled の3種ちょうど", () => {
    expect(Object.keys(GOAL_STATUS_DISPLAY).sort()).toEqual(["achieved", "active", "cancelled"]);
  });
  it("milestone status は not_started / in_progress / achieved / expired の4種ちょうど", () => {
    expect(Object.keys(MILESTONE_STATUS_DISPLAY).sort()).toEqual([
      "achieved", "expired", "in_progress", "not_started",
    ]);
  });
  it("labelKey は状態名に対応する (取り違え防止)", () => {
    for (const [k, v] of Object.entries(GOAL_STATUS_DISPLAY)) expect(v.labelKey).toBe(`status.goal.${k}`);
    for (const [k, v] of Object.entries(MILESTONE_STATUS_DISPLAY)) expect(v.labelKey).toBe(`status.milestone.${k}`);
  });
  it("tone は定義済みの4種のみ。達成=success, 期限切れ=warning, 進行中=info", () => {
    for (const v of [...Object.values(GOAL_STATUS_DISPLAY), ...Object.values(MILESTONE_STATUS_DISPLAY)]) {
      expect(TONES).toContain(v.tone);
    }
    expect(GOAL_STATUS_DISPLAY.achieved.tone).toBe("success");
    expect(MILESTONE_STATUS_DISPLAY.achieved.tone).toBe("success");
    expect(MILESTONE_STATUS_DISPLAY.expired.tone).toBe("warning");
    expect(MILESTONE_STATUS_DISPLAY.in_progress.tone).toBe("info");
    expect(GOAL_STATUS_DISPLAY.cancelled.tone).toBe("neutral");
    expect(MILESTONE_STATUS_DISPLAY.not_started.tone).toBe("neutral");
  });

  const allKeys = [
    ...Object.values(GOAL_STATUS_DISPLAY),
    ...Object.values(MILESTONE_STATUS_DISPLAY),
  ].map((v) => `teamMemberGoals.${v.labelKey}`);

  it("アンカー: 検証対象のキーは7件", () => {
    expect(allKeys).toHaveLength(7);
  });

  for (const [loc, tree] of Object.entries(LOCALES)) {
    it(`${loc}: 全 labelKey が空でない文字列として存在する`, () => {
      for (const key of allKeys) {
        const v = lookup(tree, key);
        expect(typeof v, `${loc}:${key}`).toBe("string");
        expect((v as string).length, `${loc}:${key}`).toBeGreaterThan(0);
      }
    });
  }
});
