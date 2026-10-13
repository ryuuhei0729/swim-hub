// web の re-export が shared と同一参照であること (係数・判定の二重管理禁止, D1)
import { describe, expect, it } from "vitest";
import * as webCalc from "../../utils/goalSetCalculator";
import * as sharedCalc from "@apps/shared/utils/goalSetCalculator";
import { runMilestoneJudgment as webJudge } from "../../utils/milestoneJudgment";
import { runMilestoneJudgment as sharedJudge } from "@apps/shared/utils/milestoneJudgment";

describe("web re-export === shared", () => {
  it("goalSetCalculator の3関数が同一参照", () => {
    expect(webCalc.calculateGoalSetTargetTime).toBe(sharedCalc.calculateGoalSetTargetTime);
    expect(webCalc.calculateAge).toBe(sharedCalc.calculateAge);
    expect(webCalc.getStyleCoefficient).toBe(sharedCalc.getStyleCoefficient);
  });
  it("runMilestoneJudgment が同一参照", () => {
    expect(webJudge).toBe(sharedJudge);
  });
});
