// =============================================================================
// shared/constants/goals.test.ts  (S4, D1)
// =============================================================================
// 期待値は D1 前の web (_components/constants.ts, templates/milestoneTemplates.ts) の値のリテラル。
// defaultParams は共有参照のため、mobile が破壊しないことの担保は mobile 側テストで行う。
// 壊したら赤: 初期値変更 / style 小文字化 / web 側での再定義 (fs 検査)
// =============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SWIM_STYLES } from "../../types/common";
import {
  DEFAULT_REPS_TIME_PARAMS,
  DEFAULT_SET_PARAMS,
  DEFAULT_TIME_PARAMS,
  MILESTONE_TEMPLATES,
} from "../../constants/goals";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import ko from "../../messages/ko.json";
import de from "../../messages/de.json";

const APPS = path.resolve(__dirname, "../../..");
const GOALS_WEB = path.join(APPS, "web/app/[locale]/(authenticated)/goals/_components");

describe("DEFAULT_*_PARAMS", () => {
  it("TIME", () => {
    expect(DEFAULT_TIME_PARAMS).toEqual({ distance: 50, target_time: 30, style: "Fr", swim_category: "Swim" });
  });
  it("REPS_TIME", () => {
    expect(DEFAULT_REPS_TIME_PARAMS).toEqual({
      distance: 50, reps: 10, sets: 1, target_average_time: 30, style: "Fr", swim_category: "Swim", circle: 45,
    });
  });
  it("SET", () => {
    expect(DEFAULT_SET_PARAMS).toEqual({
      distance: 200, reps: 4, sets: 3, circle: 140, style: "Fr", swim_category: "Swim",
    });
  });
  it("style は canonical SWIM_STYLES の要素", () => {
    for (const p of [DEFAULT_TIME_PARAMS, DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS]) {
      expect((SWIM_STYLES as readonly string[]).includes(p.style)).toBe(true);
    }
  });
});

describe("MILESTONE_TEMPLATES", () => {
  it("id が ['time_trial','goalset_50m_6x3'] と厳密一致 (順序含む)", () => {
    expect(MILESTONE_TEMPLATES.map((t) => t.id)).toEqual(["time_trial", "goalset_50m_6x3"]);
  });
  it("time_trial", () => {
    expect(MILESTONE_TEMPLATES[0]).toEqual({
      id: "time_trial", nameKey: "timeTrial", descriptionKey: "timeTrialDesc", type: "time", category: "any",
      defaultParams: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" },
    });
  });
  it("goalset_50m_6x3 (practice_pool_type は 0)", () => {
    expect(MILESTONE_TEMPLATES[1]).toEqual({
      id: "goalset_50m_6x3", nameKey: "goalSet", descriptionKey: "goalSetDesc", type: "reps_time", category: "middle",
      defaultParams: {
        distance: 50, reps: 6, sets: 3, target_average_time: 35, style: "Fr", swim_category: "Swim",
        circle: 90, practice_pool_type: 0,
      },
    });
  });
  it.each([["ja", ja], ["en", en], ["zh", zh], ["ko", ko], ["de", de]] as const)(
    "%s: nameKey / descriptionKey が goals.template.* に実在し非空",
    (_l, m) => {
      const tpl = (m.goals as unknown as { template: Record<string, string> }).template;
      for (const t of MILESTONE_TEMPLATES) {
        expect(tpl[t.nameKey], t.nameKey).toBeTruthy();
        expect(tpl[t.descriptionKey], t.descriptionKey).toBeTruthy();
      }
    },
  );
});

describe("web は shared を唯一の定義元として参照 (fs)", () => {
  it("constants.ts に DEFAULT_*_PARAMS の再定義が無く shared を参照", () => {
    const src = readFileSync(path.join(GOALS_WEB, "constants.ts"), "utf8");
    expect(src).not.toMatch(/export const DEFAULT_(TIME|REPS_TIME|SET)_PARAMS[^=]*=\s*\{/);
    expect(src).toMatch(/constants\/goals/);
  });
  it("milestoneTemplates.ts に MILESTONE_TEMPLATES の配列リテラル定義が無い", () => {
    const src = readFileSync(path.join(GOALS_WEB, "templates/milestoneTemplates.ts"), "utf8");
    expect(src).not.toMatch(/MILESTONE_TEMPLATES[^=\n]*=\s*\[/);
    expect(src).toMatch(/constants\/goals/);
  });
});
